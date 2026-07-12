
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002; // Change to 3002 to avoid conflicts

// Initialize Supabase Admin (Service Role)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
} else {
    console.warn('[Server] Supabase credentials missing (SUPABASE_URL, SUPABASE_SERVICE_KEY) - database features disabled');
}

// Initialize Razorpay
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
});

// Middleware
app.use(express.json());

// 1. Global Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Enable CORS explicitly for all routes
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// === API ROUTES (Must be defined BEFORE static files) ===

// Health Check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Explicit OPTIONS
app.options('/api/email', (req, res) => res.sendStatus(200));
app.options('/api/llm', (req, res) => res.sendStatus(200));
app.options('/api/web-search', (req, res) => res.sendStatus(200));


// Helper: Calculate Cost (Ported from BillingService)
const calculateRunCost = (nodeType, model = '', isBYOK = false) => {
    // Mail Node always costs 5 credits
    if (nodeType === 'email') return 5;
    if (nodeType === 'web-search') return 1;

    // If BYOK is enabled, flat 3 credits for AI nodes
    if (isBYOK && (nodeType === 'llm' || nodeType === 'gemini')) {
        return 3;
    }

    if (nodeType !== 'llm' && nodeType !== 'gemini' && nodeType !== 'ai_vision') {
        return 1;
    }

    // Platform Keys Cost
    switch (model) {
        case 'gpt-5.1': return 10;
        case 'gpt-5-mini': return 6;
        case 'gpt-5-nano': return 4;
        case 'claude-opus-4-5': return 20;
        case 'claude-sonnet-4-5': return 10;
        case 'claude-haiku-4-5': return 6;
        case 'gemini-3-pro-preview': return 15;
        case 'gemini-2.5-flash': return 6;
        case 'gemini-1.5-flash': return 6;
        case 'gemini-1.5-pro': return 10;
        case 'llama-3.3-70b-versatile': return 5;
        case 'llama-3.1-8b-instant': return 3;
        default:
             if (model.includes('nano') || model.includes('haiku') || model.includes('lite') || model.includes('instant')) return 4;
             if (model.includes('mini') || model.includes('flash') || model.includes('sonnet')) return 6;
             if (model.includes('opus') || model.includes('ultra')) return 20;
             return 10; 
    }
};

// Helper: Deduct Credits from Owner (Direct Update - Reliable)
const deductOwnerCredits = async (ownerId, amount) => {
    if (!ownerId || amount <= 0) {
        console.warn(`[Billing] Skipped: Invalid ownerId (${ownerId}) or amount (${amount})`);
        return;
    }

    if (!supabase) return;
    
    console.log(`[Billing] Attempting to deduct ${amount} credits from Owner: ${ownerId}`);
    
    try {
        // Direct Update via Service Role (bypasses RLS)
        const { data, error: fetchError } = await supabase
            .from('user_credits')
            .select('balance')
            .eq('user_id', ownerId)
            .single();
        
        if (fetchError) {
            console.error(`[Billing] Failed to fetch balance for ${ownerId}:`, fetchError.message);
            return;
        }
        
        if (!data) {
            console.warn(`[Billing] No credit record found for Owner: ${ownerId}`);
            return;
        }
        
        const currentBalance = data.balance || 0;
        const newBalance = Math.max(0, currentBalance - amount);
        
        const { error: updateError } = await supabase
            .from('user_credits')
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq('user_id', ownerId);
        
        if (updateError) {
            console.error(`[Billing] Failed to update balance for ${ownerId}:`, updateError.message);
            return;
        }
        
        console.log(`[Billing] SUCCESS: Deducted ${amount} credits from Owner ${ownerId}. Balance: ${currentBalance} -> ${newBalance}`);
    } catch (e) {
        console.error("[Billing] Critical Error deducting credits:", e);
    }
};

