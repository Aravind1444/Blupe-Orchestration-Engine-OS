/**
 * Discord Interactions Endpoint Handler
 * Route: /api/webhook/discord?flowId={flowId}
 *
 * Discord does NOT deliver plain channel/DM messages over HTTP (that requires a
 * persistent Gateway WebSocket). Instead, Discord pushes Interactions (slash
 * commands, buttons) to this endpoint, signed with the application's Ed25519 key.
 *
 * Flow: user runs the configured slash command → Discord POSTs here → we verify
 * the signature against the public key stored on the flow's discord_trigger node
 * → queue the payload → fire the execute-flow edge function → ack Discord.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Discord interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;
const MESSAGE_COMPONENT = 3;

// Wrap a raw 32-byte Ed25519 public key in a DER/SPKI header so Node's crypto can use it
function verifyDiscordSignature(publicKeyHex, signatureHex, timestamp, rawBody) {
  try {
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const keyObject = crypto.createPublicKey({
      key: Buffer.concat([spkiPrefix, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody, 'utf8'),
      keyObject,
      Buffer.from(signatureHex, 'hex')
    );
  } catch (err) {
    console.warn('[Discord Webhook] Signature verification error:', err.message);
    return false;
  }
}

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const query = event.queryStringParameters || {};
    const flowId = query.flowId;

    if (!flowId) {
      return jsonResponse(400, { error: 'Missing flowId parameter' });
    }

    // Discord signs timestamp + raw body; we must verify against the exact bytes received
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '');
    const signature = event.headers['x-signature-ed25519'] || event.headers['X-Signature-Ed25519'];
    const timestamp = event.headers['x-signature-timestamp'] || event.headers['X-Signature-Timestamp'];

    if (!signature || !timestamp) {
      return jsonResponse(401, { error: 'Missing signature headers' });
    }

    // Fetch flow to find the discord_trigger node and its public key
    const { data: flow, error: flowError } = await supabase
      .from('flows')
      .select('id, content, webhook_enabled')
      .eq('id', flowId)
      .single();

    if (flowError || !flow) {
      return jsonResponse(404, { error: 'Flow not found' });
    }

    const nodes = flow.content?.nodes || [];
    const triggerNode = nodes.find(n => (n.data?.type || n.type) === 'discord_trigger');

    if (!triggerNode) {
      return jsonResponse(400, { error: 'Discord trigger not configured in this flow' });
    }

    const publicKey = (triggerNode.data?.discordPublicKey || '').trim();
    if (!publicKey) {
      return jsonResponse(401, { error: 'Discord public key not configured on trigger node' });
    }

    if (!verifyDiscordSignature(publicKey, signature, timestamp, rawBody)) {
      // Discord validates the endpoint by sending deliberately bad signatures; 401 is required
      return jsonResponse(401, { error: 'Invalid request signature' });
    }

    const interaction = JSON.parse(rawBody || '{}');

    // Discord endpoint verification handshake
    if (interaction.type === PING) {
      return jsonResponse(200, { type: 1 }); // PONG
    }

    // Only slash commands (type 2) start flows; acknowledge everything else
    if (interaction.type !== APPLICATION_COMMAND) {
      const ackType = interaction.type === MESSAGE_COMPONENT ? 6 : 4; // 6 = deferred update (no-op)
      return jsonResponse(200, ackType === 6
        ? { type: 6 }
        : { type: 4, data: { content: 'Unsupported interaction type.', flags: 64 } });
    }

    // Only slash commands start flows; require webhook_enabled like other triggers
    if (!flow.webhook_enabled) {
      return jsonResponse(200, {
        type: 4,
        data: { content: '⚠️ This flow is not active. Enable its webhook in Bloope first.', flags: 64 },
      });
    }

    const commandName = interaction.data?.name || '';
    const expectedCommand = (triggerNode.data?.discordCommandName || 'run').replace(/^\//, '').toLowerCase();
    if (commandName.toLowerCase() !== expectedCommand) {
      return jsonResponse(200, {
        type: 4,
        data: { content: `Command /${commandName} is not linked to this flow.`, flags: 64 },
      });
    }

    // Flatten slash command options into { name: value }
    const options = {};
    (interaction.data?.options || []).forEach(opt => { options[opt.name] = opt.value; });

    const user = interaction.member?.user || interaction.user || {};
    const payload = {
      command: commandName,
      text: options.message || options.text || options.input || Object.values(options).map(String).join(' '),
      options,
      userId: user.id,
      username: user.username,
      globalName: user.global_name,
      channelId: interaction.channel_id,
      guildId: interaction.guild_id,
      interactionId: interaction.id,
      raw: interaction,
    };

    // Queue the webhook (same pipeline as Telegram)
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
      console.error('[Discord Webhook] Queue insertion failed:', queueError);
      return jsonResponse(200, {
        type: 4,
        data: { content: '❌ Failed to queue flow execution. Please try again.', flags: 64 },
      });
    }

    // Trigger Edge Function asynchronously; Discord requires an ack within 3 seconds
    const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/execute-flow`;
    fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        type: 'direct',
        flowId: flowId,
        payload: payload,
        queueId: queueEntry.id,
      }),
    }).catch(err => console.error('[Discord Webhook] Edge trigger error:', err.message));

    return jsonResponse(200, {
      type: 4,
      data: { content: '⚡ Flow triggered! It is now running in Bloope.' },
    });

  } catch (err) {
    console.error('[Discord Webhook] Process error:', err);
    return jsonResponse(500, { error: 'Internal server error', message: err.message });
  }
}
