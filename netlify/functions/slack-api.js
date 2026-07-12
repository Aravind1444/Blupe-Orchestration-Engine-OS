import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { enforceBilling } from './utils/billing.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };
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
    const requestBody = JSON.parse(event.body || '{}');
    const { endpoint, method = 'POST', body, token } = requestBody;

    // Rate limiting check
    if (authResult.user && authResult.user.id !== 'service_role') {
      const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
        p_user_id: authResult.user.id,
        p_endpoint: 'slack-api',
        p_max_requests: 100,
        p_window_minutes: 60
      });
      if (rateLimitError) {
        console.error('[RateLimit] Error checking rate limit in Slack proxy:', rateLimitError);
      } else if (!allowed) {
        return {
          statusCode: 429,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
        };
      }
    }

    // Credit deduction check
    const billingResult = await enforceBilling(authResult, 'slack-api', requestBody);
    if (!billingResult.allowed) {
      return {
        statusCode: billingResult.statusCode || 402,
        headers: corsHeaders,
        body: JSON.stringify({ error: billingResult.error })
      };
    }

    if (!endpoint) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing endpoint' }) };
    }

    const slackUrl = `https://slack.com/api/${endpoint}`;
    
    // Auth header from payload (token) or request header
    const authHeader = token ? `Bearer ${token}` : event.headers.authorization;

    if (!authHeader) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Missing Authentication' }) };
    }

    const response = await fetch(slackUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('Slack API Proxy Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
