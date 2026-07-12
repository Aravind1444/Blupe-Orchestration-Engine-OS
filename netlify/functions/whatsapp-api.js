/**
 * WhatsApp API Proxy
 * Route: /api/whatsapp-api
 */

import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { enforceBilling } from './utils/billing.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Enforce authentication
  const authResult = await requireUser(event);
  if (authResult.error) {
    return {
      statusCode: authResult.status || 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: authResult.error })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { wabaId, phoneNumberId, accessToken: bodyAccessToken, payload } = body;

    // Rate limiting check
    if (authResult.user && authResult.user.id !== 'service_role') {
      const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
        p_user_id: authResult.user.id,
        p_endpoint: 'whatsapp-api',
        p_max_requests: 100,
        p_window_minutes: 60
      });
      if (rateLimitError) {
        console.error('[RateLimit] Error checking rate limit in WhatsApp proxy:', rateLimitError);
      } else if (!allowed) {
        return {
          statusCode: 429,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
        };
      }
    }

    // Credit deduction check
    const billingResult = await enforceBilling(authResult, 'whatsapp-api', body);
    if (!billingResult.allowed) {
      return {
        statusCode: billingResult.statusCode || 402,
        headers: corsHeaders,
        body: JSON.stringify({ error: billingResult.error })
      };
    }

    if (!phoneNumberId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'phone_number_id is required' }) };
    }

    // Resolve WhatsApp access token
    let accessToken = bodyAccessToken || process.env.WHATSAPP_ACCESS_TOKEN;

    // Check user's oauth_connections if JWT is provided
    if (authResult.user && authResult.user.id !== 'service_role' && authResult.user.role !== 'flow_owner') {
      const { data: conn } = await supabase
        .from('oauth_connections')
        .select('access_token')
        .eq('user_id', authResult.user.id)
        .eq('provider', 'whatsapp')
        .maybeSingle();
      if (conn?.access_token) {
        accessToken = conn.access_token;
      }
    }

    if (!accessToken) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'WhatsApp Access Token not configured. Connect your WhatsApp account or set WHATSAPP_ACCESS_TOKEN.' }),
      };
    }

    const waResponse = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const waResData = await waResponse.json();

    return {
      statusCode: waResponse.status,
      headers: corsHeaders,
      body: JSON.stringify(waResData),
    };

  } catch (err) {
    console.error('[WhatsApp API Proxy] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: err.message }),
    };
  }
};
