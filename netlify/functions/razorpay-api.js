/**
 * Razorpay API Proxy
 * Route: /api/razorpay-api
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requireUser } from './utils/auth.js';
import { decrypt } from './secrets.js';
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

  try {

    // Enforce authentication
    const authResult = await requireUser(event);
    if (authResult.error) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: authResult.error }) };
    }

    const body = JSON.parse(event.body || '{}');
    const { operation, amount, currency, description, paymentId } = body;

    // Rate limiting check
    if (authResult.user && authResult.user.id !== 'service_role') {
      const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
        p_user_id: authResult.user.id,
        p_endpoint: 'razorpay-api',
        p_max_requests: 100,
        p_window_minutes: 60
      });
      if (rateLimitError) {
        console.error('[RateLimit] Error checking rate limit in Razorpay proxy:', rateLimitError);
      } else if (!allowed) {
        return {
          statusCode: 429,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
        };
      }
    }

    // Credit deduction check
    const billingResult = await enforceBilling(authResult, 'razorpay-api', body);
    if (!billingResult.allowed) {
      return {
        statusCode: billingResult.statusCode || 402,
        headers: corsHeaders,
        body: JSON.stringify({ error: billingResult.error })
      };
    }

    // Product actions: user BYOK only — never platform merchant keys
    let keyId = null;
    let keySecret = null;

    if (authResult.user && authResult.user.id !== 'service_role') {
      const { data: userSecrets } = await supabase
        .from('user_secrets')
        .select('key_name, value')
        .eq('user_id', authResult.user.id);

      const rKeyId = userSecrets?.find(s => s.key_name === 'RAZORPAY_KEY_ID')?.value;
      const rKeySecret = userSecrets?.find(s => s.key_name === 'RAZORPAY_KEY_SECRET')?.value;

      if (rKeyId) {
        keyId = decrypt(rKeyId);
        if (keyId === '[Decryption Failed]') {
          throw new Error('Decryption failed for RAZORPAY_KEY_ID. Please verify SECRETS_MASTER_KEY matches.');
        }
      }
      if (rKeySecret) {
        keySecret = decrypt(rKeySecret);
        if (keySecret === '[Decryption Failed]') {
          throw new Error('Decryption failed for RAZORPAY_KEY_SECRET. Please verify SECRETS_MASTER_KEY matches.');
        }
      }
    }

    if (!keyId || !keySecret) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your Secrets (BYOK).' }),
      };
    }

    const authHeaderString = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    let rpUrl = '';
    let rpMethod = 'POST';
    let rpPayload = null;

    if (operation === 'Create Payment Link') {
      rpUrl = 'https://api.razorpay.com/v1/payment_links';
      rpPayload = {
        amount,
        currency,
        description,
        accept_partial: false,
        first_payment_min_amount: amount,
        reference_id: crypto.randomBytes(8).toString('hex'),
      };
    } else if (operation === 'Issue Refund') {
      if (!paymentId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Payment ID is required for refunds' }) };
      }
      rpUrl = `https://api.razorpay.com/v1/payments/${paymentId}/refund`;
      if (amount > 0) {
        rpPayload = { amount };
      } else {
        rpPayload = {};
      }
    } else if (operation === 'Fetch Payment') {
      if (!paymentId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Payment ID is required to fetch payment details' }) };
      }
      rpUrl = `https://api.razorpay.com/v1/payments/${paymentId}`;
      rpMethod = 'GET';
    } else {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Unsupported operation: ${operation}` }) };
    }

    const rpResponse = await fetch(rpUrl, {
      method: rpMethod,
      headers: {
        'Authorization': authHeaderString,
        'Content-Type': 'application/json',
      },
      body: rpMethod !== 'GET' ? JSON.stringify(rpPayload) : undefined,
    });

    const rpResData = await rpResponse.json();

    return {
      statusCode: rpResponse.status,
      headers: corsHeaders,
      body: JSON.stringify(rpResData),
    };

  } catch (err) {
    console.error('[Razorpay API Proxy] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: err.message }),
    };
  }
};
