/**
 * Microsoft OAuth Token Refresh
 * Route: /api/oauth-microsoft-refresh
 */

import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { encrypt, decrypt } from './secrets.js';

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
    const { refresh_token } = JSON.parse(event.body || '{}');
    const userId = authResult.user.id;

    if (!refresh_token) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing refresh token' }),
      };
    }
    const plainRefresh = decrypt(refresh_token);

    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Microsoft OAuth is not configured' }),
      };
    }

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        refresh_token: plainRefresh || refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok || tokens.error) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Token refresh failed',
          details: tokens.error_description || tokens.error,
        }),
      };
    }

    if (userId) {
      const tokenExpiresAt = new Date(Date.now() + (Number(tokens.expires_in || 3600) * 1000));
      const updatePayload = {
        access_token: encrypt(tokens.access_token),
        token_expires_at: tokenExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (tokens.refresh_token) {
        updatePayload.refresh_token = tokens.refresh_token;
      }
      await supabase
        .from('oauth_connections')
        .update(updatePayload)
        .eq('user_id', userId)
        .eq('provider', 'microsoft');
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
      }),
    };
  } catch (error) {
    console.error('[OAuth Microsoft Refresh] Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
