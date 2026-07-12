/**
 * Microsoft OAuth Callback - Handles OAuth redirect
 * Route: /api/oauth-microsoft-callback
 */

import { createClient } from '@supabase/supabase-js';
import { encrypt } from './secrets.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  const { code, state, error: oauthError } = event.queryStringParameters || {};
  const siteUrl = process.env.SITE_URL || 'https://blupe.space';

  const redirectWithError = (message) => ({
    statusCode: 302,
    headers: {
      Location: `${siteUrl}/#/settings?oauth=error&provider=microsoft&message=${encodeURIComponent(message)}`,
    },
    body: '',
  });

  try {
    if (oauthError) {
      return redirectWithError('Authorization denied by user');
    }

    if (!code || !state) {
      return redirectWithError('Missing authorization code or state');
    }

    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .eq('provider', 'microsoft')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !stateData) {
      return redirectWithError('Invalid or expired authorization state');
    }

    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      return redirectWithError('Microsoft OAuth is not configured');
    }

    const redirectUri = `${siteUrl}/api/oauth-microsoft-callback`;
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || tokens.error) {
      return redirectWithError(tokens.error_description || 'Token exchange failed');
    }

    const meResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = await meResponse.json();

    const tokenExpiresAt = new Date(Date.now() + (Number(tokens.expires_in || 3600) * 1000));

    const { error: upsertError } = await supabase
      .from('oauth_connections')
      .upsert({
        user_id: stateData.user_id,
        provider: 'microsoft',
        access_token: encrypt(tokens.access_token),
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : tokens.refresh_token,
        token_expires_at: tokenExpiresAt.toISOString(),
        scopes: tokens.scope ? tokens.scope.split(' ') : [],
        account_email: me.mail || me.userPrincipalName || '',
        account_name: me.displayName || 'Microsoft Account',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (upsertError) {
      return redirectWithError('Failed to save Microsoft connection');
    }

    await supabase.from('oauth_states').delete().eq('state', state);

    let successUrl = stateData.return_url || `${siteUrl}/#/settings`;
    if (successUrl.includes('?')) {
      successUrl += '&oauth=success&provider=microsoft';
    } else {
      successUrl += '?oauth=success&provider=microsoft';
    }

    return {
      statusCode: 302,
      headers: { Location: successUrl },
      body: '',
    };
  } catch (error) {
    console.error('[OAuth Microsoft Callback] Error:', error);
    return redirectWithError('Internal server error');
  }
};