// Unified LLM Proxy
app.post('/api/llm', async (req, res) => {
    try {
        const { provider, model, prompt, system, temperature, maxTokens, apiKey } = req.body;
        
        let key = apiKey || req.headers['x-api-key']; // Explicit key from client (Testing)
        const flowOwnerId = req.headers['x-flow-owner-id']; // Owner ID for Published Flows
        let isBYOK = false;

        // 1. Priority: Check Owner's Cloud Secrets (BYOK)
        if (!key && flowOwnerId) {
            let secretName = '';
            if (provider === 'openai') secretName = 'OPENAI_API_KEY';
            if (provider === 'anthropic') secretName = 'ANTHROPIC_API_KEY';
            if (provider === 'groq') secretName = 'GROQ_API_KEY';
            if (provider === 'gemini') secretName = 'GEMINI_API_KEY'; // or API_KEY

            if (secretName) {
                try {
                    // Use Service Role to read secrets (Bypassing RLS as this is the Trusted Backend)
                    const { data } = await supabase
                        .from('user_secrets')
                        .select('value')
                        .eq('user_id', flowOwnerId)
                        .eq('key_name', secretName)
                        .single();
                    
                    if (data && data.value) {
                         key = data.value;
                         isBYOK = true;
                         console.log(`[LLM] Using Owner's Secret for ${provider} (Owner: ${flowOwnerId})`);
                    }
                } catch (err) {
                    console.error("Failed to fetch user secret:", err);
                }
            }
        }

        // 2. Fallback: Platform Keys (Platform Credits)
        if (!key) {
            if (provider === 'openai') key = process.env.OPENAI_API_KEY;
            if (provider === 'anthropic') key = process.env.ANTHROPIC_API_KEY;
            if (provider === 'groq') key = process.env.GROQ_API_KEY;
            if (provider === 'gemini') key = process.env.GEMINI_API_KEY || process.env.API_KEY;
            
            if (key) {
                console.log(`[LLM] Using Platform Key for ${provider}`);
            }
        }

        if (!key) {
            return res.status(400).json({ error: `Missing API Key for ${provider}. Add it to Secrets.` });
        }

        // 3. Billing: Deduct Credits
        if (flowOwnerId) {
            const cost = calculateRunCost('llm', model, isBYOK);
            // Async deduction (don't block execution)
            deductOwnerCredits(flowOwnerId, cost);
        }

        let result;
        let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        if (provider === 'openai' || provider === 'groq') {
            const baseUrl = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
            const apiRes = await fetch(baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        ...(system ? [{ role: 'system', content: system }] : []),
                        { role: 'user', content: prompt }
                    ],
                    temperature: temperature || 0.7,
                    max_tokens: maxTokens || 1024
                })
            });
            if (!apiRes.ok) throw new Error(await apiRes.text());
            const data = await apiRes.json();
            result = data.choices[0].message.content;
            usage = data.usage;
        } else if (provider === 'anthropic') {
            const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: prompt }],
                    system: system,
                    max_tokens: maxTokens || 1024,
                    temperature: temperature || 0.7
                })
            });
            if (!apiRes.ok) throw new Error(await apiRes.text());
            const data = await apiRes.json();
            result = data.content[0].text;
            usage = {
                prompt_tokens: data.usage.input_tokens,
                completion_tokens: data.usage.output_tokens,
                total_tokens: data.usage.input_tokens + data.usage.output_tokens
            };
        } else if (provider === 'gemini') {
            // Google Gemini via REST API  
            const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-goog-api-key': key 
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: system ? `${system}\n\n${prompt}` : prompt }] }],
                    generationConfig: {
                        temperature: temperature || 0.7,
                        maxOutputTokens: maxTokens || 1024
                    }
                })
            });
            if (!apiRes.ok) {
                const errText = await apiRes.text();
                throw new Error(`Gemini API Error: ${errText}`);
            }
            const data = await apiRes.json();
            result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            // Estimate token usage for Gemini
            const inputEst = Math.ceil((prompt.length + (system?.length || 0)) / 4);
            const outputEst = Math.ceil(result.length / 4);
            usage = {
                prompt_tokens: inputEst,
                completion_tokens: outputEst,
                total_tokens: inputEst + outputEst
            };
        }
        res.json({ text: result, usage });
    } catch (e) {
        console.error("[API] LLM Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Send Email (SMTP)
// Send Email (SMTP)
app.post('/api/email', async (req, res) => {
    console.log(`[API] Email Request Processing...`);
    // Debug Logging
    console.log(`[Email Debug] Headers: x-flow-owner-id=${req.headers['x-flow-owner-id']}`);
    console.log(`[Email Debug] Env Vars Check: SMTP_HOST=${process.env.SMTP_HOST ? 'Present' : 'Missing'}, SMTP_USER=${process.env.SMTP_USER ? 'Present' : 'Missing'}`);

    try {
        const { to, subject, html, text, from, smtp } = req.body;
        const flowOwnerId = req.headers['x-flow-owner-id'];
        
        // 1. Priority: Check Owner's or Explicit SMTP
        let host = smtp?.host;
        let port = smtp?.port;
        let user = smtp?.user;
        let pass = smtp?.pass;

        // If not provided in body, try fetching from Owner's Secrets (if flowOwnerId present)
        if ((!host || !user || !pass) && flowOwnerId) {
             // Try to fetch SMTP secrets
             const { data } = await supabase.from('user_secrets')
                .select('key_name, value')
                .eq('user_id', flowOwnerId)
                .in('key_name', ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']);
            
            if (data && data.length > 0) {
                const secrets = {};
                data.forEach(d => secrets[d.key_name] = d.value);
                if (secrets['SMTP_HOST']) host = secrets['SMTP_HOST'];
                if (secrets['SMTP_PORT']) port = secrets['SMTP_PORT'];
                if (secrets['SMTP_USER']) user = secrets['SMTP_USER'];
                if (secrets['SMTP_PASS']) pass = secrets['SMTP_PASS'];
                console.log(`[Email] Using Owner's SMTP Secrets (Owner: ${flowOwnerId})`);
            }
        }

        // 2. Fallback: Platform Keys
        if (!host || !user || !pass) {
            console.log(`[Email Debug] Owner secrets empty/incomplete. Trying Platform fallback. Global Env Host: ${process.env.SMTP_HOST}`);
            host = process.env.SMTP_HOST;
            port = process.env.SMTP_PORT;
            user = process.env.SMTP_USER;
            pass = process.env.SMTP_PASS;
            if (host) console.log(`[Email] Using Platform SMTP`);
        }

        console.log(`[Email Debug] Resolved Config - Host: ${host}, User: ${user ? '***' : 'Missing'}, Pass: ${pass ? '***' : 'Missing'}`);

        if (!host || !user || !pass) {
             console.error(`[Email Error] Missing Credentials. Host: ${host}, User: ${user}`);
             return res.status(400).json({ error: "Missing SMTP Credentials. Please provide them or configure env vars." });
        }

        const transporter = nodemailer.createTransport({
            host: host,
            port: Number(port) || 587,
            secure: Number(port) === 465,
            auth: { user, pass },
        });
        const info = await transporter.sendMail({
            from: from || user, // Default to SMTP user if from not specified
            to: Array.isArray(to) ? to.join(', ') : to,
            subject: subject,
            text: text,
            html: html,
        });

        // Billing: Deduct 5 Credits from Owner
        if (flowOwnerId) {
             deductOwnerCredits(flowOwnerId, 5);
        }

        console.log("[API] Email Sent Successfully:", info.messageId);
        res.json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error("[API] Internal Email Error:", error);
        res.status(500).json({ error: error.message || "Failed to send email via SMTP." });
    }
});

// Web Search (Tavily)
app.post('/api/web-search', async (req, res) => {
    try {
        const { query, apiKey } = req.body;
        const flowOwnerId = req.headers['x-flow-owner-id'];

        let key = apiKey;
        
        // 1. Owner's Secret
        if (!key && flowOwnerId && supabase) {
             try {
                const { data } = await supabase.from('user_secrets')
                    .select('value')
                    .eq('user_id', flowOwnerId)
                    .eq('key_name', 'TAVILY_API_KEY')
                    .single();
                 if (data && data.value) key = data.value;
             } catch (e) {
                 console.log('[Web Search] Could not fetch user secret:', e.message);
             }
        }

        // 2. Platform Key
        if (!key) key = process.env.TAVILY_API_KEY;

        if (!key) {
            return res.status(400).json({ error: "Missing TAVILY_API_KEY. Add it to Secrets." });
        }

        console.log(`[API] Web Search: "${query}"`);

        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                api_key: key,
                query: query,
                search_depth: "basic",
                include_answer: true,
                max_results: 5
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: `Tavily API Error: ${errorText}` });
        }

        const data = await response.json();
        // Return a simplified string or the full object?
        // Let's return the "answer" if available, or a summary of results.
        const answer = data.answer || data.results.map(r => `- ${r.title}: ${r.content}`).join('\n');
        
        res.json({ result: answer, raw: data });

        // Billing
        if (flowOwnerId) {
            deductOwnerCredits(flowOwnerId, 3);
        }

    } catch (error) {
        console.error("[API] Web Search Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Deep Research (Tavily Advanced)
app.post('/api/deep-research', async (req, res) => {
    try {
        const { topic, maxResults, apiKey } = req.body;
        const flowOwnerId = req.headers['x-flow-owner-id'];

        let key = apiKey;
        
        if (!key && flowOwnerId && supabase) {
            try {
                const { data } = await supabase.from('user_secrets')
                    .select('value')
                    .eq('user_id', flowOwnerId)
                    .eq('key_name', 'TAVILY_API_KEY')
                    .single();
                if (data && data.value) key = data.value;
            } catch (e) {
                console.log('[Deep Research] Could not fetch user secret:', e.message);
            }
        }
        if (!key) key = process.env.TAVILY_API_KEY;

        if (!key) {
            return res.status(400).json({ error: "Missing TAVILY_API_KEY. Add it to Secrets or set env var." });
        }

        if (!topic) {
            return res.status(400).json({ error: "Research topic is required." });
        }

        console.log(`[API] Deep Research: "${topic}"`);

        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: key,
                query: topic,
                search_depth: 'advanced',
                include_answer: true,
                include_raw_content: true,
                max_results: maxResults || 10
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: `Tavily API Error: ${errorText}` });
        }

        const data = await response.json();
        const result = {
            summary: data.answer || 'No summary available',
            sources: (data.results || []).map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.substring(0, 300)
            })),
            topic
        };
        
        res.json({ result });

        if (flowOwnerId && supabase) {
            deductOwnerCredits(flowOwnerId, 35);
        }

    } catch (error) {
        console.error("[API] Deep Research Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Extract URL (Tavily)
app.post('/api/extract-url', async (req, res) => {
    try {
        const { url, apiKey } = req.body;
        const flowOwnerId = req.headers['x-flow-owner-id'];

        let key = apiKey;
        
        // Try to get from user secrets if supabase is available
        if (!key && flowOwnerId && supabase) {
            try {
                const { data } = await supabase.from('user_secrets')
                    .select('value')
                    .eq('user_id', flowOwnerId)
                    .eq('key_name', 'TAVILY_API_KEY')
                    .single();
                if (data && data.value) key = data.value;
            } catch (e) {
                console.log('[Extract URL] Could not fetch user secret:', e.message);
            }
        }
        
        // Platform key fallback
        if (!key) key = process.env.TAVILY_API_KEY;

        if (!key) {
            return res.status(400).json({ error: "Missing TAVILY_API_KEY. Add it to Secrets or set env var." });
        }

        if (!url) {
            return res.status(400).json({ error: "URL is required." });
        }

        console.log(`[API] Extract URL: "${url}"`);

        const response = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: key,
                urls: [url]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[API] Tavily Extract Error Response:', errorText);
            return res.status(response.status).json({ error: `Tavily Extract Error: ${errorText}` });
        }

        const data = await response.json();
        const extracted = data.results?.[0] || {};
        const result = {
            url,
            title: extracted.title || 'Unknown',
            content: extracted.raw_content?.substring(0, 10000) || extracted.content || 'No content extracted'
        };
        
        res.json({ result });

        if (flowOwnerId && supabase) {
            deductOwnerCredits(flowOwnerId, 10);
        }

    } catch (error) {
        console.error("[API] Extract URL Error:", error);
        res.status(500).json({ error: error.message || 'Unknown error' });
    }
});

// Crawl Site (Tavily)
app.post('/api/crawl-site', async (req, res) => {
    try {
        const { url, maxPages, apiKey } = req.body;
        const flowOwnerId = req.headers['x-flow-owner-id'];

        let key = apiKey;
        
        if (!key && flowOwnerId && supabase) {
            try {
                const { data } = await supabase.from('user_secrets')
                    .select('value')
                    .eq('user_id', flowOwnerId)
                    .eq('key_name', 'TAVILY_API_KEY')
                    .single();
                if (data && data.value) key = data.value;
            } catch (e) {
                console.log('[Crawl Site] Could not fetch user secret:', e.message);
            }
        }
        if (!key) key = process.env.TAVILY_API_KEY;

        if (!key) {
            return res.status(400).json({ error: "Missing TAVILY_API_KEY. Add it to Secrets or set env var." });
        }

        if (!url) {
            return res.status(400).json({ error: "Site URL is required." });
        }

        console.log(`[API] Crawl Site: "${url}"`);

        // Try extract for multiple URLs (crawl simulation)
        const response = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: key,
                urls: [url]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[API] Tavily Crawl Error Response:', errorText);
            return res.status(response.status).json({ error: `Tavily Crawl Error: ${errorText}` });
        }

        const data = await response.json();
        const result = {
            baseUrl: url,
            pages: data.results || [],
            pagesFound: (data.results || []).length
        };
        
        res.json({ result });

        if (flowOwnerId && supabase) {
            deductOwnerCredits(flowOwnerId, 25);
        }

    } catch (error) {
        console.error("[API] Crawl Site Error:", error);
        res.status(500).json({ error: error.message || 'Unknown error' });
    }
});

