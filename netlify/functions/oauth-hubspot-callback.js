/**
 * HubSpot OAuth Callback - Handles OAuth redirect
 * Route: /api/oauth-hubspot-callback
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
      Location: `${siteUrl}/#/settings?oauth=error&provider=hubspot&message=${encodeURIComponent(message)}`,
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

    // Verify state
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !stateData) {
      return redirectWithError('Invalid or expired authorization state');
    }

    // Exchange code for tokens
    const redirectUri = `${siteUrl}/api/oauth-hubspot-callback`;
    
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('[OAuth HubSpot] Token error:', tokens);
      return redirectWithError(tokens.message || 'Token exchange failed');
    }

    // Get HubSpot account info
    const accountResponse = await fetch('https://api.hubapi.com/integrations/v1/me', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });
    const accountInfo = await accountResponse.json();

    const tokenExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    // Store connection
    await supabase
      .from('oauth_connections')
      .upsert({
        user_id: stateData.user_id,
        provider: 'hubspot',
        access_token: encrypt(tokens.access_token),
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : tokens.refresh_token,
        token_expires_at: tokenExpiresAt.toISOString(),
        scopes: tokens.scope ? tokens.scope.split(' ') : [],
        account_email: accountInfo.user,
        account_name: accountInfo.hub_domain || `Portal ${accountInfo.portal_id}`,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    // Clean up state
    await supabase.from('oauth_states').delete().eq('state', state);

    let successUrl = stateData.return_url || `${siteUrl}/#/settings`;
    if (successUrl.includes('?')) {
      successUrl += '&oauth=success&provider=hubspot';
    } else {
      successUrl += '?oauth=success&provider=hubspot';
    }

    return {
      statusCode: 302,
      headers: { Location: successUrl },
      body: '',
    };

  } catch (error) {
    console.error('[OAuth HubSpot Callback] Error:', error);
    return redirectWithError('Internal server error');
  }
};
