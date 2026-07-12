import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Support OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const params = event.queryStringParameters || {};
    let token = params.token;
    let action = params.action || 'approve';

    if (event.httpMethod === 'POST' && event.body) {
      try {
        const body = JSON.parse(event.body);
        token = token || body.token;
        action = body.action || action;
      } catch (e) {}
    }

    if (!token) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing resume token.' }),
      };
    }

    // GET must never consume the token: chat apps and email scanners prefetch
    // links in notifications, which used to burn the single-use token (and
    // auto-approve the flow) before the recipient ever clicked. GET only does
    // a read-only validity check and renders a confirmation page whose button
    // POSTs back to this endpoint.
    if (event.httpMethod === 'GET') {
      const { data: pending, error: readError } = await supabase
        .from('paused_executions')
        .select('status, created_at')
        .eq('resume_token', token)
        .maybeSingle();

      if (readError) {
        console.error('[ResumeFlow] Database query failed:', readError);
        return {
          statusCode: 500,
          headers: { 'Content-Type': 'text/html' },
          body: getErrorHtml('Database transaction failed.'),
        };
      }

      if (!pending) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'text/html' },
          body: getErrorHtml('Invalid resume token.'),
        };
      }
      if (pending.status !== 'paused') {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'text/html' },
          body: getErrorHtml('This approval request was already handled or has expired.'),
        };
      }
      if (Date.now() - new Date(pending.created_at).getTime() > 7 * 24 * 60 * 60 * 1000) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'text/html' },
          body: getErrorHtml('This resume link has expired (7-day validity limit reached).'),
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: getConfirmHtml(token, action),
      };
    }

    // 1. Fetch paused execution and perform atomic single-use status check + update
    // We update status from 'paused' to 'resumed' in one atomic command.
    // If the record was already resumed (or expired), this will return null.
    const { data: pausedRun, error: dbError } = await supabase
      .from('paused_executions')
      .update({ 
        status: 'resumed', 
        resumed_at: new Date().toISOString() 
      })
      .eq('resume_token', token)
      .eq('status', 'paused')
      .select()
      .maybeSingle();

    if (dbError) {
      console.error('[ResumeFlow] Database query failed:', dbError);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Database transaction failed.' }),
      };
    }

    if (!pausedRun) {
      // Replay check fail
      const htmlErrorMsg = 'Invalid, expired, or already-used resume token.';
      if (event.httpMethod === 'GET') {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'text/html' },
          body: getErrorHtml(htmlErrorMsg),
        };
      }
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: htmlErrorMsg }),
      };
    }

    // 2. Enforce Expiration: 7-day token limit
    const ageMs = Date.now() - new Date(pausedRun.created_at).getTime();
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (ageMs > maxAgeMs) {
      // Revert status to expired
      await supabase
        .from('paused_executions')
        .update({ status: 'expired' })
        .eq('id', pausedRun.id);

      const htmlErrorMsg = 'This resume link has expired (7-day validity limit reached).';
      if (event.httpMethod === 'GET') {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'text/html' },
          body: getErrorHtml(htmlErrorMsg),
        };
      }
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: htmlErrorMsg }),
      };
    }

    // 3. Trigger Deno Edge Function execution to resume the flow
    const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/execute-flow`;
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        type: 'resume',
        token,
        action,
      }),
    });

    const resData = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[ResumeFlow] Edge function resume invocation failed:', resData);
      // Revert status to paused to allow retry on transient invocation errors
      await supabase
        .from('paused_executions')
        .update({ status: 'paused', resumed_at: null })
        .eq('id', pausedRun.id);

      const htmlErrorMsg = resData.error || 'Failed to resume flow execution.';
      if (event.httpMethod === 'GET') {
        return {
          statusCode: response.status,
          headers: { 'Content-Type': 'text/html' },
          body: getErrorHtml(htmlErrorMsg),
        };
      }
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: htmlErrorMsg }),
      };
    }

    // If it's a GET request from a browser, return a nice HTML page instead of JSON!
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: getSuccessHtml(action),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, result: resData }),
    };

  } catch (err) {
    console.error('[ResumeFlow] Unexpected error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: err.message }),
    };
  }
};

function getConfirmHtml(token, action) {
  const isApprove = action !== 'reject';
  const actionLabel = isApprove ? 'Approve' : 'Reject';
  const accent = isApprove ? '#16a34a' : '#dc2626';
  const accentHover = isApprove ? '#15803d' : '#b91c1c';
  const safeToken = String(token).replace(/[^a-zA-Z0-9-]/g, '');
  const safeAction = isApprove ? 'approve' : 'reject';
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Confirm ${actionLabel}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
        .card { padding: 2.5rem; background: white; border-radius: 16px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1); text-align: center; max-width: 420px; border: 1px solid #e2e8f0; }
        h1 { font-size: 1.5rem; margin-top: 1rem; margin-bottom: 0.5rem; color: #0f172a; font-weight: 700; }
        p { font-size: 0.875rem; color: #475569; margin-bottom: 1.5rem; line-height: 1.5; }
        .badge { display: inline-flex; align-items: center; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: #f1f5f9; color: #334155; }
        button { background: ${accent}; color: white; border: none; border-radius: 10px; padding: 0.75rem 2rem; font-size: 1rem; font-weight: 700; cursor: pointer; }
        button:hover { background: ${accentHover}; }
        button:disabled { opacity: 0.6; cursor: wait; }
        #result { margin-top: 1rem; font-size: 0.875rem; min-height: 1.25rem; }
        .ok { color: #166534; font-weight: 600; }
        .err { color: #991b1b; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">Approval Required</span>
        <h1>Confirm your decision</h1>
        <p>A workflow is paused and waiting for your input. Click below to <strong>${safeAction}</strong> and resume it.</p>
        <button id="confirm">${actionLabel} &amp; Resume</button>
        <div id="result"></div>
      </div>
      <script>
        document.getElementById('confirm').addEventListener('click', async () => {
          const btn = document.getElementById('confirm');
          const result = document.getElementById('result');
          btn.disabled = true;
          result.textContent = 'Processing…';
          result.className = '';
          try {
            const res = await fetch(window.location.pathname, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: '${safeToken}', action: '${safeAction}' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              result.textContent = 'Done — the workflow has been resumed (${safeAction}). You can close this tab.';
              result.className = 'ok';
              btn.style.display = 'none';
            } else {
              result.textContent = data.error || 'Failed to resume the workflow.';
              result.className = 'err';
              btn.disabled = false;
            }
          } catch (e) {
            result.textContent = 'Network error — please try again.';
            result.className = 'err';
            btn.disabled = false;
          }
        });
      </script>
    </body>
    </html>
  `;
}

