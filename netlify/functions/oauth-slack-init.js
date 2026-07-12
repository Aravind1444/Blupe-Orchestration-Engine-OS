/**
 * Slack OAuth Init - Initiates OAuth flow
 * Route: /api/oauth-slack-init
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requireUser } from './utils/auth.js';
import { sanitizeReturnUrl } from './utils/returnUrl.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  // Auth required — bind OAuth to session user only
  const authResult = await requireUser(event);
  if (authResult.error) {
    return {
      statusCode: authResult.status || 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: authResult.error }),
    };
  }
  if (!authResult.user?.id || authResult.user.id === 'service_role') {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Valid user session required' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const userId = authResult.user.id;
    const returnUrl = sanitizeReturnUrl(body.returnUrl, process.env.SITE_URL);

    // Generate state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store state temporarily
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await supabase.from('oauth_states').insert({
      state,
      user_id: userId,
      provider: 'slack',
      return_url: returnUrl,
      expires_at: expiresAt.toISOString(),
    });

    // Slack OAuth scopes
    const scopes = [
      'chat:write',
      'chat:write.public',
      'channels:read',
      'users:read',
    ].join(',');

    const siteUrl = process.env.SITE_URL || 'https://blupe.space';
    const redirectUri = `${siteUrl}/api/oauth-slack-callback`;

    const authUrl = new URL('https://slack.com/oauth/v2/authorize');
    authUrl.searchParams.set('client_id', process.env.SLACK_CLIENT_ID);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ authUrl: authUrl.toString() }),
    };

  } catch (error) {
    console.error('[OAuth Slack Init] Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