// --- PAYMENT ROUTES (Razorpay Subscriptions — aligned with Netlify functions) ---
// Frontend uses /api/payment-create-order and /api/payment-verify

const PRO_AMOUNT_PAISE = 179900;
const PRO_PLAN_NAME = 'Pro Plan Subscription';

async function requireLocalUser(req) {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) return { error: 'Missing authorization', status: 401 };
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { error: 'Invalid session', status: 401 };
    return { user };
}

async function ensureProPlanId(rzp) {
    const plans = await rzp.plans.all();
    const existing = plans.items?.find(
        (p) =>
            p.period === 'monthly' &&
            p.interval === 1 &&
            p.item?.amount === PRO_AMOUNT_PAISE &&
            p.item?.currency === 'INR' &&
            p.item?.name === PRO_PLAN_NAME
    );
    if (existing) return existing.id;
    const created = await rzp.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
            name: PRO_PLAN_NAME,
            amount: PRO_AMOUNT_PAISE,
            currency: 'INR',
            description: 'Monthly recurring subscription for Blupe Pro Plan',
        },
        notes: { plan: 'pro' },
    });
    return created.id;
}

const paymentCreateHandler = async (req, res) => {
    try {
        const auth = await requireLocalUser(req);
        if (auth.error) return res.status(auth.status).json({ error: auth.error });
        const { plan } = req.body || {};
        if (plan !== 'pro') return res.status(400).json({ error: 'Invalid plan. Only "pro" is supported.' });
        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            return res.status(503).json({ error: 'Payment provider is not configured.' });
        }
        const planId = process.env.RAZORPAY_PRO_PLAN_ID || (await ensureProPlanId(razorpay));
        const subscription = await razorpay.subscriptions.create({
            plan_id: planId,
            customer_notify: 1,
            total_count: 120,
            quantity: 1,
            notes: { plan: 'pro', userId: auth.user.id, credits: '5000' },
        });
        res.json({
            id: subscription.id,
            amount: PRO_AMOUNT_PAISE,
            currency: 'INR',
            keyId: RAZORPAY_KEY_ID,
        });
    } catch (error) {
        console.error('Razorpay Order Error:', error);
        res.status(500).json({ error: error.message || 'Failed to create payment order' });
    }
};

