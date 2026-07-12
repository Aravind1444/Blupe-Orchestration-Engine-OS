/**
 * Microsoft OAuth Init - Initiates OAuth flow
 * Route: /api/oauth-microsoft-init
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

    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Microsoft OAuth is not configured' }),
      };
    }

    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const siteUrl = process.env.SITE_URL || 'https://blupe.space';

    const { error: stateError } = await supabase.from('oauth_states').insert({
      state,
      user_id: userId,
      provider: 'microsoft',
      return_url: returnUrl || `${siteUrl}/#/settings`,
      expires_at: expiresAt.toISOString(),
    });

    if (stateError) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to create OAuth state' }),
      };
    }

    const redirectUri = `${siteUrl}/api/oauth-microsoft-callback`;
    const scope = [
      'offline_access',
      'openid',
      'profile',
      'email',
      'User.Read',
      'Files.ReadWrite',
      'Sites.ReadWrite.All',
    ].join(' ');

    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', process.env.MICROSOFT_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ authUrl: authUrl.toString() }),
    };
  } catch (error) {
    console.error('[OAuth Microsoft Init] Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
