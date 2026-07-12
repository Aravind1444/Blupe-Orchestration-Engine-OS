import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { getCorsHeaders } from './utils/cors.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

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
    const { runId, flowId, nodeId, resumeToken, contextSnapshot, approvalNotification, origin } = body;

    if (!runId || !flowId || !nodeId || !resumeToken) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }

    // Ownership check — only flow owner (or service_role) may pause
    if (authResult.user.id !== 'service_role') {
      const { data: flow, error: flowErr } = await supabase
        .from('flows')
        .select('user_id')
        .eq('id', flowId)
        .maybeSingle();
      if (flowErr || !flow) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Flow not found' })
        };
      }
      const allowedOwner =
        flow.user_id === authResult.user.id ||
        (authResult.user.role === 'flow_owner' && authResult.user.flowId === flowId);
      if (!allowedOwner) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Not authorized to pause this flow' })
        };
      }
    }

    // Insert paused execution row using the Service Key (bypassing RLS)
    const { error: insertErr } = await supabase.from('paused_executions').insert({
      run_id: runId,
      flow_id: flowId,
      node_id: nodeId,
      resume_token: resumeToken,
      context_snapshot: contextSnapshot || {},
      status: 'paused'
    });

    if (insertErr) {
      console.error('[PauseFlow] Failed to insert paused execution:', insertErr);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Database insert failed', details: insertErr.message })
      };
    }

    // Send notifications
    if (approvalNotification && approvalNotification.channel !== 'none') {
      const baseUrl = (origin || 'https://blupe.space').replace(/\/$/, '');
      const approveUrl = `${baseUrl}/api/resume-flow?token=${resumeToken}&action=approve`;
      const rejectUrl = `${baseUrl}/api/resume-flow?token=${resumeToken}&action=reject`;
      const text = `[Bell] Approval required\n\n${approvalNotification.message}\n\n[✓] Approve: ${approveUrl}\n[✗] Reject: ${rejectUrl}`;

      try {
        switch (approvalNotification.channel) {
          case 'telegram': {
            if (!approvalNotification.telegramBotToken || !approvalNotification.telegramChatId) {
              throw new Error('Telegram bot token and chat ID are required');
            }
            const res = await fetch(`https://api.telegram.org/bot${approvalNotification.telegramBotToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: approvalNotification.telegramChatId, text, disable_web_page_preview: true })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.description || JSON.stringify(data));
            break;
          }
          case 'discord': {
            if (!approvalNotification.discordWebhookUrl) {
              throw new Error('Discord webhook URL is required');
            }
            const res = await fetch(approvalNotification.discordWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: text.slice(0, 2000) })
            });
            if (!res.ok) throw new Error(`Discord hook responded ${res.status}`);
            break;
          }
          case 'slack': {
            if (!approvalNotification.slackWebhookUrl) {
              throw new Error('Slack webhook URL is required');
            }
            const res = await fetch(approvalNotification.slackWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text })
            });
            if (!res.ok) throw new Error(`Slack hook responded ${res.status}`);
            break;
          }
          case 'webhook': {
            if (!approvalNotification.webhookUrl) break;
            const res = await fetch(approvalNotification.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'approval_requested',
                message: approvalNotification.message,
                token: resumeToken,
                resumeUrl: approveUrl,
                approveUrl,
                rejectUrl
              })
            });
            if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
            break;
          }
        }
      } catch (notifyErr) {
        console.error('[PauseFlow] Notification error:', notifyErr.message);
        // We do not fail the request if database insertion succeeded, but we return a warning in the response
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, warning: `Notification failed: ${notifyErr.message}` })
        };
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('[PauseFlow] Unexpected error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
}
