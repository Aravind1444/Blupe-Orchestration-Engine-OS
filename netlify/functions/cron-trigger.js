/**
 * Cron Trigger - Endpoint for external cron services (cron-job.org, Uptime Robot, etc.)
 * Route: /api/cron-trigger
 * 
 * This endpoint can be called every minute by an external service to trigger
 * scheduled workflow executions via the Supabase Edge Function.
 * 
 * Authentication: Requires CRON_SECRET in X-Cron-Secret header
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event, context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }


  function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const hashA = crypto.createHash('sha256').update(a).digest();
    const hashB = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(hashA, hashB);
  }

  // Verify cron secret (prevents unauthorized triggers) — fail closed if unset
  const cronSecret = event.headers['x-cron-secret'] || event.headers['X-Cron-Secret'];
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    console.error('[Cron] CRON_SECRET is not configured — refusing to run schedules');
    return {
      statusCode: 503,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Cron is not configured' }),
    };
  }

  if (!cronSecret || !safeCompare(cronSecret, expectedSecret)) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  try {
    // Get flows with enabled schedules
    const { data: dueFlows, error } = await supabase.rpc('get_due_schedules');

    if (error) {
      console.error('[Cron] Error getting due schedules:', error);
      throw error;
    }

    if (!dueFlows || dueFlows.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          message: 'No schedules due',
          checked_at: new Date().toISOString(),
        }),
      };
    }

    // Filter schedules that should run now based on cron expression
    const now = new Date();
    const schedulesToRun = dueFlows.filter(flow => {
      try {
        return shouldRunNow(flow.cron_expression, now);
      } catch (e) {
        console.error(`[Cron] Invalid cron expression for flow ${flow.flow_id}:`, e);
        return false;
      }
    });

    if (schedulesToRun.length === 0) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          message: 'No schedules due at this time',
          total_schedules: dueFlows.length,
          checked_at: new Date().toISOString(),
        }),
      };
    }

    // Queue each schedule for execution
    const results = [];
    for (const flow of schedulesToRun) {
      try {
        // Insert into schedule_queue
        const { data: queueEntry, error: queueError } = await supabase
          .from('schedule_queue')
          .insert({
            flow_id: flow.flow_id,
            scheduled_for: now.toISOString(),
            cron_expression: flow.cron_expression,
            status: 'pending',
          })
          .select('id')
          .single();

        if (queueError) {
          console.error(`[Cron] Queue insert error for ${flow.flow_id}:`, queueError);
          results.push({ flow_id: flow.flow_id, status: 'error', error: queueError.message });
          continue;
        }

        // Trigger Edge Function
        const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/execute-flow`;
        fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify({
            type: 'direct',
            flowId: flow.flow_id,
            payload: {
              _schedule: {
                cron: flow.cron_expression,
                triggered_at: now.toISOString(),
              },
            },
          }),
        }).catch(err => console.log(`[Cron] Edge function trigger error:`, err.message));

        results.push({
          flow_id: flow.flow_id,
          flow_name: flow.flow_name,
          status: 'triggered',
          queue_id: queueEntry.id,
        });
      } catch (e) {
        console.error(`[Cron] Error processing flow ${flow.flow_id}:`, e);
        results.push({ flow_id: flow.flow_id, status: 'error', error: e.message });
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Cron check completed',
        triggered: results.filter(r => r.status === 'triggered').length,
        errors: results.filter(r => r.status === 'error').length,
        results,
        checked_at: new Date().toISOString(),
      }),
    };

  } catch (error) {
    console.error('[Cron] Unexpected error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
  }
};

/**
 * Check if a cron expression should run now
 * Simplified parser for: minute hour day month weekday
 */
function shouldRunNow(cronExpression, now) {
  if (!cronExpression) return false;
  
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [minute, hour, day, month, weekday] = parts;

  return (
    matchesCronField(minute, now.getMinutes()) &&
    matchesCronField(hour, now.getHours()) &&
    matchesCronField(day, now.getDate()) &&
    matchesCronField(month, now.getMonth() + 1) &&
    matchesCronField(weekday, now.getDay())
  );
}

function matchesCronField(field, value) {
  if (field === '*') return true;
  
  // Handle ranges: 1-5
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }
  
  // Handle lists: 1,3,5
  if (field.includes(',')) {
    return field.split(',').map(Number).includes(value);
  }
  
  // Handle steps: */5
  if (field.includes('/')) {
    const [range, step] = field.split('/');
    const stepNum = Number(step);
    if (range === '*') return value % stepNum === 0;
    const [start] = range.split('-').map(Number);
    return value >= start && (value - start) % stepNum === 0;
  }
  
  // Direct match
  return Number(field) === value;
}
