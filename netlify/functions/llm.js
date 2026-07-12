// Netlify Serverless Function: LLM Proxy
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { getCorsHeaders } from './utils/cors.js';
import { enforceBilling } from './utils/billing.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export async function handler(event, context) {
    // Handle CORS preflight — must run before auth check
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Enforce authentication
    const authResult = await requireUser(event);
    if (authResult.error) {
        return {
            statusCode: authResult.status || 401,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: authResult.error })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { provider, model, prompt, system, temperature, maxTokens, secrets, apiKey, imageUrl } = body;

        // Rate limiting check
        if (authResult.user && authResult.user.id !== 'service_role') {
            const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
                p_user_id: authResult.user.id,
                p_endpoint: 'llm',
                p_max_requests: 100,
                p_window_minutes: 60
            });
            if (rateLimitError) {
                console.error('[RateLimit] Error checking rate limit in LLM proxy:', rateLimitError);
            } else if (!allowed) {
                return {
                    statusCode: 429,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
                };
            }
        }

        // Credit deduction check
        const billingResult = await enforceBilling(authResult, 'llm', body);
        if (!billingResult.allowed) {
            return {
                statusCode: billingResult.statusCode || 402,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: billingResult.error })
            };
        }

        if (!provider || !model || !prompt) {
            return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Missing required fields' }) };
        }

        // Get API key from: 1) direct apiKey param, 2) secrets array, 3) env vars
        let key = apiKey;
        if (!key) {
            if (provider === 'openai') {
                key = secrets?.find(s => s.key === 'OPENAI_API_KEY')?.value || process.env.OPENAI_API_KEY;
            } else if (provider === 'anthropic') {
                key = secrets?.find(s => s.key === 'ANTHROPIC_API_KEY')?.value || process.env.ANTHROPIC_API_KEY;
            } else if (provider === 'groq') {
                key = secrets?.find(s => s.key === 'GROQ_API_KEY')?.value || process.env.GROQ_API_KEY;
            } else if (provider === 'gemini') {
                key = secrets?.find(s => s.key === 'GEMINI_API_KEY')?.value || secrets?.find(s => s.key === 'API_KEY')?.value || process.env.GEMINI_API_KEY || process.env.API_KEY;
            }
        }

        if (!key && provider !== 'gemini') { 
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: `Missing API Key for ${provider}. Add it to Secrets.` })
            };
        }

        let result;
        let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        if (provider === 'openai') {
            // Use max_completion_tokens for GPT-5 and newer models, max_tokens for older ones
            const isNewerModel = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3');
            const tokenParam = isNewerModel ? 'max_completion_tokens' : 'max_tokens';
            
            // All GPT-5 models require temperature=1
            const isGPT5 = model.startsWith('gpt-5');
            const finalTemperature = isGPT5 ? 1 : (temperature || 0.7);
            
            // GPT-5 models use reasoning tokens which consume part of max_completion_tokens budget
            // Need to set much higher limit to account for reasoning overhead + actual output
            const finalMaxTokens = isGPT5 ? (maxTokens || 512) : (maxTokens || 1024);
            
            const apiRes = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${key}` 
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        ...(system ? [{ role: 'system', content: system }] : []),
                        { 
                            role: 'user', 
                            content: imageUrl 
                                ? [
                                    { type: 'text', text: prompt },
                                    { type: 'image_url', image_url: { url: imageUrl } }
                                  ]
                                : prompt
                        }
                    ],
                    temperature: finalTemperature,
                    [tokenParam]: finalMaxTokens
                })
            });

            if (!apiRes.ok) {
                const errorText = await apiRes.text();
                throw new Error(errorText);
            }

            const data = await apiRes.json();
            console.log('[LLM Debug] OpenAI Model:', model, 'Tokens:', finalMaxTokens);
            console.log('[LLM Debug] Response:', JSON.stringify(data, null, 2));
            
            // Extract content
            result = data.choices?.[0]?.message?.content || '';
            
            if (!result) {
                console.log('[LLM Debug] Empty result for model:', model);
                console.log('[LLM Debug] Usage:', JSON.stringify(data.usage));
            }
            usage = data.usage || usage;

        } else if (provider === 'groq') {
            const baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
            
            const apiRes = await fetch(baseUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${key}` 
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        ...(system ? [{ role: 'system', content: system }] : []),
                        { role: 'user', content: prompt }
                    ],
                    temperature: temperature || 0.9,
                    max_tokens: maxTokens || 250
                })
            });

            if (!apiRes.ok) {
                const errorText = await apiRes.text();
                throw new Error(errorText);
            }

            const data = await apiRes.json();
            result = data.choices[0].message.content;
            usage = data.usage;

        } else if (provider === 'anthropic') {
            const anthropic = new Anthropic({ apiKey: key });
            const message = await anthropic.messages.create({
                model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                system: system || undefined, // Top-level system param only
                max_tokens: maxTokens || 1024,
                temperature: temperature || 0.7
            });

            result = message.content[0].text;
            usage = {
                prompt_tokens: message.usage.input_tokens,
                completion_tokens: message.usage.output_tokens,
                total_tokens: message.usage.input_tokens + message.usage.output_tokens
            };

        } else if (provider === 'gemini') {
            const apiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-goog-api-key': key 
                    },
                    body: JSON.stringify({
                        contents: [{ 
                            parts: await (async () => {
                                const parts = [{ text: system ? `${system}\n\n${prompt}` : prompt }];
                                if (imageUrl) {
                                    try {
                                        const res = await fetch(imageUrl);
                                        const buffer = await res.arrayBuffer();
                                        const mimeType = res.headers.get('content-type') || 'image/jpeg';
                                        parts.push({
                                            inline_data: {
                                                mime_type: mimeType,
                                                data: Buffer.from(buffer).toString('base64')
                                            }
                                        });
                                    } catch (e) {
                                        console.error('[Gemini Image Fetch Error]', e);
                                    }
                                }
                                return parts;
                            })()
                        }],
                        generationConfig: {
                            temperature: temperature || 0.9,
                            maxOutputTokens: maxTokens || 250
                        }
                    })
                }
            );

            if (!apiRes.ok) {
                const errText = await apiRes.text();
                console.error('[Gemini API Error]', apiRes.status, errText);
                throw new Error(`Gemini API Error (${apiRes.status}): ${errText}`);
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
        } else {
            throw new Error(`Unknown provider: ${provider}`);
        }

        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ text: result, usage })
        };

    } catch (error) {
        console.error('[Netlify Function] LLM Error:', error);
        return {
            statusCode: 500,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: error.message })
        };
    }
}
