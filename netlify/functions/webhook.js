/**
 * Webhook Handler - Inbound HTTP requests for triggering flows
 * Route: /api/webhook/{flowId}
 * 
 * Supports:
 * - GET, POST, PUT, DELETE methods
 * - JSON and form-data payloads
 * - Optional API key authentication
 * - Rate limiting (100 requests/hour per flow per IP)
 * - Async/sync response modes
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Constant-time comparison of secrets (hashing first normalizes length)
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export async function handler(event, context) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      },
      body: '',
    };
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // Extract flowId from path: /api/webhook/{flowId}
    const pathParts = event.path.split('/');
    const flowId = pathParts[pathParts.length - 1];

    if (!flowId || flowId === 'webhook') {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing flow ID in URL' }),
      };
    }

    const method = event.httpMethod;
    const clientIp = event.headers['x-forwarded-for']?.split(',')[0] || 
                     event.headers['client-ip'] || 
                     'unknown';

    // Rate limiting check
    const { data: allowed, error: rateLimitError } = await supabase.rpc('check_webhook_rate_limit', {
      p_flow_id: flowId,
      p_client_ip: clientIp,
      p_limit: 100,
      p_window_hours: 1,
    });

    if (rateLimitError) {
      console.error('[Webhook] Rate limit check error:', rateLimitError);
      // Fail closed — do not accept traffic when rate limiting is broken
      return {
        statusCode: 503,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Rate limiting unavailable',
          message: 'Please try again shortly.',
        }),
      };
    } else if (allowed === false) {
      return {
        statusCode: 429,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: 'Maximum 100 requests per hour. Please try again later.',
        }),
      };
    }

    // Fetch flow and validate webhook is enabled
    const { data: flow, error: flowError } = await supabase
      .from('flows')
      .select('id, user_id, name, webhook_enabled, webhook_api_key, webhook_response_mode, content')
      .eq('id', flowId)
      .single();

    if (flowError || !flow) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Flow not found' }),
      };
    }

    if (!flow.webhook_enabled) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Webhook not enabled for this flow' }),
      };
    }

    // Optional API key validation
    if (flow.webhook_api_key) {
      const providedKey = event.headers['x-api-key'] || event.headers['X-API-Key'];
      if (!providedKey || !safeCompare(providedKey, flow.webhook_api_key)) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Invalid or missing API key' }),
        };
      }
    }

    // Parse payload
    let payload = {};
    try {
      if (event.body) {
        const contentType = event.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          payload = JSON.parse(event.body);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          // Parse form data
          const params = new URLSearchParams(event.body);
          payload = Object.fromEntries(params);
        } else {
          // Store raw body
          payload = { raw: event.body };
        }
      }
    } catch (parseError) {
      // If JSON parsing fails, store raw body
      payload = { raw: event.body };
    }

    // Add webhook metadata
    payload._webhook = {
      method,
      headers: Object.fromEntries(
        Object.entries(event.headers).filter(([k]) => 
          !k.toLowerCase().includes('authorization') && 
          !k.toLowerCase().includes('api-key')
        )
      ),
      query: event.queryStringParameters || {},
      timestamp: new Date().toISOString(),
      flowId,
      ip: clientIp,
    };

    // Queue the webhook for processing
    const { data: queueEntry, error: queueError } = await supabase
      .from('webhook_queue')
      .insert({
        flow_id: flowId,
        payload,
        status: 'pending',
      })
      .select('id')
      .single();

    if (queueError) {
      console.error('[Webhook] Queue insert error:', queueError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to queue webhook' }),
      };
    }

    // Response based on mode
    const responseMode = flow.webhook_response_mode || 'async';

    if (responseMode === 'async') {
      // Fire-and-forget: Trigger Edge Function immediately, don't wait for result
      const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/execute-flow`;
      fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          type: 'direct',
          flowId: flowId,
          payload: payload,
          queueId: queueEntry.id,
        }),
      }).catch(err => console.log('[Webhook] Edge function error (async):', err.message));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          message: 'Webhook received, execution started',
          execution_id: queueEntry.id,
          flow_id: flowId,
        }),
      };
    } else {
      // Sync mode - call Edge Function directly and wait for result
      try {
        const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/execute-flow`;
        const execResponse = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify({
            type: 'direct',
            flowId: flowId,
            payload: payload,
          }),
        });

        if (!execResponse.ok) {
          throw new Error(`Edge function error: ${execResponse.statusText}`);
        }

        const result = await execResponse.json();

        // Update queue status based on result
        await supabase
          .from('webhook_queue')
          .update({
            status: result.success ? 'completed' : 'failed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', queueEntry.id);

        return {
          statusCode: result.success ? 200 : 500,
          headers: corsHeaders,
          body: JSON.stringify({
            success: result.success,
            execution_id: queueEntry.id,
            flow_id: flowId,
            output: result.output,
            credits_used: result.creditsUsed,
            logs: result.logs?.map(l => ({ node: l.node_id, status: l.status })),
          }),
        };
      } catch (syncError) {
        console.error('[Webhook] Sync execution error:', syncError);
        
        // Update queue status to failed
        await supabase
          .from('webhook_queue')
          .update({
            status: 'failed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', queueEntry.id);

        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'Sync execution failed',
            message: syncError.message,
            execution_id: queueEntry.id,
          }),
        };
      }
    }

  } catch (error) {
    console.error('[Webhook] Unexpected error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
};
