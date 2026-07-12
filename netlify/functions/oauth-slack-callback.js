/**
 * Slack OAuth Callback - Handles OAuth redirect
 * Route: /api/oauth-slack-callback
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
      Location: `${siteUrl}/#/settings?oauth=error&provider=slack&message=${encodeURIComponent(message)}`,
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

    // Verify state token
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
    const redirectUri = `${siteUrl}/api/oauth-slack-callback`;
    
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokens = await tokenResponse.json();

    if (!tokens.ok) {
      console.error('[OAuth Slack] Token error:', tokens);
      return redirectWithError(tokens.error || 'Token exchange failed');
    }

    // Store connection
    await supabase
      .from('oauth_connections')
      .upsert({
        user_id: stateData.user_id,
        provider: 'slack',
        access_token: encrypt(tokens.access_token),
        refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : tokens.refresh_token,
        scopes: tokens.scope ? tokens.scope.split(',') : [],
        account_email: tokens.authed_user?.id,
        account_name: tokens.team?.name,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    // Clean up state
    await supabase.from('oauth_states').delete().eq('state', state);

    let successUrl = stateData.return_url || `${siteUrl}/#/settings`;
    if (successUrl.includes('?')) {
      successUrl += '&oauth=success&provider=slack';
    } else {
      successUrl += '?oauth=success&provider=slack';
    }

    return {
      statusCode: 302,
      headers: { Location: successUrl },
      body: '',
    };

  } catch (error) {
    console.error('[OAuth Slack Callback] Error:', error);
    return redirectWithError('Internal server error');
  }
};
