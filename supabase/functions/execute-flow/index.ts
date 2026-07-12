// @ts-nocheck
// Supabase Edge Function: execute-flow
// Acts as a lightweight triggers proxy forwarding executions to GCP Cloud Run.

import { createClient } from 'npm:@supabase/supabase-js@2.110.2';
import * as jose from 'npm:jose';

let jwksClient: any = null;
function getJwksClient(supabaseUrl: string) {
    if (!jwksClient) {
        jwksClient = jose.createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/jwks`));
    }
    return jwksClient;
}

async function verifySupabaseJwt(token: string, supabaseUrl: string) {
    const jwtSecret = Deno.env.get('JWT_SECRET') || Deno.env.get('SUPABASE_JWT_SECRET');
    if (jwtSecret) {
        try {
            const secret = new TextEncoder().encode(jwtSecret);
            const { payload } = await jose.jwtVerify(token, secret);
            return payload;
        } catch (e: any) {
            console.warn('[Auth] Local HS256 verification failed, trying JWKS...', e.message);
        }
    }

    try {
        const JWKS = getJwksClient(supabaseUrl);
        const { payload } = await jose.jwtVerify(token, JWKS);
        return payload;
    } catch (err: any) {
        console.warn('[Auth] JWKS verification failed, falling back to auth.getUser...', err.message);
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            throw new Error(error?.message || 'Invalid session');
        }
        return { sub: user.id };
    }
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-flow-id, x-flow-owner-id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const body = await req.json().catch(() => ({}));
        const { type, flowId, payload, queueId, token, action, mode } = body;

        // 1. Authenticate request
        const authHeader = req.headers.get('Authorization') || '';
        const flowIdHeader = req.headers.get('x-flow-id') || req.headers.get('X-Flow-Id') || '';

        let userId = null;
        let isPublicRun = false;

        const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
        const isServiceCaller =
            Boolean(supabaseKey) &&
            Boolean(bearer) &&
            (bearer === supabaseKey || bearer === Deno.env.get('SUPABASE_SERVICE_KEY'));

        if (isServiceCaller) {
            // Service caller (like cron-trigger or webhook executor Netlify function)
            userId = body.userId || null;
        } else if (bearer) {
            try {
                const payload = await verifySupabaseJwt(bearer, supabaseUrl);
                if (!payload || !payload.sub) {
                    throw new Error('Invalid sub claim');
                }
                userId = payload.sub;
            } catch (err: any) {
                return new Response(
                    JSON.stringify({ error: `Unauthorized: Invalid user session: ${err.message}` }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        } else if (flowIdHeader || flowId) {
            // Guest public run (using x-flow-id header or passed flowId)
            const targetFlowId = flowIdHeader || flowId;
            const { data: flow, error } = await supabase
                .from('flows')
                .select('id, user_id, is_published')
                .eq('id', targetFlowId)
                .single();

            if (error || !flow) {
                return new Response(
                    JSON.stringify({ error: 'Flow not found or access denied' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            if (!flow.is_published) {
                return new Response(
                    JSON.stringify({ error: 'This flow is not published' }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            userId = flow.user_id; // Bill/log to the flow owner
            isPublicRun = true;
        } else {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Missing credentials' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Resolve Cloud Run Workflow Runner Endpoint
        const runnerBaseUrl = Deno.env.get('CLOUD_RUN_WORKFLOW_RUNNER_URL');
        if (!runnerBaseUrl) {
            throw new Error('CLOUD_RUN_WORKFLOW_RUNNER_URL is not configured in Supabase Edge environment.');
        }

        const isResume = type === 'resume' || (token && !flowId);
        const endpoint = isResume 
            ? `${runnerBaseUrl.replace(/\/$/, '')}/resume`
            : `${runnerBaseUrl.replace(/\/$/, '')}/execute`;

        // 3. Prepare payload to Cloud Run
        const forwardBody: Record<string, any> = {};
        if (isResume) {
            forwardBody.token = token || body.token;
            forwardBody.action = action || 'approve';
            forwardBody.mode = mode || 'production';
        } else {
            forwardBody.type = type || 'direct';
            forwardBody.flowId = flowId;
            forwardBody.payload = payload || {};
            forwardBody.queueId = queueId;
            forwardBody.nodes = body.nodes || null;
            forwardBody.edges = body.edges || null;
            forwardBody.runId = body.runId || crypto.randomUUID();
            forwardBody.userId = userId;
            forwardBody.mode = mode || 'production';
            forwardBody.triggerSource = isPublicRun 
                ? 'Public Runner' 
                : (type === 'scheduled' ? 'Schedule' : (type === 'webhook' ? 'Webhook' : 'Manual'));
        }

        // 4. Dispatch call to Cloud Run runner (authenticated via Service Role Key)
        console.log(`[Proxy] Forwarding ${isResume ? 'resume' : 'execute'} request to Cloud Run: ${endpoint}`);
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify(forwardBody)
        });

        const responseText = await response.text();
        let responseJson;
        try {
            responseJson = JSON.parse(responseText);
        } catch {
            responseJson = { error: responseText };
        }

        return new Response(JSON.stringify(responseJson), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (e: any) {
        console.error('[Proxy] Error forwarding execution request:', e);
        return new Response(
            JSON.stringify({ error: e.message || 'Internal proxy error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
