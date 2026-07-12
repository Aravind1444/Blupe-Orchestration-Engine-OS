/**
 * WhatsApp Webhook Handler
 * Route: /api/webhook/whatsapp
 *
 * Multi-tenant signature auth:
 *  - Collect app secrets from all whatsapp_trigger nodes (whatsappAppSecret)
 *  - Plus optional platform WHATSAPP_WEBHOOK_SECRET
 *  - Accept if HMAC matches any candidate secret
 *  - Route only to flows matching phone_number_id
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getWebhookCorsHeaders } from './utils/cors.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function signatureMatches(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function handler(event, context) {
  const corsHeaders = getWebhookCorsHeaders();

  // GET: Meta Verification Challenge — per-flow verify tokens only
  if (event.httpMethod === 'GET') {
    const query = event.queryStringParameters || {};
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token) {
      const { data: flows } = await supabase
        .from('flows')
        .select('content')
        .eq('webhook_enabled', true);

      const hasMatch = (flows || []).some((flow) => {
        const nodes = flow.content?.nodes || [];
        return nodes.some(
          (n) =>
            (n.data?.type || n.type) === 'whatsapp_trigger' &&
            n.data?.whatsappVerifyToken === token
        );
      });

      if (hasMatch) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'text/plain' },
          body: challenge,
        };
      }
    }

    return { statusCode: 403, body: 'Forbidden' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const signature = event.headers['x-hub-signature-256'] || event.headers['X-Hub-Signature-256'] || '';
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '');

    if (!signature) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing signature' }),
      };
    }

    // Load flows early to gather per-tenant app secrets
    const { data: flows, error: flowsError } = await supabase
      .from('flows')
      .select('id, content')
      .eq('webhook_enabled', true);

    if (flowsError) {
      console.error('[WhatsApp Webhook] Database fetch error:', flowsError);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database error' }) };
    }

    const secretCandidates = new Set();
    if (process.env.WHATSAPP_WEBHOOK_SECRET) {
      secretCandidates.add(process.env.WHATSAPP_WEBHOOK_SECRET);
    }
    for (const flow of flows || []) {
      for (const n of flow.content?.nodes || []) {
        if ((n.data?.type || n.type) !== 'whatsapp_trigger') continue;
        const s = n.data?.whatsappAppSecret || n.data?.whatsappWebhookSecret;
        if (s && typeof s === 'string') secretCandidates.add(s);
      }
    }

    if (secretCandidates.size === 0) {
      console.error('[WhatsApp Webhook] No app secrets configured (platform or per-flow)');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Webhook configuration error' }),
      };
    }

    let verified = false;
    for (const secret of secretCandidates) {
      if (signatureMatches(rawBody, signature, secret)) {
        verified = true;
        break;
      }
    }

    if (!verified) {
      console.warn('[WhatsApp Webhook] Signature verification failed against all candidate secrets');
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Signature verification failed' }),
      };
    }

    const body = JSON.parse(rawBody || '{}');
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const phone_number_id = value?.metadata?.phone_number_id;
    const message = value?.messages?.[0];

    if (!phone_number_id || !message) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ status: 'ignored', reason: 'No message payload' }),
      };
    }

    const payload = {
      messageId: message.id,
      from: message.from,
      sender: value?.contacts?.[0]?.profile?.name || message.from,
      text: message.text?.body || '',
      timestamp: message.timestamp,
      raw: body,
    };

    const matchingFlows = (flows || []).filter((flow) => {
      const nodes = flow.content?.nodes || [];
      return nodes.some(
        (n) =>
          (n.data?.type || n.type) === 'whatsapp_trigger' &&
          n.data?.whatsappPhoneNumberId === phone_number_id
      );
    });

    let triggeredCount = 0;

    for (const flow of matchingFlows) {
      const { data: queueEntry, error: queueError } = await supabase
        .from('webhook_queue')
        .insert({
          flow_id: flow.id,
          payload,
          status: 'pending',
        })
        .select('id')
        .single();

      if (queueError) {
        console.error('[WhatsApp Webhook] Queue insertion failed:', queueError);
        continue;
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
          flowId: flow.id,
          payload,
          queueId: queueEntry.id,
        }),
      }).catch((err) => console.error('[WhatsApp Webhook] Edge trigger error:', err.message));

      triggeredCount++;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, flows_triggered: triggeredCount }),
    };
  } catch (err) {
    console.error('[WhatsApp Webhook] Process error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: err.message }),
    };
  }
}
