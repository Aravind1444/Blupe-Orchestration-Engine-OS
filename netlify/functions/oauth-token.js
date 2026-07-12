/**
 * Return a decrypted access token for the authenticated user.
 * Route: /api/oauth-token?provider=google
 * Never expose refresh tokens to the client.
 */

import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { decrypt, encrypt } from './secrets.js';
import { getCorsHeaders } from './utils/cors.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  const corsHeaders = getCorsHeaders(event, true);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authResult = await requireUser(event);
  if (authResult.error || !authResult.user?.id || authResult.user.id === 'service_role') {
    return {
      statusCode: authResult.status || 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: authResult.error || 'Authentication required' }),
    };
  }

  try {
    const provider =
      event.queryStringParameters?.provider ||
      (event.body ? JSON.parse(event.body || '{}').provider : null);

    if (!provider) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing provider' }),
      };
    }

    const { data: connection, error } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('user_id', authResult.user.id)
      .eq('provider', provider)
      .maybeSingle();

    if (error || !connection) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Connection not found' }),
      };
    }

    let accessToken = decrypt(connection.access_token);
    if (accessToken === '[Decryption Failed]') {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to decrypt access token' }),
      };
    }

    // Refresh if expired
    if (connection.token_expires_at) {
      const expiresAt = new Date(connection.token_expires_at).getTime();
      if (Date.now() + 5 * 60 * 1000 > expiresAt && connection.refresh_token) {
        const plainRefresh = decrypt(connection.refresh_token);
        if (plainRefresh && plainRefresh !== '[Decryption Failed]') {
          // Best-effort refresh via provider-specific endpoint is complex;
          // return current token and let client call refresh if needed.
          // For Google-style, try generic refresh when secrets present.
          try {
            const refreshed = await tryRefresh(provider, plainRefresh);
            if (refreshed?.access_token) {
              accessToken = refreshed.access_token;
              const tokenExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000);
              await supabase
                .from('oauth_connections')
                .update({
                  access_token: encrypt(refreshed.access_token),
                  token_expires_at: tokenExpiresAt.toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('user_id', authResult.user.id)
                .eq('provider', provider);
            }
          } catch (e) {
            console.warn('[oauth-token] refresh failed, returning existing token:', e.message);
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        access_token: accessToken,
        expires_at: connection.token_expires_at,
        account_email: connection.account_email,
        provider,
      }),
    };
  } catch (err) {
    console.error('[oauth-token]', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
}

async function tryRefresh(provider, refreshToken) {
  if (provider === 'google') {
    const tokenParams = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });
    const tokens = await tokenResponse.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);
    return tokens;
  }
  if (provider === 'microsoft') {
    const tokenParams = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/.default offline_access',
    });
    const tokenResponse = await fetch(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      }
    );
    const tokens = await tokenResponse.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);
    return tokens;
  }
  return null;
}