function getSuccessHtml(action) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Workflow Resumed</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
        .card { padding: 2.5rem; background: white; border-radius: 16px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1); text-align: center; max-width: 420px; border: 1px solid #e2e8f0; }
        h1 { font-size: 1.5rem; margin-top: 1rem; margin-bottom: 0.5rem; color: #0f172a; font-weight: 700; }
        p { font-size: 0.875rem; color: #475569; margin-bottom: 1.5rem; line-height: 1.5; }
        .badge { display: inline-flex; align-items: center; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .badge-success { background-color: #dcfce7; color: #166534; }
        .action-indicator { font-weight: 600; color: #1e1b4b; background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge badge-success">Success</span>
        <h1>Action Processed</h1>
        <p>The paused workflow execution has been successfully resumed with action: <span class="action-indicator">${action}</span>.</p>
        <p style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0;">You can close this tab now.</p>
      </div>
    </body>
    </html>
  `;
}

function getErrorHtml(message) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Failed to Resume</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
        .card { padding: 2.5rem; background: white; border-radius: 16px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1); text-align: center; max-width: 420px; border: 1px solid #e2e8f0; }
        h1 { font-size: 1.5rem; margin-top: 1rem; margin-bottom: 0.5rem; color: #991b1b; font-weight: 700; }
        p { font-size: 0.875rem; color: #475569; margin-bottom: 1.5rem; line-height: 1.5; }
        .badge { display: inline-flex; align-items: center; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .badge-error { background-color: #fee2e2; color: #991b1b; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge badge-error">Failed</span>
        <h1>Execution Error</h1>
        <p>${message}</p>
        <p style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0;">If you think this is a mistake, please contact support.</p>
      </div>
    </body>
    </html>
  `;
}
