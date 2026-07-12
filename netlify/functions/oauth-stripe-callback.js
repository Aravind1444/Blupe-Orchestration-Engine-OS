import { createClient } from '@supabase/supabase-js';
import { encrypt } from './secrets.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const { code, state } = event.queryStringParameters || {};

    if (!code || !state) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing code or state' })
      };
    }

    // specific redirect URI if set in env, else it's inferred by Stripe from settings
    // For Connect, redirect_uri is optional if only one is configured in Dashboard
    // But better to verify state first
    
    // Validate state
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .eq('provider', 'stripe')
      .single();

    if (stateError || !stateData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid or expired state' })
      };
    }

    // Cleanup state
    await supabase.from('oauth_states').delete().eq('state', state);

    // Exchange code for token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.STRIPE_CLIENT_ID,
      client_secret: process.env.STRIPE_CLIENT_SECRET,
      code: code
    });

    const tokenRes = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || tokenData.error) {
      console.error('Stripe Token Error:', tokenData);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: tokenData.error_description || 'Failed to exchange token' })
      };
    }

    // tokenData: { access_token, refresh_token, stripe_user_id, stripe_publishable_key, scope, livemode, ... }
    
    const userId = stateData.user_id;
    const stripeUserId = tokenData.stripe_user_id;

    // Check existing
    const { data: existing } = await supabase
      .from('oauth_connections')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'stripe')
      .single();

    const connectionData = {
      user_id: userId,
      provider: 'stripe',
      access_token: encrypt(tokenData.access_token),
      refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : tokenData.refresh_token, // might be undefined for some account types
      // Store stripe_user_id as account_name or similar, or just in metadata if expanded
      // For now we map stripe_user_id to account_name for display
      account_name: stripeUserId, 
      account_email: '', // Stripe doesn't always return email
      token_expires_at: null, // Standard Connect tokens limitlessly valid until revoked? Or check response
      updated_at: new Date().toISOString()
    };

    if (existing) {
      await supabase
        .from('oauth_connections')
        .update(connectionData)
        .eq('id', existing.id);
    } else {
      await supabase
        .from('oauth_connections')
        .insert(connectionData);
    }

    // Redirect user back
    let redirectUrl = stateData.return_url || `${process.env.SITE_URL || 'https://blupe.space'}/#/settings`;
    if (redirectUrl.includes('?')) {
      redirectUrl += '&oauth=success&provider=stripe';
    } else {
      redirectUrl += '?oauth=success&provider=stripe';
    }
    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl,
        'Cache-Control': 'no-cache'
      },
      body: ''
    };

  } catch (error) {
    console.error('Stripe Callback Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
