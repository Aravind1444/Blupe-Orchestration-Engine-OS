import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { getCorsHeaders } from './utils/cors.js';

export async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-flow-id, x-flow-owner-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authResult = await requireUser(event);
  if (authResult.error) {
    return {
      statusCode: authResult.status || 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: authResult.error }),
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[RunHistory] Missing Supabase credentials');
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Configuration Error' }) };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { flowId, runData } = JSON.parse(event.body || '{}');

    if (!flowId || !runData) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    // Resolve owner from auth or published flow — never trust client ownerId
    let ownerId = authResult.user.id;
    if (authResult.user.role === 'flow_owner' && authResult.user.flowId === flowId) {
      ownerId = authResult.user.id; // already the flow owner id from requireUser
    } else if (authResult.user.id !== 'service_role') {
      const { data: flow } = await supabase
        .from('flows')
        .select('id, user_id')
        .eq('id', flowId)
        .maybeSingle();

      if (!flow) {
        console.warn(`[RunHistory] Flow ${flowId} not found. Skipping DB logging.`);
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, warning: 'Flow not saved to database. Skipped DB run log.' }),
        };
      }

      // Authenticated users may only log against their own flows
      if (flow.user_id !== authResult.user.id) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Not authorized to log runs for this flow' }),
        };
      }
      ownerId = flow.user_id;
    }

    const { data: flowExists } = await supabase
      .from('flows')
      .select('id')
      .eq('id', flowId)
      .maybeSingle();

    if (!flowExists) {
      console.warn(`[RunHistory] Flow ${flowId} not found in database. Skipping DB logging.`);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, warning: 'Flow not saved to database. Skipped DB run log.' }),
      };
    }

    const { error } = await supabase.from('run_history').insert({
      flow_id: flowId,
      user_id: ownerId,
      status: runData.status,
      duration: runData.duration,
      credits_used: runData.creditsUsed || 0,
      logs: runData.logs,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[RunHistory] Supabase Insert Error:', error);
      throw error;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('[RunHistory] Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
}
