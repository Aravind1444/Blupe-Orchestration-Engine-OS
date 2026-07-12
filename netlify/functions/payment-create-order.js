// Netlify Serverless Function: Create Razorpay Order for Pro Plan Subscription
// This function creates a Razorpay order when a user initiates payment

import Razorpay from 'razorpay';
import { getCorsHeaders, getCorsOrigin } from './utils/cors.js';
import { requireUser } from './utils/auth.js';

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

    console.log('[Razorpay] Create Order Request...');

    try {
        const { plan } = JSON.parse(event.body || '{}');
        // Always bind subscription to the authenticated user (ignore client userId)
        const userId = authResult.user.id;

        if (!plan || plan !== 'pro') {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Invalid plan. Only "pro" plan is supported.' })
            };
        }

        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            return {
                statusCode: 503,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'Payment provider is not configured.' })
            };
        }

        // Initialize Razorpay
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });

        // Pro Plan details
        const amount = 179900; // ₹1799
        const currency = 'INR';
        const planName = 'Pro Plan Subscription';

        // 1. Fetch existing plans to check if the plan already exists
        let planId = null;
        try {
            console.log('[Razorpay] Checking for existing plans...');
            const plans = await razorpay.plans.all();
            const existingPlan = plans.items?.find(p => 
                p.period === 'monthly' && 
                p.interval === 1 && 
                p.item && 
                p.item.amount === amount && 
                p.item.currency === currency &&
                p.item.name === planName
            );
            if (existingPlan) {
                planId = existingPlan.id;
                console.log('[Razorpay] Found existing plan:', planId);
            }
        } catch (err) {
            console.warn('[Razorpay] Failed to fetch existing plans, will try creating one:', err);
        }

        // 2. Create the Pro Plan if it does not exist
        if (!planId) {
            console.log('[Razorpay] Creating a new subscription plan...');
            const newPlan = await razorpay.plans.create({
                period: 'monthly',
                interval: 1,
                item: {
                    name: planName,
                    amount,
                    currency,
                    description: 'Monthly recurring subscription for Blupe Pro Plan'
                },
                notes: {
                    plan: 'pro'
                }
            });
            planId = newPlan.id;
            console.log('[Razorpay] Created new plan:', planId);
        }

        // 3. Create the recurring subscription
        console.log('[Razorpay] Creating subscription for user:', userId);
        const subscription = await razorpay.subscriptions.create({
            plan_id: planId,
            customer_notify: 1,
            total_count: 120, // 10 years (120 billing cycles)
            quantity: 1,
            notes: {
                plan: 'pro',
                userId,
                credits: '5000'
            }
        });

        console.log('[Razorpay] Subscription Created:', subscription.id);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            },
            body: JSON.stringify({
                id: subscription.id,
                amount,
                currency,
                keyId: process.env.RAZORPAY_KEY_ID
            })
        };

    } catch (error) {
        console.error('[Razorpay] Order Creation Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            },
            body: JSON.stringify({ error: error.message || 'Failed to create Razorpay order.' })
        };
    }
}
