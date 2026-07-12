import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requireUser } from './utils/auth.js';
import { sanitizeReturnUrl } from './utils/returnUrl.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event, context) {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authResult = await requireUser(event);
  if (authResult.error) {
    return { statusCode: authResult.status || 401, headers, body: JSON.stringify({ error: authResult.error }) };
  }
  if (!authResult.user?.id || authResult.user.id === 'service_role') {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Valid user session required' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const userId = authResult.user.id;
    const returnUrl = sanitizeReturnUrl(body.returnUrl, process.env.SITE_URL);

    if (!process.env.STRIPE_CLIENT_ID) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Stripe configuration missing' }) };
    }

    // Generate CSRF state
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state
    const { error: stateError } = await supabase
      .from('oauth_states')
      .insert({
        state,
        user_id: userId,
        provider: 'stripe',
        return_url: returnUrl || '',
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 mins
      });

    if (stateError) {
      console.error('State store error:', stateError);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database error' }) };
    }

    // Construct Auth URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.STRIPE_CLIENT_ID,
      scope: 'read_write',
      state: state
    });

    const authUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ authUrl })
    };

  } catch (error) {
    console.error('Stripe Init Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
