/**
 * Telegram Webhook Handler
 * Route: /api/webhook/telegram?flowId={flowId}
 *
 * Auth (per-flow preferred):
 *  1. Load flow by flowId
 *  2. Match X-Telegram-Bot-Api-Secret-Token to telegram_trigger.telegramWebhookSecret
 *     (or legacy platform TELEGRAM_WEBHOOK_SECRET if node secret not set)
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getWebhookCorsHeaders } from './utils/cors.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function safeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function handler(event, context) {
  const corsHeaders = getWebhookCorsHeaders();

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const query = event.queryStringParameters || {};
    const flowId = query.flowId;

    if (!flowId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing flowId parameter' }),
      };
    }

    const secretToken =
      event.headers['x-telegram-bot-api-secret-token'] ||
      event.headers['X-Telegram-Bot-Api-Secret-Token'] ||
      '';

    if (!secretToken) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing secret token' }),
      };
    }

    const { data: flow, error: flowError } = await supabase
      .from('flows')
      .select('id, content')
      .eq('id', flowId)
      .eq('webhook_enabled', true)
      .single();

    if (flowError || !flow) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Flow not found or not active' }),
      };
    }

    const nodes = flow.content?.nodes || [];
    const triggerNode = nodes.find((n) => (n.data?.type || n.type) === 'telegram_trigger');
    if (!triggerNode) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Telegram trigger not configured in this flow' }),
      };
    }

    // Per-flow secret preferred; platform env is legacy fallback only
    const flowSecret =
      triggerNode.data?.telegramWebhookSecret ||
      triggerNode.data?.telegramSecretToken ||
      '';
    const platformSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    const expected = flowSecret || platformSecret;

    if (!expected) {
      console.error('[Telegram Webhook] No per-flow or platform secret configured');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Webhook secret not configured for this flow' }),
      };
    }

    if (!safeEqualStr(secretToken, expected)) {
      console.warn('[Telegram Webhook] Secret token validation failed for flow', flowId);
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Unauthorized secret token' }),
      };
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '');
    const body = JSON.parse(rawBody || '{}');
    const message = body.message;

    if (!message) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ status: 'ignored', reason: 'No message payload' }),
      };
    }

    const payload = {
      chatId: message.chat?.id,
      text: message.text || '',
      username: message.from?.username,
      firstName: message.from?.first_name,
      messageId: message.message_id,
      raw: body,
    };

    const { data: queueEntry, error: queueError } = await supabase
      .from('webhook_queue')
      .insert({
        flow_id: flowId,
        payload,
        status: 'pending',
      })
      .select('id')
      .single();

    if (queueError) {
      console.error('[Telegram Webhook] Queue insertion failed:', queueError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to queue webhook' }),
      };
    }

    const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/execute-flow`;
    fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        type: 'direct',
        flowId,
        payload,
        queueId: queueEntry.id,
      }),
    }).catch((err) => console.error('[Telegram Webhook] Edge trigger error:', err.message));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, queued: true }),
    };
  } catch (err) {
    console.error('[Telegram Webhook] Process error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: err.message }),
    };
  }
}