const paymentVerifyHandler = async (req, res) => {
    try {
        const auth = await requireLocalUser(req);
        if (auth.error) return res.status(auth.status).json({ error: auth.error });

        const {
            razorpay_order_id,
            razorpay_subscription_id,
            razorpay_payment_id,
            razorpay_signature,
            plan,
        } = req.body || {};

        const subOrOrderId = razorpay_subscription_id || razorpay_order_id;
        if (!subOrOrderId || !razorpay_payment_id || !razorpay_signature || !plan) {
            return res.status(400).json({ error: 'Missing required payment verification parameters.' });
        }

        // Subscriptions: payment_id|subscription_id ; Orders: order_id|payment_id
        const signaturePayload = razorpay_subscription_id
            ? `${razorpay_payment_id}|${razorpay_subscription_id}`
            : `${razorpay_order_id}|${razorpay_payment_id}`;

        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(signaturePayload)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        if (!['captured', 'authorized'].includes(payment.status)) {
            return res.status(400).json({ error: 'Payment is not authorized or captured yet.' });
        }
        if (Number(payment.amount) !== PRO_AMOUNT_PAISE) {
            return res.status(400).json({ error: 'Payment amount does not match Pro plan.' });
        }

        let verifiedUserId = null;
        let creditsToAdd = 5000;
        let verifiedPlan = 'pro';
        if (razorpay_subscription_id) {
            const sub = await razorpay.subscriptions.fetch(razorpay_subscription_id);
            verifiedUserId = sub.notes?.userId;
            creditsToAdd = parseInt(sub.notes?.credits || '5000', 10);
            verifiedPlan = sub.notes?.plan || 'pro';
        } else {
            const order = await razorpay.orders.fetch(razorpay_order_id);
            verifiedUserId = order.notes?.userId;
            creditsToAdd = parseInt(order.notes?.credits || '5000', 10);
            verifiedPlan = order.notes?.plan || 'pro';
        }

        if (!verifiedUserId || verifiedUserId !== auth.user.id) {
            return res.status(403).json({ error: 'Payment does not belong to the authenticated user.' });
        }

        const { data: txResult, error: txError } = await supabase.rpc('process_razorpay_payment', {
            p_payment_id: razorpay_payment_id,
            p_order_id: subOrOrderId,
            p_user_id: verifiedUserId,
            p_amount: payment.amount || PRO_AMOUNT_PAISE,
            p_plan: verifiedPlan,
            p_credits_to_add: creditsToAdd,
        });

        if (txError) {
            console.error('DB upgrade transaction failed:', txError);
            return res.status(500).json({ error: 'Failed to process payment upgrade transaction.' });
        }
        if (txResult && !txResult.success) {
            if (txResult.code === 'DUPLICATE') {
                return res.status(409).json({ error: 'This payment has already been processed.' });
            }
            return res.status(400).json({ error: txResult.error || 'Failed to complete payment processing.' });
        }

        res.json({
            success: true,
            message: 'Payment verified and upgrade successful',
            tier: 'pro',
            newBalance: txResult?.new_balance,
        });
    } catch (error) {
        console.error('Verification Error:', error);
        res.status(500).json({ error: error.message });
    }
};

