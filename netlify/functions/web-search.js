import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { getCorsHeaders } from './utils/cors.js';
import { enforceBilling } from './utils/billing.js';

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
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Enforce authentication
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
        const { query, apiKey } = body;

        // Rate limiting check
        if (authResult.user && authResult.user.id !== 'service_role') {
            const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
                p_user_id: authResult.user.id,
                p_endpoint: 'web-search',
                p_max_requests: 100,
                p_window_minutes: 60
            });
            if (rateLimitError) {
                console.error('[RateLimit] Error checking rate limit in Web Search:', rateLimitError);
            } else if (!allowed) {
                return {
                    statusCode: 429,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
                };
            }
        }

        // Credit deduction check
        const billingResult = await enforceBilling(authResult, 'web-search', body);
        if (!billingResult.allowed) {
            return {
                statusCode: billingResult.statusCode || 402,
                headers: corsHeaders,
                body: JSON.stringify({ error: billingResult.error })
            };
        }

        const key = apiKey || process.env.TAVILY_API_KEY;

        if (!key) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Missing TAVILY_API_KEY. Add it to Secrets." })
            };
        }

        console.log(`[Netlify] Web Search: "${query}"`);

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
            throw new Error(`Tavily API Error: ${errorText}`);
        }

        const data = await response.json();
        const answer = data.answer || data.results.map(r => `- ${r.title}: ${r.content}`).join('\n');
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ 
                status: 'success',
                summary: answer,
                result: answer, // for backwards compat with execute-flow which expects .result
                data: data.results,
                sources: data.results.map(r => ({ title: r.title, url: r.url }))
            })
        };

    } catch (error) {
        console.error("[Netlify] Web Search Error:", error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message })
        };
    }
}
