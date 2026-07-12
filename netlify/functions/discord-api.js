/**
 * Discord API Proxy
 * Route: /api/discord-api
 *
 * Discord's API does not allow browser CORS requests, so the editor and the
 * client-side executor route all Discord calls through this proxy.
 *
 * Actions:
 *  - send             → post a message via incoming webhook URL or bot token + channel
 *  - register_command → create/overwrite a guild-agnostic slash command for a Discord app
 *  - check_bot        → validate a bot token (GET /users/@me)
 */

import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { getCorsHeaders } from './utils/cors.js';
import { enforceBilling } from './utils/billing.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const DISCORD_API = 'https://discord.com/api/v10';

export async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // Enforce authentication
  const authResult = await requireUser(event);
  if (authResult.error) {
    return {
      statusCode: authResult.status || 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: authResult.error })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action || 'send';

    // Rate limiting check
    if (authResult.user && authResult.user.id !== 'service_role') {
      const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
        p_user_id: authResult.user.id,
        p_endpoint: 'discord-api',
        p_max_requests: 100,
        p_window_minutes: 60
      });
      if (rateLimitError) {
        console.error('[RateLimit] Error checking rate limit in Discord proxy:', rateLimitError);
      } else if (!allowed) {
        return {
          statusCode: 429,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
        };
      }
    }

    // Config-time helper actions are free; only 'send' consumes credits
    if (action === 'send') {
      const billingResult = await enforceBilling(authResult, 'discord-api', body);
      if (!billingResult.allowed) {
        return {
          statusCode: billingResult.statusCode || 402,
          headers: corsHeaders,
          body: JSON.stringify({ error: billingResult.error })
        };
      }
    }

    if (action === 'check_bot') {
      const { botToken } = body;
      if (!botToken) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'botToken is required' }) };
      }
      const res = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { 'Authorization': `Bot ${botToken}` },
      });
      const data = await res.json();
      return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (action === 'register_command') {
      const { botToken, appId, commandName, commandDescription } = body;
      if (!botToken) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'botToken is required' }) };
      }
      if (!appId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'appId is required' }) };
      }
      const name = String(commandName || 'run').replace(/^\//, '').toLowerCase();
      if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Command name must be 1-32 chars: lowercase letters, numbers, - or _' }) };
      }

      const res = await fetch(`${DISCORD_API}/applications/${appId}/commands`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description: commandDescription || 'Trigger a Bloope flow',
          type: 1, // CHAT_INPUT
          options: [
            {
              type: 3, // STRING
              name: 'message',
              description: 'Text to pass into the flow',
              required: false,
            },
          ],
        }),
      });
      const data = await res.json();
      return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify(data) };
    }

    if (action === 'send') {
      const { mode, webhookUrl, botToken, channelId, content, username } = body;

      if (!content) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'content is required' }) };
      }

      if (mode === 'webhook' || (!mode && webhookUrl)) {
        if (!webhookUrl || !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(webhookUrl)) {
          return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'A valid Discord webhook URL is required (https://discord.com/api/webhooks/...)' }) };
        }
        const res = await fetch(`${webhookUrl}?wait=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: String(content).slice(0, 2000),
            ...(username ? { username } : {}),
          }),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { ok: res.ok, raw: text }; }
        return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify(data) };
      }

      // Bot mode
      if (!botToken) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'botToken is required for bot mode' }) };
      }
      if (!channelId) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'channelId is required for bot mode' }) };
      }
      const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: String(content).slice(0, 2000) }),
      });
      const data = await res.json();
      return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify(data) };
    }

    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Unknown action: ${action}` }) };

  } catch (err) {
    console.error('[Discord API Proxy] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: err.message }),
    };
  }
}