app.post('/api/payment-create-order', paymentCreateHandler);
app.post('/api/payment/create-order', paymentCreateHandler);
app.post('/api/payment-verify', paymentVerifyHandler);
app.post('/api/payment/verify', paymentVerifyHandler);

// OAUTH INITIATION (MOCKS for Local Dev)
app.post('/api/oauth-google-init', (req, res) => res.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=mock&redirect_uri=mock&response_type=code&scope=profile' }));
app.post('/api/oauth-slack-init', (req, res) => res.json({ url: 'https://slack.com/oauth/v2/authorize?client_id=mock&scope=chat:write' }));
app.post('/api/oauth-notion-init', (req, res) => res.json({ url: 'https://api.notion.com/v1/oauth/authorize?client_id=mock&response_type=code' }));
app.post('/api/oauth-discord-init', (req, res) => res.json({ url: 'https://discord.com/api/oauth2/authorize?client_id=mock&response_type=code' }));
app.post('/api/oauth-stripe-init', (req, res) => res.json({ url: 'https://connect.stripe.com/oauth/authorize?client_id=mock&response_type=code' }));

// 2. API Catch-All (Prevent HTML Fallthrough) - Using regex for Express 5 compatibility
app.all(/^\/api\/.*$/, (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

// === STATIC FILES (Frontend) ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/flow/:flowId', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// SPA Fallback - Catch all other routes and serve index.html
app.get(/^(?!\/api\/).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// 3. Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Server] Unhandled Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Save Run History (Server-Side to bypass RLS for Guests)
app.post('/api/run-history', async (req, res) => {
    try {
        const { flowId, runData, ownerId } = req.body;
        
        if (!flowId || !ownerId) {
            return res.status(400).json({ error: "Missing flowId or ownerId" });
        }

        const { error } = await supabase
            .from('run_history')
            .insert({
                flow_id: flowId,
                user_id: ownerId,
                status: runData.status,
                duration: runData.duration,
                credits_used: runData.creditsUsed,
                logs: runData.logs
            });

        if (error) throw error;
        
        res.json({ success: true });
    } catch (e) {
        console.error("[API] History Save Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Blupe Server running on port ${PORT}`);
});
