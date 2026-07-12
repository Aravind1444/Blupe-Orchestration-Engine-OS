/**
 * Telegram API Proxy
 * Route: /api/telegram-api
 */

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
    const { botToken, chatId, text } = body;

    // Rate limiting check
    if (authResult.user && authResult.user.id !== 'service_role') {
      const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
        p_user_id: authResult.user.id,
        p_endpoint: 'telegram-api',
        p_max_requests: 100,
        p_window_minutes: 60
      });
      if (rateLimitError) {
        console.error('[RateLimit] Error checking rate limit in Telegram proxy:', rateLimitError);
      } else if (!allowed) {
        return {
          statusCode: 429,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
        };
      }
    }

    // Credit deduction check
    const billingResult = await enforceBilling(authResult, 'telegram-api', body);
    if (!billingResult.allowed) {
      return {
        statusCode: billingResult.statusCode || 402,
        headers: corsHeaders,
        body: JSON.stringify({ error: billingResult.error })
      };
    }

    if (!botToken) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'botToken is required' }) };
    }
    if (!chatId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'chatId is required' }) };
    }

    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    const tgResData = await tgResponse.json();

    return {
      statusCode: tgResponse.status,
      headers: corsHeaders,
      body: JSON.stringify(tgResData),
    };

  } catch (err) {
    console.error('[Telegram API Proxy] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: err.message }),
    };
  }
};
