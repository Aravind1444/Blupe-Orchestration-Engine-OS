/**
 * Razorpay Webhook Handler
 * Route: /api/webhook/razorpay
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

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Razorpay-Signature',
      },
      body: '',
    };
  }

  if (event.httpMethod === 'POST') {
    try {
      const signature = event.headers['x-razorpay-signature'] || event.headers['X-Razorpay-Signature'];
      // Netlify may base64-encode the body — always verify against the true raw payload
      const rawBody = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64').toString('utf8')
        : (event.body || '');

      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET environment variable is missing.');
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Webhook configuration error' }),
        };
      }

      if (!signature) {
        console.warn('[Razorpay Webhook] Missing x-razorpay-signature header.');
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Missing webhook signature' }),
        };
      }

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const sigBuf = Buffer.from(signature, 'utf8');
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        console.warn('[Razorpay Webhook] Signature verification failed');
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Signature verification failed' }),
        };
      }

      const body = JSON.parse(rawBody || '{}');
      const eventType = body.event;
      const payment = body.payload?.payment?.entity || {};
      const subscription = body.payload?.subscription?.entity || {};

      if (!eventType) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ status: 'ignored', reason: 'No event type' }),
        };
      }

      // Handle subscription charge and automatic renewal
      if (eventType === 'subscription.charged') {
        const subscriptionId = subscription.id;
        const paymentId = payment.id;
        const amount = payment.amount || 179900;
        const userId = subscription.notes?.userId;
        const plan = subscription.notes?.plan || 'pro';
        const creditsToAdd = parseInt(subscription.notes?.credits || '5000', 10);

        if (userId && paymentId && subscriptionId) {
          console.log(`[Razorpay Webhook] Processing subscription.charged event: sub=${subscriptionId}, pay=${paymentId}, user=${userId}`);
          const { data: txResult, error: txError } = await supabase.rpc('process_razorpay_payment', {
            p_payment_id: paymentId,
            p_order_id: subscriptionId,
            p_user_id: userId,
            p_amount: amount,
            p_plan: plan,
            p_credits_to_add: creditsToAdd
          });
          if (txError) {
            console.error('[Razorpay Webhook] DB upgrade transaction failed:', txError);
            // Non-2xx so Razorpay retries delivery
            return {
              statusCode: 500,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'Failed to process subscription charge' }),
            };
          }
          if (txResult && txResult.success === false && txResult.code !== 'DUPLICATE') {
            console.error('[Razorpay Webhook] Payment processing rejected:', txResult);
            return {
              statusCode: 500,
              headers: corsHeaders,
              body: JSON.stringify({ error: txResult.error || 'Payment processing failed' }),
            };
          }
          console.log('[Razorpay Webhook] DB upgrade transaction completed:', txResult);
        } else {
          console.warn('[Razorpay Webhook] Missing subscription.charged required payload:', { userId, paymentId, subscriptionId });
        }
      }

      const payload = {
        event: eventType,
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        email: payment.email,
        contact: payment.contact,
        method: payment.method,
        description: payment.description,
        raw: body,
      };

      // Search active flows containing razorpay_trigger matching this event type
      const { data: flows, error: flowsError } = await supabase
        .from('flows')
        .select('id, content')
        .eq('webhook_enabled', true);

      if (flowsError) {
        console.error('[Razorpay Webhook] Database fetch error:', flowsError);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database error' }) };
      }

      const matchingFlows = (flows || []).filter(flow => {
        const nodes = flow.content?.nodes || [];
        return nodes.some(n => 
          (n.data?.type || n.type) === 'razorpay_trigger' &&
          n.data?.razorpayEvent === eventType
        );
      });

      let triggeredCount = 0;

      for (const flow of matchingFlows) {
        // Queue webhook
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
          console.error('[Razorpay Webhook] Queue insertion failed:', queueError);
          continue;
        }

        // Trigger Edge Function asynchronously
        const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/execute-flow`;
        fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify({
            type: 'direct',
            flowId: flow.id,
            payload: payload,
            queueId: queueEntry.id,
          }),
        }).catch(err => console.error('[Razorpay Webhook] Edge trigger error:', err.message));

        triggeredCount++;
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, flows_triggered: triggeredCount }),
      };

    } catch (err) {
      console.error('[Razorpay Webhook] Process error:', err);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Internal server error', message: err.message }),
      };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: 'Method Not Allowed' };
};
