/**
 * Google OAuth Callback - Handles OAuth redirect
 * Route: /api/oauth-google-callback
 */

import { createClient } from '@supabase/supabase-js';
import { encrypt } from './secrets.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event) {
  const { code, state, error: oauthError } = event.queryStringParameters || {};

  // Build redirect helper
  const siteUrl = process.env.SITE_URL || 'https://blupe.space';
  
  const redirectWithError = (message) => ({
    statusCode: 302,
    headers: {
      Location: `${siteUrl}/#/settings?oauth=error&message=${encodeURIComponent(message)}`,
    },
    body: '',
  });

  const redirectWithSuccess = (returnUrl) => ({
    statusCode: 302,
    headers: {
      Location: returnUrl || `${siteUrl}/#/settings?oauth=success&provider=google`,
    },
    body: '',
  });

  try {
    // Handle OAuth errors from Google
    if (oauthError) {
      console.error('[OAuth Google] Error from Google:', oauthError);
      return redirectWithError('Authorization denied by user');
    }

    if (!code || !state) {
      return redirectWithError('Missing authorization code or state');
    }

    // Verify state token
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !stateData) {
      console.error('[OAuth Google] Invalid state:', stateError);
      return redirectWithError('Invalid or expired authorization state');
    }

    // Exchange code for tokens
    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const redirectUri = `${siteUrl}/api/oauth-google-callback`;

    const tokenParams = new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('[OAuth Google] Token error:', tokens);
      return redirectWithError(tokens.error_description || 'Token exchange failed');
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoResponse.json();

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    // Store tokens in oauth_connections (upsert)
    const { error: upsertError } = await supabase
      .from('oauth_connections')
      .upsert({
        user_id: stateData.user_id,
        provider: 'google',
        access_token: encrypt(tokens.access_token),
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : tokens.refresh_token,
        token_expires_at: tokenExpiresAt.toISOString(),
        scopes: tokens.scope ? tokens.scope.split(' ') : [],
        account_email: userInfo.email,
        account_name: userInfo.name,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (upsertError) {
      console.error('[OAuth Google] Upsert error:', upsertError);
      return redirectWithError('Failed to save connection');
    }

    // Clean up state
    await supabase.from('oauth_states').delete().eq('state', state);

    // Build success redirect URL
    let successUrl = stateData.return_url || `${siteUrl}/#/settings`;
    if (successUrl.includes('?')) {
      successUrl += '&oauth=success&provider=google';
    } else {
      successUrl += '?oauth=success&provider=google';
    }

    return redirectWithSuccess(successUrl);

  } catch (error) {
    console.error('[OAuth Google Callback] Error:', error);
    return redirectWithError('Internal server error');
  }
};
