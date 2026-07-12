// Netlify Serverless Function: Fetch Public Flow
// This function fetches flow data for public access (bypasses RLS)

import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const flowId = event.queryStringParameters?.id;

        if (!flowId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Flow ID is required' })
            };
        }

        // Use service role key to bypass RLS
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('[PublicFlow] Missing Supabase credentials');
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Rate Limiting: Check if this IP has exceeded request limit for this flow
        const clientIp = event.headers['x-forwarded-for']?.split(',')[0]?.trim() 
            || event.headers['x-real-ip'] 
            || event.headers['client-ip']
            || 'unknown';
        
        const { data: isAllowed, error: rateLimitError } = await supabase.rpc('check_rate_limit', {
            p_flow_id: flowId,
            p_client_ip: clientIp,
            p_max_requests: 50,
            p_window_minutes: 60
        });

        if (rateLimitError) {
            console.warn('[PublicFlow] Rate limit check failed:', rateLimitError.message);
            // Fail closed when rate limiting infrastructure is unavailable
            return {
                statusCode: 503,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Rate limiting unavailable. Please try again shortly.' })
            };
        } else if (!isAllowed) {
            console.log(`[PublicFlow] Rate limit exceeded for IP ${clientIp} on flow ${flowId}`);
            return {
                statusCode: 429,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ 
                    error: 'Rate limit exceeded. Please wait before making more requests.',
                    retryAfter: 3600 // seconds
                })
            };
        }

        const { data, error } = await supabase
            .from('flows')
            .select('*')
            .eq('id', flowId)
            .eq('is_published', true)
            .single();

        if (error) {
            console.error('[PublicFlow] Query error:', error);
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Flow not found' })
            };
        }

        // Sanitize nodes before public return — strip secrets-like fields and versions history
        const sensitiveKeyRe = /(secret|password|token|apikey|api_key|authorization|private|credential)/i;
        const sanitizeValue = (val, key = '') => {
            if (sensitiveKeyRe.test(key) && typeof val === 'string' && val.length > 0) {
                return '';
            }
            if (Array.isArray(val)) return val.map((v, i) => sanitizeValue(v, String(i)));
            if (val && typeof val === 'object') {
                const out = {};
                for (const [k, v] of Object.entries(val)) {
                    out[k] = sanitizeValue(v, k);
                }
                return out;
            }
            return val;
        };
        const sanitizeNode = (node) => {
            if (!node || typeof node !== 'object') return node;
            // Keep executable config (JS/code) so public runners still work;
            // strip only secret-like field names.
            const data = sanitizeValue(node.data || {}, 'data');
            return {
                id: node.id,
                type: node.type,
                position: node.position,
                data,
            };
        };

        const nodes = (data.content?.nodes || []).map(sanitizeNode);
        const edges = (data.content?.edges || []).map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            type: e.type,
            label: e.label,
        }));

        // Return flow data (no version history — may contain older secrets)
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                id: data.id,
                name: data.name,
                user_id: data.user_id,
                nodes,
                edges,
                updated_at: data.updated_at
            })
        };

    } catch (error) {
        console.error('[PublicFlow] Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: error.message || 'Failed to fetch flow' })
        };
    }
}
