// Netlify Serverless Function: Verify Razorpay Payment and Upgrade User
// This function verifies the payment signature and upgrades user to Pro tier

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders } from './utils/cors.js';
import { requireUser } from './utils/auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const EXPECTED_AMOUNT = 179900; // ₹1799 in paise
const EXPECTED_CURRENCY = 'INR';

export async function handler(event, context) {
    // Get CORS headers with production restrictions for payment endpoint
    const corsHeaders = getCorsHeaders(event, true);

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const authResult = await requireUser(event);
    if (authResult.error || !authResult.user?.id || authResult.user.id === 'service_role') {
        return {
            statusCode: authResult.status || 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ error: authResult.error || 'Authentication required' })
        };
    }

    console.log('[Razorpay] Verify Payment Request...');

    try {
        if (!process.env.RAZORPAY_KEY_SECRET || !process.env.RAZORPAY_KEY_ID) {
            return {
                statusCode: 503,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Payment provider is not configured.' })
            };
        }

        const {
            razorpay_order_id,
            razorpay_subscription_id,
            razorpay_payment_id,
            razorpay_signature,
            plan
        } = JSON.parse(event.body || '{}');

        const subOrOrderId = razorpay_subscription_id || razorpay_order_id;

        if (!subOrOrderId || !razorpay_payment_id || !razorpay_signature || !plan) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Missing required payment verification parameters.' })
            };
        }

        // Official Razorpay signature payloads:
        //   Orders:        order_id|payment_id
        //   Subscriptions: payment_id|subscription_id  (REVERSED field order)
        const signaturePayload = razorpay_subscription_id
            ? `${razorpay_payment_id}|${razorpay_subscription_id}`
            : `${razorpay_order_id}|${razorpay_payment_id}`;

        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(signaturePayload)
            .digest('hex');

        const sigBuf = Buffer.from(generatedSignature, 'utf8');
        const expectedBuf = Buffer.from(String(razorpay_signature), 'utf8');
        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
            console.error('[Razorpay] Signature verification failed');
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Invalid payment signature. Payment verification failed.' })
            };
        }

        console.log('[Razorpay] Signature verified successfully');

        const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
        const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
        const basicAuth = 'Basic ' + Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');

        // 1. Fetch payment details directly from Razorpay API to prevent tampering and check status
        const rpPayRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
            headers: { 'Authorization': basicAuth }
        });
        
        if (!rpPayRes.ok) {
            console.error('[Razorpay] Failed to fetch payment details from Razorpay API');
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Failed to retrieve payment details.' })
            };
        }
        
        const paymentData = await rpPayRes.json();
        
        // Accept captured; also authorized (auto-capture race) if amount matches
        const okStatus = paymentData.status === 'captured' || paymentData.status === 'authorized';
        if (!okStatus) {
            console.error('[Razorpay] Payment status not acceptable:', paymentData.status);
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Payment is not authorized or captured yet.' })
            };
        }

        if (paymentData.amount && Number(paymentData.amount) !== EXPECTED_AMOUNT) {
            console.error('[Razorpay] Amount mismatch:', paymentData.amount);
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Payment amount does not match the Pro plan price.' })
            };
        }
        if (paymentData.currency && paymentData.currency !== EXPECTED_CURRENCY) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Payment currency mismatch.' })
            };
        }

        let verifiedUserId = null;
        let verifiedPlan = 'pro';
        let creditsToAdd = 5000;

        if (razorpay_subscription_id) {
            // 2. Fetch subscription details from Razorpay API to verify metadata
            const rpSubRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${razorpay_subscription_id}`, {
                headers: { 'Authorization': basicAuth }
            });
            
            if (!rpSubRes.ok) {
                console.error('[Razorpay] Failed to fetch subscription details from Razorpay API');
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify({ error: 'Failed to retrieve subscription details.' })
                };
            }
            
            const subscriptionData = await rpSubRes.json();
            verifiedUserId = subscriptionData.notes?.userId;
            verifiedPlan = subscriptionData.notes?.plan || 'pro';
            creditsToAdd = parseInt(subscriptionData.notes?.credits || '5000', 10);
        } else {
            // Backward-compatibility: Fetch order details from Razorpay API
            const rpOrderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
                headers: { 'Authorization': basicAuth }
            });
            
            if (!rpOrderRes.ok) {
                console.error('[Razorpay] Failed to fetch order details from Razorpay API');
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify({ error: 'Failed to retrieve payment order details.' })
                };
            }
            
            const orderData = await rpOrderRes.json();
            verifiedUserId = orderData.notes?.userId;
            verifiedPlan = orderData.notes?.plan || 'pro';
            creditsToAdd = parseInt(orderData.notes?.credits || '5000', 10);
        }

        if (!verifiedUserId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Invalid payment metadata. Missing User ID.' })
            };
        }

        // Session user must match the Razorpay notes user (prevents gift/hijack after auth'd create)
        if (verifiedUserId !== authResult.user.id) {
            console.error('[Razorpay] userId mismatch between notes and session', {
                notes: verifiedUserId,
                session: authResult.user.id
            });
            return {
                statusCode: 403,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Payment does not belong to the authenticated user.' })
            };
        }

        // Call the database atomic transaction RPC for payment processing & idempotency lock
        const { data: txResult, error: txError } = await supabase.rpc('process_razorpay_payment', {
            p_payment_id: razorpay_payment_id,
            p_order_id: subOrOrderId,
            p_user_id: verifiedUserId,
            p_amount: paymentData.amount || EXPECTED_AMOUNT,
            p_plan: verifiedPlan,
            p_credits_to_add: creditsToAdd
        });

        if (txError) {
            console.error('[Razorpay] DB upgrade transaction failed:', txError);
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Failed to process payment upgrade transaction.' })
            };
        }

        if (txResult && !txResult.success) {
            if (txResult.code === 'DUPLICATE') {
                console.warn('[Razorpay] Replay attack blocked:', razorpay_payment_id);
                return {
                    statusCode: 409,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify({ error: 'This payment has already been processed.' })
                };
            }
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: txResult.error || 'Failed to complete payment processing.' })
            };
        }

        const newBalance = txResult.new_balance;
        console.log(`[Razorpay] User ${verifiedUserId} upgraded to Pro (credits added, total: ${newBalance})`);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            },
            body: JSON.stringify({
                success: true,
                message: 'Payment verified and upgrade successful',
                tier: 'pro',
                newBalance
            })
        };

    } catch (error) {
        console.error('[Razorpay] Verification Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            },
            body: JSON.stringify({ error: error.message || 'Payment verification failed.' })
        };
    }
}
