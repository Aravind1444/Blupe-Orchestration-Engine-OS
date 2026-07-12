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
        const { topic, maxResults, apiKey } = body;

        // Rate limiting check
        if (authResult.user && authResult.user.id !== 'service_role') {
            const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
                p_user_id: authResult.user.id,
                p_endpoint: 'deep-research',
                p_max_requests: 100,
                p_window_minutes: 60
            });
            if (rateLimitError) {
                console.error('[RateLimit] Error checking rate limit in Deep Research:', rateLimitError);
            } else if (!allowed) {
                return {
                    statusCode: 429,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
                };
            }
        }

        // Credit deduction check
        const billingResult = await enforceBilling(authResult, 'deep-research', body);
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

        if (!topic) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: "Research topic is required." })
            };
        }

        console.log(`[Netlify] Deep Research: "${topic}"`);

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
            console.error('[Netlify] Tavily Deep Research Error:', errorText);
            return {
                statusCode: response.status,
                headers: corsHeaders,
                body: JSON.stringify({ error: `Tavily API Error: ${errorText}` })
            };
        }

        const data = await response.json();
        const result = {
            summary: data.answer || 'No summary available',
            sources: (data.results || []).map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.substring(0, 300)
            })),
            conclusion: data.answer ? "Research findings synthesized above." : "Insufficient data found.",
            more_research_needed: !data.answer || data.answer.includes("I don't know")
        };
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ result })
        };

    } catch (error) {
        console.error("[Netlify] Deep Research Error:", error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message })
        };
    }
}
