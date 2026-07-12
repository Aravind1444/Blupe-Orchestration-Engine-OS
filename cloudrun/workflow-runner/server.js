import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import * as math from 'mathjs';
import * as jose from 'jose';
import dns from 'node:dns';

const app = express();
app.use(express.json({ limit: '10mb' }));

const supabaseClientCache = new Map();
function getSupabaseClient(supabaseUrl, supabaseKey) {
    const cacheKey = `${supabaseUrl}::${supabaseKey}`;
    if (!supabaseClientCache.has(cacheKey)) {
        supabaseClientCache.set(cacheKey, createClient(supabaseUrl, supabaseKey));
    }
    return supabaseClientCache.get(cacheKey);
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Derive a 32-byte key from MASTER_KEY for AES-256-GCM (no insecure defaults)
function getEncryptionKey() {
  const MASTER_KEY = process.env.SECRETS_MASTER_KEY || '';
  if (!MASTER_KEY || MASTER_KEY.length < 16) {
    throw new Error('SECRETS_MASTER_KEY is not configured');
  }
  if (MASTER_KEY === 'd3Ytc2VjcmV0cy1tYXN0ZXIta2V5LWZvci1kZXYtMTIzNDU=') {
    throw new Error('SECRETS_MASTER_KEY is set to an insecure default — rotate it');
  }
  return crypto.createHash('sha256').update(MASTER_KEY).digest();
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.startsWith('enc:')) {
    return encryptedText; // Fallback for backward compatibility
  }
  try {
    const ENCRYPTION_KEY = getEncryptionKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 4) return encryptedText;
    const iv = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const authTag = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Decryption] Decryption failed:', err.message);
    return '[Decryption Failed]';
  }
}

async function edgeFetch(url, options = {}) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
    const headers = new Headers(options.headers || {});
    if (serviceKey) {
        headers.set('Authorization', `Bearer ${serviceKey}`);
    }
    return fetch(url, {
        ...options,
        headers
    });
}

// Credit costs (must match client-side BillingService)
const CREDIT_COSTS = {
    base_fee: 10,
    email: 5,
    whatsapp_send: 5,
    razorpay_action: 5,
    telegram_send: 3,
    discord_send: 3,
    web_search: 3,
    deep_research: 35,
    extract_url: 10,
    crawl_site: 25,
    mcp: 2,
    reasoning_platform: 20,
    reasoning_byok: 3,
    api_call: 2,
    logic: 1, // javascript, condition, router
    llm_default: 10,
    ai_vision: 15,
};

const BUILT_IN_NODE_TYPES = new Set([
    'start', 'form_trigger', 'webhook', 'schedule', 'gemini', 'llm', 'ai_vision',
    'reasoning', 'agent', 'batch', 'condition', 'router', 'javascript', 'wait',
    'approval', 'api_call', 'rss', 'slack', 'email', 'sheets', 'web_search',
    'deep_research', 'extract_url', 'crawl_site', 'mcp', 'hubspot', 'stripe',
    'json', 'math', 'text', 'input', 'note', 'output',
    'telegram_trigger', 'telegram_send', 'whatsapp_trigger', 'whatsapp_send',
    'razorpay_trigger', 'razorpay_action', 'discord_trigger', 'discord_send'
]);

// Simple variable interpolation (matches client-side logic)
function resolvePrimaryString(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object' && !Array.isArray(val)) {
        if (typeof val.answer === 'string') return val.answer;
        if (typeof val.text === 'string') return val.text;
        if (typeof val.summary === 'string') return val.summary;
        if (typeof val.content === 'string') return val.content;
        return JSON.stringify(val);
    }
    return String(val);
}

function interpolateVariables(template, context, secrets) {
    if (!template) return '';

    // Check if template is just a variable reference
    if (template.startsWith('{{') && template.endsWith('}}') && (template.match(/\{\{/g) || []).length === 1) {
        const key = template.slice(2, -2).trim();
        if (key.startsWith('env.')) {
            return secrets[key.replace('env.', '')] || template;
        }
        if (context.hasOwnProperty(key)) {
            return resolvePrimaryString(context[key]);
        }
        // Dot notation
        const parts = key.split('.');
        if (parts.length > 1) {
            let current = context;
            for (const part of parts) {
                if (current === undefined || current === null) break;
                current = current[part];
            }
            if (current !== undefined) return resolvePrimaryString(current);
        }
    }

    return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
        const variable = key.trim();
        if (variable.startsWith('env.')) {
            return secrets[variable.replace('env.', '')] || `{{${variable}}}`;
        }
        if (context.hasOwnProperty(variable)) {
            return resolvePrimaryString(context[variable]);
        }
        // Dot notation
        const parts = variable.split('.');
        if (parts.length > 1) {
            let current = context;
            for (const part of parts) {
                if (current === undefined || current === null) return `{{${variable}}}`;
                current = current[part];
            }
            return current !== undefined
                ? resolvePrimaryString(current)
                : `{{${variable}}}`;
        }
        return `{{${variable}}}`;
    });
}

// Helper to parse RSS/Atom XML text
function parseRss(xmlText, limit = 10) {
    const feedItems = [];
    const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g) || [];
    const max = Math.min(itemMatches.length, limit);

    for (let i = 0; i < max; i++) {
        const itemContent = itemMatches[i];
        
        const getTag = (tag) => {
            const match = itemContent.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
            if (match) {
                return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
            }
            if (tag === 'link') {
                const hrefMatch = itemContent.match(/<link[^>]+href=["']([^"']+)["']/i);
                if (hrefMatch) return hrefMatch[1].trim();
            }
            return '';
        };

        const title = getTag('title');
        const link = getTag('link');
        const description = getTag('description') || getTag('summary') || getTag('content');
        const pubDate = getTag('pubDate') || getTag('published') || getTag('updated');
        const author = getTag('author') || getTag('dc:creator');

        feedItems.push({
            title: title,
            link: link,
            description: description.replace(/<[^>]*>/g, '').trim().substring(0, 500),
            pubDate: pubDate,
            author: author
        });
    }
    return feedItems;
}

// Helper to evaluate smart JSON properties
function processSmartJSON(str, context, secrets) {
    if (!str || str.trim() === '') return {};
    try {
        const parsed = JSON.parse(str);
        const walk = (obj) => {
            if (typeof obj === 'string') {
                return interpolateVariables(obj, context, secrets);
            }
            if (Array.isArray(obj)) {
                return obj.map(walk);
            }
            if (typeof obj === 'object' && obj !== null) {
                const newObj = {};
                for (const key of Object.keys(obj)) {
                    newObj[key] = walk(obj[key]);
                }
                return newObj;
            }
            return obj;
        };
        return walk(parsed);
    } catch {
        return {};
    }
}


function setObjectPath(obj, path, value) {
    const parts = String(path || '').split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (current[key] === undefined || current[key] === null) {
            const nextKey = parts[i + 1];
            current[key] = Number.isNaN(Number(nextKey)) ? {} : [];
        }
        current = current[key];
    }
    if (parts.length > 0) {
        current[parts[parts.length - 1]] = value;
    }
}

async function callLlmDirectly({ provider, model, prompt, system, temperature, maxTokens, secrets, apiKey, imageUrl }) {
    const resolvedProvider = provider || 'gemini';
    const key = resolveLlmApiKey(resolvedProvider, secrets, apiKey);

    if (!isUsableSecretValue(key)) {
        throw new Error(
            `Missing API Key for ${resolvedProvider}. ` +
            `Platform keys must be mounted on Cloud Run (Secret Manager) or add a user secret.`
        );
    }

    let result = '';
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    if (resolvedProvider === 'openai') {
        const isNewerModel = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3');
        const tokenParam = isNewerModel ? 'max_completion_tokens' : 'max_tokens';
        const isGPT5 = model.startsWith('gpt-5');
        const finalTemperature = isGPT5 ? 1 : (temperature || 0.7);
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
            const err = new Error(`OpenAI API Error (${apiRes.status}): ${errorText}`);
            err.status = apiRes.status;
            throw err;
        }

        const data = await apiRes.json();
        result = data.choices?.[0]?.message?.content || '';
        usage = data.usage || usage;

    } else if (resolvedProvider === 'groq') {
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
            const err = new Error(`Groq API Error (${apiRes.status}): ${errorText}`);
            err.status = apiRes.status;
            throw err;
        }

        const data = await apiRes.json();
        result = data.choices?.[0]?.message?.content || '';
        usage = data.usage || usage;

    } else if (resolvedProvider === 'anthropic') {
        const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                system: system || undefined,
                max_tokens: maxTokens || 1024,
                temperature: temperature || 0.7
            })
        });

        if (!apiRes.ok) {
            const errorText = await apiRes.text();
            const err = new Error(`Anthropic API Error (${apiRes.status}): ${errorText}`);
            err.status = apiRes.status;
            throw err;
        }

        const data = await apiRes.json();
        result = data.content?.[0]?.text || '';
        usage = {
            prompt_tokens: data.usage?.input_tokens || 0,
            completion_tokens: data.usage?.output_tokens || 0,
            total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        };

    } else if (resolvedProvider === 'gemini') {
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
                                const imgFetch = await fetch(imageUrl, {
                                    headers: { 'User-Agent': 'Blupe-Workflow-Runner/1.0' }
                                });
                                const mimeType = (imgFetch.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
                                if (!imgFetch.ok || !mimeType.startsWith('image/')) {
                                    throw new Error(`Image URL did not return an image (HTTP ${imgFetch.status}, ${mimeType}). Check the URL is a direct, publicly accessible image link.`);
                                }
                                const buffer = await imgFetch.arrayBuffer();
                                parts.push({
                                    inline_data: {
                                        mime_type: mimeType,
                                        data: Buffer.from(buffer).toString('base64')
                                    }
                                });
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
            const err = new Error(`Gemini API Error (${apiRes.status}): ${errText}`);
            err.status = apiRes.status;
            throw err;
        }

        const data = await apiRes.json();
        result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const inputEst = Math.ceil((prompt.length + (system?.length || 0)) / 4);
        const outputEst = Math.ceil(result.length / 4);
        usage = {
            prompt_tokens: inputEst,
            completion_tokens: outputEst,
            total_tokens: inputEst + outputEst
        };
    } else {
        throw new Error(`Unknown provider: ${resolvedProvider}`);
    }

    return { text: result, usage };
}

async function validateMcpUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        throw new Error('Invalid URL type');
    }
    let u;
    try {
        u = new URL(rawUrl);
    } catch {
        throw new Error(`Invalid URL format: ${rawUrl}`);
    }

    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error(`Blocked protocol: ${u.protocol}`);
    }

    const host = u.hostname.toLowerCase();
    
    if (
        host === 'localhost' ||
        host === 'metadata.google.internal' ||
        host.endsWith('.local') ||
        host === '0.0.0.0'
    ) {
        throw new Error(`Blocked host: ${host}`);
    }

    const isPrivateIp = (ip) => {
        const ipv4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
        if (ipv4) {
            const a = Number(ipv4[1]);
            const b = Number(ipv4[2]);
            return (
                a === 10 ||
                a === 127 ||
                a === 0 ||
                (a === 172 && b >= 16 && b <= 31) ||
                (a === 192 && b === 168) ||
                (a === 169 && b === 254)
            );
        }
        if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80') || ip === '::') {
            return true;
        }
        return false;
    };

    if (isPrivateIp(host)) {
        throw new Error(`Blocked private IP: ${host}`);
    }

    try {
        const lookup = await dns.promises.lookup(host, { all: true });
        for (const entry of lookup) {
            if (isPrivateIp(entry.address)) {
                throw new Error(`Blocked private IP resolution: ${entry.address} for host ${host}`);
            }
        }
    } catch (e) {
        if (e.code === 'ENOTFOUND') {
            throw new Error(`DNS resolution failed for host: ${host}`);
        }
    }
}

async function readSseStream(response, onEvent, timeoutMs = 8000) {
    let reader = null;
    let cancelStream = null;
    let isFinished = false;

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(async () => {
            isFinished = true;
            if (reader) {
                try { await reader.cancel(); } catch (e) {}
            }
            if (cancelStream) {
                try { await cancelStream(); } catch (e) {}
            }
            reject(new Error('SSE stream read timeout'));
        }, timeoutMs);
    });

    const readPromise = (async () => {
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        
        if (response.body.getReader) {
            reader = response.body.getReader();
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done || isFinished) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    let currentEvent = 'message';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed === '') continue;
                        if (trimmed.startsWith('event:')) {
                            currentEvent = trimmed.slice(6).trim();
                        } else if (trimmed.startsWith('data:')) {
                            const data = trimmed.slice(5).trim();
                            const shouldStop = await onEvent(currentEvent, data);
                            if (shouldStop) {
                                return;
                            }
                        }
                    }
                }
            } finally {
                try { await reader.cancel(); } catch (e) {}
            }
        } else {
            if (typeof response.body.destroy === 'function') {
                cancelStream = () => response.body.destroy();
            }

            for await (const chunk of response.body) {
                if (isFinished) break;
                buffer += decoder.decode(chunk, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                let currentEvent = 'message';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed === '') continue;
                    if (trimmed.startsWith('event:')) {
                        currentEvent = trimmed.slice(6).trim();
                    } else if (trimmed.startsWith('data:')) {
                        const data = trimmed.slice(5).trim();
                        const shouldStop = await onEvent(currentEvent, data);
                        if (shouldStop) {
                            return;
                        }
                    }
                }
            }
        }
    })();

    await Promise.race([readPromise, timeoutPromise]);
}

async function callMcpDirectly(serverUrl, toolName, args, auth) {
    await validateMcpUrl(serverUrl);
    
    const requestId = Date.now();
    const jsonRpcRequest = {
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: { name: toolName, arguments: args }
    };

    const headers = {
        'Accept': 'text/event-stream, application/json',
        'MCP-Protocol-Version': '2025-06-18'
    };

    if (auth) {
        switch (auth.type) {
            case 'api_key':
                const apiHeader = auth.headerName || (serverUrl.includes('sarvam.ai') ? 'api-subscription-key' : 'X-API-Key');
                if (auth.key) {
                    headers[apiHeader] = auth.key;
                }
                break;
            case 'bearer':
                if (auth.key) {
                    headers['Authorization'] = `Bearer ${auth.key}`;
                }
                break;
            case 'custom':
                if (auth.headers && typeof auth.headers === 'object') {
                    Object.assign(headers, auth.headers);
                }
                break;
        }
    }

    let sseResponse = null;
    let resolvedSseUrl = serverUrl;

    try {
        sseResponse = await fetch(resolvedSseUrl, {
            method: 'GET',
            headers
        });

        const initialContentType = sseResponse.headers.get('content-type') || '';
        const isHtml = initialContentType.includes('text/html');

        if ((!sseResponse.ok || sseResponse.status === 405 || sseResponse.status === 404 || isHtml) && !resolvedSseUrl.endsWith('/sse')) {
            const fallbackUrl = resolvedSseUrl.endsWith('/') ? `${resolvedSseUrl}sse` : `${resolvedSseUrl}/sse`;
            console.log(`[MCP] Primary SSE GET failed/returned HTML. Trying fallback: ${fallbackUrl}`);
            const fallbackResponse = await fetch(fallbackUrl, {
                method: 'GET',
                headers
            });
            if (fallbackResponse.ok) {
                sseResponse = fallbackResponse;
                resolvedSseUrl = fallbackUrl;
            }
        }
    } catch (err) {
        console.warn(`[MCP] SSE GET request failed: ${err.message}.`);
        if (!resolvedSseUrl.endsWith('/sse')) {
            const fallbackUrl = resolvedSseUrl.endsWith('/') ? `${resolvedSseUrl}sse` : `${resolvedSseUrl}/sse`;
            try {
                console.log(`[MCP] Trying fallback: ${fallbackUrl}`);
                const fallbackResponse = await fetch(fallbackUrl, {
                    method: 'GET',
                    headers
                });
                if (fallbackResponse.ok) {
                    sseResponse = fallbackResponse;
                    resolvedSseUrl = fallbackUrl;
                }
            } catch (fallbackErr) {
                console.warn(`[MCP] Fallback SSE GET failed: ${fallbackErr.message}`);
            }
        }
    }

    const contentType = sseResponse?.headers.get('content-type') || '';

    if (sseResponse && sseResponse.ok && contentType.includes('text/event-stream')) {
        console.log(`[MCP] SSE stream opened. Waiting for endpoint event to POST request...`);

        let postUrl = '';
        let jsonRpcResponse = null;
        let postError = null;

        try {
            await readSseStream(sseResponse, async (eventType, eventData) => {
                if (eventType === 'endpoint') {
                    postUrl = new URL(eventData, resolvedSseUrl).toString();
                    await validateMcpUrl(postUrl);

                    const postHeaders = {
                        'Content-Type': 'application/json',
                        ...headers
                    };
                    delete postHeaders['Accept'];

                    fetch(postUrl, {
                        method: 'POST',
                        headers: postHeaders,
                        body: JSON.stringify(jsonRpcRequest)
                    }).then(async (res) => {
                        if (!res.ok) {
                            const errBody = await res.text();
                            postError = new Error(`POST failed: ${res.status} - ${errBody}`);
                            if (sseResponse.body.getReader) {
                                const r = sseResponse.body.getReader();
                                await r.cancel();
                            }
                        }
                    }).catch(async (err) => {
                        postError = err;
                        if (sseResponse.body.getReader) {
                            const r = sseResponse.body.getReader();
                            await r.cancel();
                        }
                    });
                } else if (eventType === 'message') {
                    try {
                        const parsed = JSON.parse(eventData);
                        if (parsed.id === requestId) {
                            jsonRpcResponse = parsed;
                            return true;
                        }
                    } catch (e) {}
                }
                
                if (postError) throw postError;
                return false;
            });
        } catch (streamErr) {
            console.warn(`[MCP] SSE stream reading ended: ${streamErr.message}`);
            if (postError) throw postError;
        }

        if (jsonRpcResponse) {
            if (jsonRpcResponse.error) {
                throw new Error(`MCP Error: ${jsonRpcResponse.error.message || 'MCP server error'}`);
            }
            return jsonRpcResponse.result;
        }
    }

    console.log(`[MCP] Invoking direct POST fallback to ${serverUrl}`);
    const directHeaders = {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-06-18',
        ...headers
    };
    delete directHeaders['Accept'];

    await validateMcpUrl(serverUrl);
    const response = await fetch(serverUrl, {
        method: 'POST',
        headers: directHeaders,
        body: JSON.stringify(jsonRpcRequest)
    });

    if (!response.ok) {
        throw new Error(`MCP server returned ${response.status}`);
    }

    const resContentType = response.headers.get('content-type') || '';
    if (!resContentType.includes('application/json')) {
        throw new Error('MCP server returned a non-JSON response');
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(`MCP Error: ${data.error.message || 'MCP server error'}`);
    }
    return data.result;
}

// Helper for LLM calls
async function generateText(prompt, secrets) {
    const res = await callLlmDirectly({
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite-preview',
        prompt,
        secrets
    });
    return res.text;
}

// Helper for Exponential Backoff retry
async function withRetry(fn, maxAttempts = 3, initialDelayMs = 250, factor = 2) {
    let attempt = 1;
    let delayMs = initialDelayMs;

    while (true) {
        try {
            const res = await fn();
            if (res.error) {
                const isRetryable = checkIsRetryable(res.error, res.errorStatus);
                if (isRetryable && attempt < maxAttempts) {
                    console.warn(`[Retry] Attempt ${attempt} returned error: ${res.error}. Retrying in ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    attempt++;
                    delayMs *= factor;
                    continue;
                }
            }
            return res;
        } catch (err) {
            const isRetryable = checkIsRetryable(err.message || String(err), err.status);
            if (isRetryable && attempt < maxAttempts) {
                console.warn(`[Retry] Attempt ${attempt} threw: ${err.message}. Retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                attempt++;
                delayMs *= factor;
                continue;
            }
            return { error: err.message || String(err) };
        }
    }
}

function checkIsRetryable(errorMsg, status) {
    const msg = String(errorMsg).toLowerCase();
    
    if (status) {
        return status === 429 || (status >= 500 && status < 600);
    }
    
    const statusMatch = msg.match(/(?:status|code)[\s:]*(\d{3})/i) || msg.match(/\b(\d{3})\b/);
    if (statusMatch) {
        const code = parseInt(statusMatch[1], 10);
        if (code === 429 || (code >= 500 && code < 600)) {
            return true;
        }
        if (code >= 400 && code < 500) {
            return false;
        }
    }
    
    const networkErrorPatterns = [
        'network error', 'fetch failed', 'timeout', 'time out', 'econnreset', 'etimedout', 
        'enotfound', 'econnrefused', 'socket hang up', 'rate limit', 'too many requests'
    ];
    if (networkErrorPatterns.some(pat => msg.includes(pat))) {
        return true;
    }
    
    return false;
}

const secretsCache = new Map(); // userId -> { secrets: { ... }, expiresAt: number }


/**
 * Platform-level API keys from Cloud Run env / Secret Manager.
 * These fill gaps when the user has not stored BYOK secrets.
 * User secrets always win on key collision (see mergeSecrets).
 */
const PLATFORM_SECRET_KEYS = [
    'API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY',
    'TAVILY_API_KEY',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'EMAIL_FROM',
    'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
    'SLACK_WEBHOOK', 'SLACK_ACCESS_TOKEN',
];

function isUsableSecretValue(val) {
    if (val === undefined || val === null) return false;
    const s = String(val).trim();
    if (!s) return false;
    if (s === '[Decryption Failed]' || s === 'undefined' || s === 'null') return false;
    return true;
}

/**
 * Platform-level API keys from Cloud Run Secret Manager (injected as process.env).
 * These power LLM / search / email when the user has no BYOK entry.
 */
function getPlatformSecrets() {
    const platform = {};
    for (const key of PLATFORM_SECRET_KEYS) {
        const val = process.env[key];
        if (isUsableSecretValue(val)) {
            platform[key] = String(val).trim();
        }
    }
    return platform;
}

/**
 * Merge platform defaults with per-user secrets.
 * User BYOK values override platform — but empty / broken user values do NOT
 * wipe platform keys (common failure mode after Cloud Run migration).
 */
function mergeSecrets(userSecrets = {}) {
    const merged = { ...getPlatformSecrets() };
    if (userSecrets && typeof userSecrets === 'object') {
        for (const [key, val] of Object.entries(userSecrets)) {
            if (isUsableSecretValue(val)) {
                merged[key] = String(val).trim();
            }
        }
    }
    return merged;
}

/** Resolve an LLM provider key with full fallback chain. */
function resolveLlmApiKey(provider, secrets = {}, explicitKey) {
    if (isUsableSecretValue(explicitKey)) return String(explicitKey).trim();
    const s = secrets || {};
    const p = (provider || 'gemini').toLowerCase();
    if (p === 'openai') {
        return s.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
    }
    if (p === 'anthropic') {
        return s.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';
    }
    if (p === 'groq') {
        return s.GROQ_API_KEY || process.env.GROQ_API_KEY || '';
    }
    // gemini (default): accept both GEMINI_API_KEY and legacy API_KEY
    return s.GEMINI_API_KEY || s.API_KEY
        || process.env.GEMINI_API_KEY || process.env.API_KEY
        || '';
}

/**
 * Persist a run to run_history using the live schema.
 * Production columns (verified): id, flow_id, user_id, status, duration,
 * credits_used, logs, created_at, cost — optional triggered_by if migrated.
 */
async function saveRunHistory(supabase, {
    runId,
    flowId,
    userId,
    status,
    duration,
    creditsUsed,
    logs,
    triggerSource,
}) {
    // Validate FKs — invalid UUIDs / missing rows must not abort the whole run
    let safeFlowId = flowId || null;
    let safeUserId = userId || null;

    if (safeFlowId) {
        const { data: flowRow } = await supabase
            .from('flows')
            .select('id')
            .eq('id', safeFlowId)
            .maybeSingle();
        if (!flowRow) {
            console.warn(`[Execute] run_history: flow ${safeFlowId} not found; saving with flow_id=null`);
            safeFlowId = null;
        }
    }

    if (safeUserId && safeUserId !== 'service_role') {
        // auth.users is not always readable; if insert fails on FK we retry without user_id
    } else if (safeUserId === 'service_role') {
        safeUserId = null;
    }

    const baseRow = {
        flow_id: safeFlowId,
        user_id: safeUserId,
        status,
        duration: Math.round(Number(duration) || 0),
        credits_used: Math.round(Number(creditsUsed) || 0),
        logs: logs || [],
        created_at: new Date().toISOString(),
    };

    // run_history.id is UUID — only set when the client runId is a valid UUID
    // (canvas uses crypto.randomUUID(); synthetic/smoke ids fall back to DB default)
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (runId && uuidRe.test(String(runId))) {
        baseRow.id = runId;
    }

    // Prefer writing trigger source when the column exists (post-migration)
    const withTrigger = { ...baseRow, triggered_by: triggerSource || 'Cloud' };

    let { error } = await supabase.from('run_history').insert(withTrigger);

    if (error && /triggered_by/i.test(error.message || '')) {
        console.warn('[Execute] run_history.triggered_by missing — retrying without it. Apply sql/add_run_history_triggered_by.sql');
        ({ error } = await supabase.from('run_history').insert(baseRow));
    }

    // FK failure on user_id (e.g. synthetic smoke-test ids)
    if (error && /user_id|foreign key/i.test(error.message || '')) {
        console.warn('[Execute] run_history user_id FK failed — retrying without user_id');
        const retry = { ...baseRow, user_id: null };
        ({ error } = await supabase.from('run_history').insert(retry));
        if (error && /triggered_by/i.test(error.message || '')) {
            // already without trigger in baseRow
        }
    }

    // Duplicate run id (resume / double-save) — upsert logs/status
    if (error && /duplicate|unique/i.test(error.message || '')) {
        const { error: upErr } = await supabase
            .from('run_history')
            .update({
                status: baseRow.status,
                duration: baseRow.duration,
                credits_used: baseRow.credits_used,
                logs: baseRow.logs,
            })
            .eq('id', runId);
        if (upErr) {
            console.error('[Execute] Failed to update run history:', upErr.message);
            return false;
        }
        return true;
    }

    if (error) {
        console.error('[Execute] Failed to save run history:', error.message);
        return false;
    }

    console.log(`[Execute] Run history saved: ${runId} status=${status}`);
    return true;
}

async function getDecryptedSecrets(userId, supabase) {
    // No user → platform secrets only (merged by caller via mergeSecrets)
    if (!userId || userId === 'service_role') {
        return {};
    }

    const cached = secretsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.secrets;
    }

    const { data: secretsData, error } = await supabase
        .from('user_secrets')
        .select('key_name, value')
        .eq('user_id', userId);

    if (error) throw error;

    const secrets = {};
    (secretsData || []).forEach((s) => {
        const val = decrypt(s.value);
        if (val === '[Decryption Failed]') {
            throw new Error(`Decryption failed for secret "${s.key_name}". Please verify SECRETS_MASTER_KEY.`);
        }
        secrets[s.key_name] = val;
    });

    secretsCache.set(userId, {
        secrets,
        expiresAt: Date.now() + 60000 // 60s TTL
    });

    return secrets;
}

async function hmacSha256Hex(secret, data) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

// Dispatch a Human-in-the-Loop approval request to the configured channel
async function sendApprovalNotification(notify, resumeToken) {
    if (!notify || notify.channel === 'none') return;

    const approveUrl = `${getSiteUrl()}/api/resume-flow?token=${resumeToken}&action=approve`;
    const rejectUrl = `${getSiteUrl()}/api/resume-flow?token=${resumeToken}&action=reject`;
    const text = `[Bell] Approval required\n\n${notify.message}\n\n[✓] Approve: ${approveUrl}\n[✗] Reject: ${rejectUrl}`;

    try {
        switch (notify.channel) {
            case 'telegram': {
                if (!notify.telegramBotToken || !notify.telegramChatId) {
                    throw new Error('Telegram notification needs a bot token and chat ID');
                }
                const res = await fetch(`https://api.telegram.org/bot${notify.telegramBotToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: notify.telegramChatId, text, disable_web_page_preview: true }),
                });
                const data = await res.json();
                if (!res.ok || !data.ok) throw new Error(data.description || JSON.stringify(data));
                break;
            }
            case 'discord': {
                if (!notify.discordWebhookUrl) {
                    throw new Error('Discord notification needs an incoming webhook URL');
                }
                const res = await fetch(notify.discordWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: text.slice(0, 2000) }),
                });
                if (!res.ok) throw new Error(`Discord webhook responded ${res.status}`);
                break;
            }
            case 'slack': {
                if (!notify.slackWebhookUrl) {
                    throw new Error('Slack notification needs an incoming webhook URL');
                }
                const res = await fetch(notify.slackWebhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text }),
                });
                if (!res.ok) throw new Error(`Slack webhook responded ${res.status}`);
                break;
            }
            case 'webhook': {
                if (!notify.webhookUrl) return;
                const timestamp = Date.now().toString();
                const body = JSON.stringify({
                    event: 'approval_requested',
                    message: notify.message,
                    token: resumeToken,
                    resumeUrl: approveUrl,
                    approveUrl,
                    rejectUrl,
                    timestamp,
                });
                const headers = { 'Content-Type': 'application/json' };
                if (notify.webhookSecret) {
                    headers['X-Bloope-Timestamp'] = timestamp;
                    headers['X-Bloope-Signature'] = `sha256=${await hmacSha256Hex(notify.webhookSecret, `${timestamp}.${body}`)}`;
                }
                const res = await fetch(notify.webhookUrl, { method: 'POST', headers, body });
                if (!res.ok) throw new Error(`Approval webhook responded ${res.status}`);
                break;
            }
        }
    } catch (e) {
        console.error(`[Approval] Failed to notify via ${notify.channel}:`, e.message);
    }
}

function filterSecretsForSandbox(code, secrets, capabilities = []) {
    const filtered = {};
    if (!secrets || typeof secrets !== 'object') return filtered;

    // 1. Check capabilities for required secrets
    if (capabilities.includes('llm')) {
        for (const key of ['API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY']) {
            if (secrets[key] !== undefined) {
                filtered[key] = secrets[key];
            }
        }
    }
    if (capabilities.includes('sarvam')) {
        for (const key of ['SARVAM_API_KEY', 'SARVAM_SUBSCRIPTION_KEY']) {
            if (secrets[key] !== undefined) {
                filtered[key] = secrets[key];
            }
        }
    }

    // 2. Scan code for explicit references to secrets.KEY_NAME or secrets['KEY_NAME']
    if (code && typeof code === 'string') {
        const wordPattern = /\bsecrets\b/;
        if (wordPattern.test(code)) {
            let matchedAny = false;
            for (const [key, value] of Object.entries(secrets)) {
                const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const pattern = new RegExp(`secrets(?:\\s*\\.\\s*${escapedKey}|\\s*\\[\\s*['"\` ]\\s*${escapedKey}\\s*['"\` ]\\s*\\])`, 'i');
                if (pattern.test(code)) {
                    filtered[key] = value;
                    matchedAny = true;
                }
            }
            // If "secrets" word is present but no static key is explicitly matched,
            // fall back to passing all keys to preserve dynamic access compatibility.
            if (!matchedAny) {
                Object.assign(filtered, secrets);
            }
        }
    }

    return filtered;
}

function getSiteUrl() {
    const url = process.env.SITE_URL;
    if (!url || url === 'undefined' || url === 'null' || url.trim() === '') {
        console.log('[Config] SITE_URL not set or invalid, utilizing fallback: https://blupe.space');
        return 'https://blupe.space';
    }
    return url.replace(/\/$/, ''); // Remove trailing slash if present
}

// Execute a single node
async function executeNode(node, context, secrets, supabase, userId, flowId, runId) {
    const nodeType = node.data?.type || node.type;
    let output = null;
    let credits = 0;
    let error;
    let activeHandles;
    let consoleLogs;

    try {
        if (!BUILT_IN_NODE_TYPES.has(nodeType)) {
            const customRes = await edgeFetch(`${getSiteUrl()}/api/custom-node-executor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    node,
                    context,
                    secrets,
                }),
            });

            const customPayload = await customRes.json().catch(() => ({}));
            if (!customRes.ok) {
                throw new Error(customPayload.error || 'Custom node execution failed');
            }

            output = customPayload.output;
            credits = customPayload.creditsUsed ?? Math.max(0, Number(node.data?.customCreditCost ?? 1));
            return { output, credits };
        }

        switch (nodeType) {
            case 'start':
            case 'webhook':
            case 'schedule':
            case 'form_trigger':
            case 'whatsapp_trigger':
            case 'razorpay_trigger':
            case 'telegram_trigger':
            case 'discord_trigger':
                // Trigger nodes - just pass through
                output = { ...context };
                break;

            case 'approval': {
                const resumeToken = crypto.randomUUID();
                const approvalMsg = interpolateVariables(node.data.approvalMessage || 'Please approve this step.', context, secrets);
                const webhookUrl = interpolateVariables(node.data.webhookUrl || '', context, secrets);

                // Backward compat
                const channel = node.data.approvalNotify || (webhookUrl ? 'webhook' : 'none');

                const approvalNotification = {
                    channel,
                    message: approvalMsg,
                    webhookUrl,
                    webhookSecret: node.data.webhookSecret || '',
                    telegramBotToken: interpolateVariables(node.data.approvalTelegramBotToken || '', context, secrets) || secrets['TELEGRAM_BOT_TOKEN'] || '',
                    telegramChatId: interpolateVariables(node.data.approvalTelegramChatId || '', context, secrets) || secrets['TELEGRAM_CHAT_ID'] || '',
                    discordWebhookUrl: interpolateVariables(node.data.approvalDiscordWebhookUrl || '', context, secrets) || secrets['DISCORD_WEBHOOK_URL'] || '',
                    slackWebhookUrl: interpolateVariables(node.data.approvalSlackWebhookUrl || '', context, secrets) || secrets['SLACK_WEBHOOK'] || '',
                };

                return { output: { message: approvalMsg }, credits: 0, paused: true, resumeToken, approvalNotification };
            }

            case 'llm':
            case 'gemini': {
                credits = CREDIT_COSTS.llm_default;
                const prompt = interpolateVariables(node.data.content || '', context, secrets);
                const system = node.data.systemInstruction
                    ? interpolateVariables(node.data.systemInstruction, context, secrets)
                    : undefined;

                const llmResult = await callLlmDirectly({
                    provider: node.data.provider || 'gemini',
                    model: node.data.model || 'gemini-3.1-flash-lite-preview',
                    prompt,
                    system,
                    temperature: node.data.temperature || 0.7,
                    maxTokens: node.data.maxTokens || 1024,
                    secrets
                });

                output = llmResult.text;
                break;
            }

            case 'ai_vision': {
                credits = CREDIT_COSTS.ai_vision;
                const vPrompt = interpolateVariables(node.data.content || '', context, secrets);
                const vImageUrl = interpolateVariables(node.data.imageUrl || '', context, secrets);
                
                if (!vImageUrl) throw new Error("Image URL is required for Vision Analysis");

                const vLlmResult = await callLlmDirectly({
                    provider: 'gemini',
                    model: 'gemini-3.1-flash-lite-preview',
                    prompt: vPrompt,
                    imageUrl: vImageUrl,
                    secrets
                });

                output = vLlmResult.text;
                break;
            }

            case 'api_call': {
                credits = CREDIT_COSTS.api_call;
                const url = interpolateVariables(node.data.url || '', context, secrets);
                const method = node.data.method || 'GET';
                const headersStr = interpolateVariables(node.data.headers || '{}', context, secrets);
                const bodyStr = interpolateVariables(node.data.body || '{}', context, secrets);

                const apiResponse = await fetch(url, {
                    method,
                    headers: JSON.parse(headersStr),
                    body: method !== 'GET' ? bodyStr : undefined,
                });

                const contentType = apiResponse.headers.get('content-type') || '';
                output = contentType.includes('application/json')
                    ? await apiResponse.json()
                    : await apiResponse.text();
                break;
            }

            case 'javascript': {
                credits = CREDIT_COSTS.logic;
                const code = node.data.content || '';
                const sandboxUrl = process.env.CLOUD_RUN_CUSTOM_NODE_URL || secrets['CLOUD_RUN_CUSTOM_NODE_URL'];
                const sandboxSecret = process.env.BLUPE_CUSTOM_NODE_SECRET || secrets['BLUPE_CUSTOM_NODE_SECRET'];

                if (sandboxUrl) {
                    try {
                        const siteUrl = getSiteUrl();
                        const timeoutMs = node.data.executionTimeout || 5000;
                        const res = await fetch(sandboxUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-Blupe-Custom-Node-Secret': sandboxSecret || ''
                            },
                            body: JSON.stringify({
                                code,
                                timeoutMs,
                                capabilities: ['fetch', 'llm', 'json', 'crypto', 'log'],
                                context,
                                secrets: filterSecretsForSandbox(code, secrets, ['fetch', 'llm', 'json', 'crypto', 'log']),
                                config: {},
                                llmEndpoint: `${siteUrl}/api/llm`,
                                llmDefaults: {
                                    provider: 'gemini',
                                    model: 'gemini-3.1-flash-lite-preview'
                                }
                            })
                        });

                        if (!res.ok) {
                            throw new Error(`Sandbox Execution Failed: ${res.status} ${await res.text()}`);
                        }

                        const result = await res.json();
                        if (result.error) {
                            throw new Error(`Sandbox Runtime Error: ${result.error}`);
                        }

                        output = result.output;
                        consoleLogs = result.logs || [];
                    } catch (err) {
                        throw new Error(`JavaScript Node Execution failed inside sandbox: ${err.message}`);
                    }
                } else {
                    throw new Error('JavaScript Node execution requires a configured secure Sandbox runtime. Local execution is not allowed.');
                }
                break;
            }

            case 'math': {
                credits = CREDIT_COSTS.logic;
                const expr = interpolateVariables(node.data.mathExpression || node.data.content || '', context, secrets);
                try {
                    output = math.evaluate(expr);
                } catch (err) {
                    throw new Error(`Math Node Evaluation Failed: ${err.message}`);
                }
                break;
            }

            case 'batch': {
                credits = CREDIT_COSTS.logic;
                const listVarName = node.data.batchInputVariable || '';
                const listData = context[listVarName];
                const itemPrompt = node.data.batchPrompt || '';
                
                if (!Array.isArray(listData)) {
                    throw new Error(`Variable '${listVarName}' is not an array.`);
                }
                
                const results = await Promise.all(listData.map(async (item) => {
                    const itemContext = { ...context, item };
                    const p = interpolateVariables(itemPrompt, itemContext, secrets);
                    return await generateText(String(p), secrets);
                }));
                output = results;
                break;
            }

            case 'wait': {
                const waitTime = Number(node.data.waitTimeMs) || 1000;
                console.log(`[Execute] Delaying execution for ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                output = { waited: true, ms: waitTime };
                break;
            }

            case 'rss': {
                credits = CREDIT_COSTS.api_call;
                const rssUrl = interpolateVariables(node.data.url || '', context, secrets);
                if (!rssUrl) throw new Error("RSS Node requires a URL.");

                const res = await fetch(rssUrl);
                if (!res.ok) throw new Error(`HTTP Error ${res.status}: failed to fetch RSS feed.`);
                const xmlText = await res.text();
                
                const limit = node.data.rssItemLimit || 10;
                const items = parseRss(xmlText, limit);
                
                let feedTitle = 'RSS Feed';
                const titleMatch = xmlText.match(/<channel>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i) || 
                                   xmlText.match(/<feed[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/i);
                if (titleMatch) {
                    feedTitle = titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
                }

                output = {
                    feedTitle,
                    itemCount: items.length,
                    items
                };
                break;
            }

            case 'sheets': {
                credits = CREDIT_COSTS.api_call;
                const accessToken = secrets['GOOGLE_ACCESS_TOKEN'] || secrets['google_access_token'];
                if (!accessToken) {
                    throw new Error("Missing Access Token. Google Sheets needs 'GOOGLE_ACCESS_TOKEN' configured in Secrets.");
                }
                const sheetId = interpolateVariables(node.data.sheetId || '', context, secrets);
                const operation = node.data.sheetOperation || 'append';

                if (operation === 'read') {
                    const range = interpolateVariables(node.data.sheetRange || 'Sheet1!A1:Z100', context, secrets);
                    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    if (!res.ok) throw new Error(`Sheets API Error: ${await res.text()}`);
                    const data = await res.json();
                    output = data.values || [];
                } else {
                    const rawData = interpolateVariables(node.data.content || '', context, secrets);
                    let values = [[rawData]];
                    try {
                        const parsed = JSON.parse(String(rawData));
                        if (Array.isArray(parsed)) {
                            if (Array.isArray(parsed[0])) values = parsed;
                            else values = [parsed];
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            values = [Object.values(parsed)];
                        }
                    } catch (e) {}

                    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ values })
                    });
                    if (!res.ok) throw new Error(`Sheets API Error: ${await res.text()}`);
                }
                break;
            }


            case 'slack': {
                credits = 2;
                let accessToken = secrets['SLACK_ACCESS_TOKEN'];
                if (!accessToken && userId) {
                    try {
                        const { data: connData } = await supabase
                            .from('oauth_connections')
                            .select('access_token')
                            .eq('user_id', userId)
                            .eq('provider', 'slack')
                            .maybeSingle();
                        if (connData?.access_token) {
                            accessToken = connData.access_token;
                        }
                    } catch (e) {
                        console.warn('[Slack] OAuth lookup failed:', e.message);
                    }
                }

                if (accessToken) {
                    const channel = interpolateVariables(node.data.slackChannel || '', context, secrets);
                    const msg = interpolateVariables(node.data.content || '', context, secrets);
                    if (!channel) throw new Error('Slack Channel is required for OAuth mode.');

                    const siteUrl = getSiteUrl();
                    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
                    const response = await fetch(`${siteUrl}/api/slack-api`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${serviceKey}`
                        },
                        body: JSON.stringify({
                            endpoint: 'chat.postMessage',
                            token: accessToken,
                            body: { channel, text: msg }
                        })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok || data.ok === false) {
                        throw new Error(`Slack API Error: ${data.error || response.statusText || 'request failed'}`);
                    }
                    output = data;
                } else {
                    // Legacy webhook mode
                    const hook = interpolateVariables(node.data.url || secrets['SLACK_WEBHOOK'] || '', context, secrets);
                    if (!hook || String(hook).includes('{{')) {
                        throw new Error('Missing Slack Configuration. Connect Slack in Settings or add SLACK_WEBHOOK.');
                    }

                    let payload = {};
                    if (node.data.slackBody && String(node.data.slackBody).trim().length > 0) {
                        try {
                            payload = JSON.parse(node.data.slackBody);
                            if (node.data.slackMappings) {
                                for (const [pathKey, variableTemplate] of Object.entries(node.data.slackMappings)) {
                                    if (variableTemplate && typeof variableTemplate === 'string') {
                                        const resolvedValue = interpolateVariables(variableTemplate, context, secrets);
                                        setObjectPath(payload, pathKey, resolvedValue);
                                    }
                                }
                            } else {
                                // Still interpolate string fields inside the payload
                                payload = processSmartJSON(JSON.stringify(payload), context, secrets);
                            }
                        } catch (e) {
                            payload = processSmartJSON(node.data.slackBody, context, secrets);
                        }
                    } else {
                        const channel = interpolateVariables(node.data.slackChannel || '', context, secrets);
                        const msg = interpolateVariables(node.data.content || '', context, secrets);
                        payload = { text: String(msg), channel: channel || undefined };
                    }

                    const response = await fetch(String(hook), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) {
                        const text = await response.text();
                        throw new Error(`Slack API Failed: ${response.status} ${text}`);
                    }
                    output = 'Message sent to Slack successfully.';
                }
                break;
            }

            case 'email': {
                credits = CREDIT_COSTS.email || 5;
                const emailProvider = node.data.emailProvider || 'smtp';
                
                if (emailProvider === 'microsoft') {
                    let accessToken = secrets['MICROSOFT_ACCESS_TOKEN'] || secrets['microsoft_access_token'];
                    if (!accessToken && userId) {
                        const { data: connData, error: connErr } = await supabase
                            .from('oauth_connections')
                            .select('access_token')
                            .eq('user_id', userId)
                            .eq('provider', 'microsoft')
                            .maybeSingle();
                        if (!connErr && connData) {
                            accessToken = connData.access_token;
                        }
                    }
                    if (!accessToken) {
                        throw new Error("Microsoft Outlook Access Token is required. Please connect your Microsoft account in Settings.");
                    }
                    
                    const to = interpolateVariables(node.data.emailTo || '', context, secrets);
                    const subject = interpolateVariables(node.data.emailSubject || '', context, secrets);
                    const bodyContent = interpolateVariables(node.data.content || '', context, secrets);
                    
                    const apiRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: {
                                subject: subject,
                                body: {
                                    contentType: 'HTML',
                                    content: bodyContent
                                },
                                toRecipients: [
                                    {
                                        emailAddress: {
                                            address: to
                                        }
                                    }
                                ]
                            }
                        })
                    });
                    
                    if (!apiRes.ok) {
                        const errText = await apiRes.text();
                        throw new Error(`Microsoft Graph API Error: ${errText}`);
                    }
                    output = { success: true };
                } else {
                    const to = interpolateVariables(node.data.emailTo || '', context, secrets);
                    const subject = interpolateVariables(node.data.emailSubject || '', context, secrets);
                    const bodyContent = interpolateVariables(node.data.content || '', context, secrets);

                    // Resend's SMTP username is the literal string "resend", so the
                    // email API's `from || smtp.user` fallback would produce an
                    // invalid sender (550). Always send an explicit from address.
                    const looksLikeEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.replace(/^.*<([^>]+)>.*$/, '$1'));
                    const fromCandidate = interpolateVariables(node.data.emailFrom || '', context, secrets)
                        || secrets['SMTP_FROM']
                        || secrets['EMAIL_FROM']
                        || (looksLikeEmail(secrets['SMTP_USER']) ? secrets['SMTP_USER'] : '');
                    const from = looksLikeEmail(fromCandidate) ? fromCandidate : 'no-reply@blupe.space';

                    const siteUrl = getSiteUrl();
                    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
                    const res = await fetch(`${siteUrl}/api/email`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${serviceKey}`,
                            'x-flow-owner-id': userId
                        },
                        body: JSON.stringify({
                            to,
                            subject,
                            html: bodyContent,
                            from,
                            smtp: {
                                host: secrets['SMTP_HOST'],
                                port: secrets['SMTP_PORT'],
                                user: secrets['SMTP_USER'],
                                pass: secrets['SMTP_PASS']
                            }
                        })
                    });
                    
                    const resData = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        throw new Error(resData.error || `SMTP Email request failed: ${res.status}`);
                    }
                    output = resData;
                }
                break;
            }

            case 'hubspot': {
                credits = CREDIT_COSTS.api_call;
                const accessToken = secrets['HUBSPOT_ACCESS_TOKEN'] || secrets['hubspot_access_token'];

                if (!accessToken) {
                    throw new Error("Missing HubSpot Access Token. Configure HUBSPOT_ACCESS_TOKEN in Secrets.");
                }

                const operation = node.data.hubspotOperation || 'create_contact';
                const email = interpolateVariables(node.data.hubspotEmail || '', context, secrets);
                const contactId = interpolateVariables(node.data.hubspotContactId || '', context, secrets);
                const dealId = interpolateVariables(node.data.hubspotDealId || '', context, secrets);
                const propertiesStr = node.data.hubspotProperties || '{}';
                const properties = processSmartJSON(propertiesStr, context, secrets);

                const hubspotHeaders = {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                };

                switch (operation) {
                    case 'create_contact': {
                        const body = {
                            properties: {
                                email,
                                ...properties
                            }
                        };
                        const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
                            method: 'POST',
                            headers: hubspotHeaders,
                            body: JSON.stringify(body)
                        });
                        if (!res.ok) throw new Error(`HubSpot Create Contact Failed: ${await res.text()}`);
                        output = await res.json();
                        break;
                    }
                    case 'update_contact': {
                        if (!contactId && !email) throw new Error("Contact ID or Email required for update");
                        const updateId = contactId || email;
                        const idType = contactId ? '' : '?idProperty=email';
                        const res = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${updateId}${idType}`, {
                            method: 'PATCH',
                            headers: hubspotHeaders,
                            body: JSON.stringify({ properties })
                        });
                        if (!res.ok) throw new Error(`HubSpot Update Contact Failed: ${await res.text()}`);
                        output = await res.json();
                        break;
                    }
                    case 'get_contact': {
                        if (!contactId) throw new Error("Contact ID required");
                        const res = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
                            method: 'GET',
                            headers: hubspotHeaders
                        });
                        if (!res.ok) throw new Error(`HubSpot Get Contact Failed: ${await res.text()}`);
                        output = await res.json();
                        break;
                    }
                    case 'search_contacts': {
                        const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
                            method: 'POST',
                            headers: hubspotHeaders,
                            body: JSON.stringify(properties)
                        });
                        if (!res.ok) throw new Error(`HubSpot Search Contacts Failed: ${await res.text()}`);
                        output = await res.json();
                        break;
                    }
                    case 'create_deal': {
                        const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
                            method: 'POST',
                            headers: hubspotHeaders,
                            body: JSON.stringify({ properties })
                        });
                        if (!res.ok) throw new Error(`HubSpot Create Deal Failed: ${await res.text()}`);
                        output = await res.json();
                        break;
                    }
                    case 'get_deal': {
                        if (!dealId) throw new Error("Deal ID required");
                        const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
                            method: 'GET',
                            headers: hubspotHeaders
                        });
                        if (!res.ok) throw new Error(`HubSpot Get Deal Failed: ${await res.text()}`);
                        output = await res.json();
                        break;
                    }
                    default:
                        throw new Error(`Unknown HubSpot operation: ${operation}`);
                }
                break;
            }

            case 'stripe': {
                credits = CREDIT_COSTS.api_call;
                const stripeQs = (obj, prefix) => {
                    const str = [];
                    for (const p in obj) {
                        if (Object.prototype.hasOwnProperty.call(obj, p)) {
                            const k = prefix ? `${prefix}[${p}]` : p;
                            const v = obj[p];
                            str.push((v !== null && typeof v === "object") ?
                                stripeQs(v, k) :
                                encodeURIComponent(k) + "=" + encodeURIComponent(v));
                        }
                    }
                    return str.filter(x => x).join("&");
                };

                let apiKey = secrets['STRIPE_SECRET_KEY'] || node.data.apiKey;
                apiKey = interpolateVariables(apiKey || '', context, secrets);

                if (!apiKey) {
                    throw new Error("Stripe Secret Key is required. Please set STRIPE_SECRET_KEY in Secrets.");
                }

                const operation = node.data.operation || 'Create Charge';
                let endpoint = '';
                let method = 'POST';
                let payload = {};

                switch (operation) {
                    case 'Create Charge': {
                        endpoint = 'charges';
                        payload = {
                            amount: Number(interpolateVariables(String(node.data.amount || 0), context, secrets)),
                            currency: interpolateVariables(node.data.currency || 'usd', context, secrets),
                            description: interpolateVariables(node.data.description || '', context, secrets),
                        };
                        const custId = interpolateVariables(node.data.customerId || '', context, secrets);
                        if (custId) payload.customer = custId;
                        break;
                    }
                    case 'Create Customer': {
                        endpoint = 'customers';
                        payload = {
                            email: interpolateVariables(node.data.email || '', context, secrets),
                        };
                        break;
                    }
                    case 'Create Subscription': {
                        endpoint = 'subscriptions';
                        payload = {
                            customer: interpolateVariables(node.data.customerId || '', context, secrets),
                            items: [{
                                price: interpolateVariables(node.data.priceId || '', context, secrets)
                            }]
                        };
                        break;
                    }
                    case 'Get Customer': {
                        const custId = interpolateVariables(node.data.customerId || '', context, secrets);
                        if (!custId) throw new Error("Customer ID is required to fetch a customer");
                        endpoint = `customers/${custId}`;
                        method = 'GET';
                        break;
                    }
                    case 'List Invoices': {
                        endpoint = 'invoices';
                        method = 'GET';
                        const limit = Number(interpolateVariables(String(node.data.limit || 10), context, secrets));
                        payload = { limit };
                        break;
                    }
                    case 'Create Payment Intent': {
                        endpoint = 'payment_intents';
                        payload = {
                            amount: Number(interpolateVariables(String(node.data.amount || 0), context, secrets)),
                            currency: interpolateVariables(node.data.currency || 'usd', context, secrets),
                            description: interpolateVariables(node.data.description || '', context, secrets),
                        };
                        const custId = interpolateVariables(node.data.customerId || '', context, secrets);
                        if (custId) payload.customer = custId;
                        break;
                    }
                    case 'Refund Payment': {
                        endpoint = 'refunds';
                        payload = {
                            charge: interpolateVariables(node.data.customerId || '', context, secrets),
                            amount: Number(interpolateVariables(String(node.data.amount || 0), context, secrets)),
                        };
                        break;
                    }
                    case 'Cancel Subscription': {
                        const subId = interpolateVariables(node.data.subscriptionId || '', context, secrets);
                        if (!subId) throw new Error("Subscription ID is required to cancel a subscription");
                        endpoint = `subscriptions/${subId}`;
                        method = 'DELETE';
                        break;
                    }
                    default:
                        throw new Error(`Unsupported Stripe operation: ${operation}`);
                }

                // Parse and merge metadata JSON if present
                if (node.data.metadata && ['Create Charge', 'Create Payment Intent', 'Create Customer', 'Create Subscription'].includes(operation)) {
                    const metadataStr = interpolateVariables(node.data.metadata, context, secrets);
                    try {
                        payload.metadata = JSON.parse(metadataStr);
                    } catch (e) {
                        throw new Error("Invalid JSON in Stripe Metadata");
                    }
                }

                const stripeUrl = `https://api.stripe.com/v1/${endpoint}`;
                const headers = {
                    'Authorization': `Bearer ${apiKey}`
                };

                let body = undefined;
                if (method !== 'GET') {
                    headers['Content-Type'] = 'application/x-www-form-urlencoded';
                    body = stripeQs(payload);
                }

                const response = await fetch(stripeUrl, { method, headers, body });
                const resData = await response.json();

                if (!response.ok) {
                    throw new Error(`Stripe request failed: ${resData.error?.message || JSON.stringify(resData.error || resData)}`);
                }

                output = resData;
                break;
            }

            case 'whatsapp_send': {
                credits = CREDIT_COSTS.whatsapp_send;
                const wabaId = interpolateVariables(node.data.whatsappWabaId || '', context, secrets) || secrets['WHATSAPP_WABA_ID'] || '';
                const phoneNumberId = interpolateVariables(node.data.whatsappPhoneNumberId || '', context, secrets) || secrets['WHATSAPP_PHONE_NUMBER_ID'] || '';
                const recipientPhone = interpolateVariables(node.data.whatsappPhone || '', context, secrets);
                const messageType = node.data.whatsappMessageType || 'text';

                let accessToken = secrets['WHATSAPP_ACCESS_TOKEN'];
                if (!accessToken && userId) {
                    const { data: connData, error: connErr } = await supabase
                        .from('oauth_connections')
                        .select('access_token')
                        .eq('user_id', userId)
                        .eq('provider', 'whatsapp')
                        .maybeSingle();
                    if (!connErr && connData) {
                        accessToken = connData.access_token;
                    }
                }

                if (!accessToken) {
                    throw new Error("WhatsApp access token is required.");
                }

                if (!phoneNumberId) {
                    throw new Error("WhatsApp Phone Number ID is required.");
                }

                let bodyData = {
                    messaging_product: 'whatsapp',
                    to: recipientPhone,
                    type: messageType === 'media' ? 'document' : messageType,
                };

                if (messageType === 'text') {
                    bodyData.text = {
                        body: interpolateVariables(node.data.whatsappBodyText || '', context, secrets)
                    };
                } else if (messageType === 'template') {
                    let templateParams = [];
                    try {
                        const paramsStr = interpolateVariables(node.data.whatsappTemplateParams || '[]', context, secrets);
                        templateParams = JSON.parse(paramsStr);
                    } catch (e) {
                        throw new Error("Invalid JSON in WhatsApp Template Parameters");
                    }

                    bodyData.template = {
                        name: interpolateVariables(node.data.whatsappTemplateName || '', context, secrets),
                        language: {
                            code: interpolateVariables(node.data.whatsappTemplateLanguage || 'en_US', context, secrets)
                        },
                        components: [
                            {
                                type: 'body',
                                parameters: templateParams.map(param => ({
                                    type: 'text',
                                    text: String(param)
                                }))
                            }
                        ]
                    };
                } else if (messageType === 'media') {
                    bodyData.document = {
                        link: interpolateVariables(node.data.whatsappMediaUrl || '', context, secrets),
                        filename: 'document'
                    };
                }

                const waResponse = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bodyData)
                });

                const waResData = await waResponse.json();
                if (!waResponse.ok) {
                    throw new Error(`WhatsApp Send failed: ${waResData.error?.message || JSON.stringify(waResData.error || waResData)}`);
                }
                output = waResData;
                break;
            }

            case 'razorpay_action': {
                credits = CREDIT_COSTS.razorpay_action;
                const operation = node.data.razorpayOperation || 'Create Payment Link';
                const amount = Number(interpolateVariables(String(node.data.razorpayAmount || ''), context, secrets) || 0);
                const currency = interpolateVariables(node.data.razorpayCurrency || 'INR', context, secrets);
                const description = interpolateVariables(node.data.razorpayDescription || '', context, secrets);
                const paymentId = interpolateVariables(node.data.razorpayPaymentId || '', context, secrets);

                const keyId = secrets['RAZORPAY_KEY_ID'];
                const keySecret = secrets['RAZORPAY_KEY_SECRET'];

                if (!keyId || !keySecret) {
                    throw new Error("Razorpay credentials are required.");
                }

                const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
                let rpUrl = '';
                let rpMethod = 'POST';
                let rpPayload = null;

                if (operation === 'Create Payment Link') {
                    rpUrl = 'https://api.razorpay.com/v1/payment_links';
                    rpPayload = {
                        amount,
                        currency,
                        description,
                        accept_partial: false,
                        first_payment_min_amount: amount,
                        reference_id: crypto.randomUUID().substring(0, 16)
                    };
                } else if (operation === 'Issue Refund') {
                    if (!paymentId) throw new Error("Payment ID is required for refunds");
                    rpUrl = `https://api.razorpay.com/v1/payments/${paymentId}/refund`;
                    if (amount > 0) {
                        rpPayload = { amount };
                    } else {
                        rpPayload = {};
                    }
                } else if (operation === 'Fetch Payment') {
                    if (!paymentId) throw new Error("Payment ID is required to fetch payment details");
                    rpUrl = `https://api.razorpay.com/v1/payments/${paymentId}`;
                    rpMethod = 'GET';
                }

                const rpResponse = await fetch(rpUrl, {
                    method: rpMethod,
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json'
                    },
                    body: rpMethod !== 'GET' ? JSON.stringify(rpPayload) : undefined
                });

                const rpResData = await rpResponse.json();
                if (!rpResponse.ok) {
                    throw new Error(`Razorpay Action failed: ${rpResData.error?.description || JSON.stringify(rpResData)}`);
                }
                output = rpResData;
                break;
            }

            case 'telegram_send': {
                credits = CREDIT_COSTS.telegram_send;
                const botToken = interpolateVariables(node.data.telegramBotToken || '', context, secrets) || secrets['TELEGRAM_BOT_TOKEN'] || '';
                const chatId = interpolateVariables(node.data.telegramChatId || '', context, secrets) || secrets['TELEGRAM_CHAT_ID'] || '';
                const messageText = interpolateVariables(node.data.telegramMessage || '', context, secrets);

                if (!botToken || !chatId) {
                    throw new Error("Telegram Bot Token and Chat ID are required.");
                }

                const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: messageText })
                });

                const tgResData = await tgResponse.json();
                if (!tgResponse.ok || !tgResData.ok) {
                    throw new Error(`Telegram Send failed: ${tgResData.description || JSON.stringify(tgResData)}`);
                }
                output = tgResData;
                break;
            }

            case 'discord_send': {
                credits = CREDIT_COSTS.discord_send;
                const sendMode = node.data.discordSendMode || 'webhook';
                const messageContent = String(interpolateVariables(node.data.discordMessage || '', context, secrets)).slice(0, 2000);

                if (!messageContent) {
                    throw new Error("Discord message content is required.");
                }

                if (sendMode === 'webhook') {
                    const hookUrl = interpolateVariables(node.data.discordWebhookUrl || '', context, secrets) || secrets['DISCORD_WEBHOOK_URL'] || '';
                    if (!hookUrl) {
                        throw new Error("Discord Webhook URL is required.");
                    }
                    const username = interpolateVariables(node.data.discordUsername || '', context, secrets);
                    const dcResponse = await fetch(`${hookUrl}?wait=true`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: messageContent,
                            ...(username ? { username } : {}),
                        }),
                    });
                    const dcText = await dcResponse.text();
                    let dcData;
                    try { dcData = JSON.parse(dcText); } catch { dcData = { raw: dcText }; }
                    if (!dcResponse.ok) {
                        throw new Error(`Discord Send failed: ${dcData.message || dcText || dcResponse.status}`);
                    }
                    output = dcData;
                } else {
                    const botToken = interpolateVariables(node.data.discordBotToken || '', context, secrets) || secrets['DISCORD_BOT_TOKEN'] || '';
                    const channelId = interpolateVariables(node.data.discordChannelId || '', context, secrets) || secrets['DISCORD_CHANNEL_ID'] || '';
                    if (!botToken || !channelId) {
                        throw new Error("Discord Bot Token and Channel ID are required.");
                    }
                    const dcResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bot ${botToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ content: messageContent }),
                    });
                    const dcData = await dcResponse.json();
                    if (!dcResponse.ok) {
                        throw new Error(`Discord Send failed: ${dcData.message || JSON.stringify(dcData)}`);
                    }
                    output = dcData;
                }
                break;
            }

            case 'zapier_webhook': {
                credits = CREDIT_COSTS.api_call;
                const webhookUrl = interpolateVariables(node.data.webhookUrl || '', context, secrets);
                if (!webhookUrl) throw new Error("Zapier Webhook URL is required.");

                const operation = node.data.operation || 'Trigger Zap (POST)';
                let method = 'POST';
                if (operation === 'Retrieve Data (GET)') method = 'GET';
                else if (operation === 'Trigger Zap (PUT)') method = 'PUT';

                let customHeaders = {};
                try {
                    customHeaders = JSON.parse(interpolateVariables(node.data.customHeaders || '{}', context, secrets));
                } catch (e) {
                    throw new Error("Invalid JSON in Custom Headers");
                }

                let queryParams = {};
                try {
                    queryParams = JSON.parse(interpolateVariables(node.data.queryParams || '{}', context, secrets));
                } catch (e) {
                    throw new Error("Invalid JSON in Query Parameters");
                }

                const urlObj = new URL(webhookUrl);
                Object.entries(queryParams).forEach(([k, v]) => {
                    urlObj.searchParams.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
                });

                const payloadType = node.data.payloadType || 'application/json';
                const dataStr = interpolateVariables(node.data.data || '{}', context, secrets);
                let bodyData = {};
                try {
                    bodyData = JSON.parse(dataStr);
                } catch (e) {
                    bodyData = dataStr;
                }

                const flattenObject = (obj, prefix = '') => {
                    if (!obj || typeof obj !== 'object') return obj;
                    return Object.keys(obj).reduce((acc, k) => {
                        const pre = prefix.length ? prefix + '.' : '';
                        if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
                            Object.assign(acc, flattenObject(obj[k], pre + k));
                        } else {
                            acc[pre + k] = obj[k];
                        }
                        return acc;
                    }, {});
                };

                if (node.data.flattenData && typeof bodyData === 'object' && bodyData !== null) {
                    bodyData = flattenObject(bodyData);
                }

                const headers = { ...customHeaders };
                let body = undefined;

                if (method !== 'GET') {
                    if (payloadType === 'application/json') {
                        headers['Content-Type'] = 'application/json';
                        body = JSON.stringify(bodyData);
                    } else if (payloadType === 'application/x-www-form-urlencoded') {
                        headers['Content-Type'] = 'application/x-www-form-urlencoded';
                        const searchParams = new URLSearchParams();
                        if (typeof bodyData === 'object') {
                            Object.entries(bodyData).forEach(([k, v]) => {
                                searchParams.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
                            });
                        } else {
                            searchParams.append('payload', String(bodyData));
                        }
                        body = searchParams.toString();
                    } else if (payloadType === 'text/plain') {
                        headers['Content-Type'] = 'text/plain';
                        body = typeof bodyData === 'object' ? JSON.stringify(bodyData) : String(bodyData);
                    } else {
                        const formData = new FormData();
                        if (typeof bodyData === 'object') {
                            Object.entries(bodyData).forEach(([k, v]) => {
                                formData.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
                            });
                        } else {
                            formData.append('payload', String(bodyData));
                        }
                        body = formData;
                    }
                }

                const response = await fetch(urlObj.toString(), { method, headers, body });
                const text = await response.text();
                let json;
                try { json = JSON.parse(text); } catch (e) { json = text; }

                if (!response.ok) {
                    throw new Error(`Zapier request failed: ${response.status} ${response.statusText}`);
                }

                output = json;
                break;
            }

            case 'reasoning': {
                credits = CREDIT_COSTS.reasoning_platform;
                const goal = interpolateVariables(node.data.reasoningGoal || node.data.content || '', context, secrets);
                const additionalContext = interpolateVariables(node.data.reasoningContext || '', context, secrets);
                const thinkingStyle = node.data.thinkingStyle || 'chain-of-thought';

                if (!goal) throw new Error("Reasoning node requires a goal.");

                const provider = node.data.provider || 'gemini';
                const model = node.data.model || 'gemini-3.1-flash-lite-preview';

                let apiKey = secrets['API_KEY'];
                if (provider === 'openai') apiKey = secrets['OPENAI_API_KEY'] || apiKey;
                if (provider === 'anthropic') apiKey = secrets['ANTHROPIC_API_KEY'] || apiKey;
                if (provider === 'groq') apiKey = secrets['GROQ_API_KEY'] || apiKey;
                if (provider === 'gemini') apiKey = secrets['GEMINI_API_KEY'] || apiKey;

                const systemPrompt = `You are an advanced reasoning agent. Your task is to solve problems using ${thinkingStyle} reasoning.

THINKING PROCESS:
1. **ANALYZE**: Understand the goal and break it down
2. **PLAN**: Create a step-by-step approach  
3. **EXECUTE**: Work through each step logically
4. **REFLECT**: Verify your reasoning and conclusion

FORMAT YOUR RESPONSE AS:
<thinking>
[Your detailed step-by-step thought process here]
</thinking>

<answer>
[Your final, clear answer/conclusion]
</answer>`;

                const userPrompt = `GOAL: ${goal}

${additionalContext ? `CONTEXT:\n${additionalContext}\n\n` : ''}${Object.keys(context).length > 0 ? `AVAILABLE DATA:\n${JSON.stringify(context).substring(0, 2000)}` : ''}

Please reason through this step by step and provide your answer.`;

                const llmResult = await callLlmDirectly({
                    provider,
                    model,
                    prompt: userPrompt,
                    system: systemPrompt,
                    temperature: 0.5,
                    maxTokens: 4096,
                    apiKey,
                    secrets
                });

                const rawResponse = llmResult.text;

                const thinkingMatch = rawResponse.match(/<thinking>([\s\S]*?)<\/thinking>/);
                const answerMatch = rawResponse.match(/<answer>([\s\S]*?)<\/answer>/);

                output = {
                    thinking: thinkingMatch ? thinkingMatch[1].trim() : '',
                    answer: answerMatch ? answerMatch[1].trim() : rawResponse.trim(),
                    fullResponse: rawResponse,
                    thinkingStyle,
                    goal
                };
                break;
            }

            case 'agent': {
                const agentGoal = interpolateVariables(node.data.agentGoal || node.data.content || '', context, secrets);
                if (!agentGoal) throw new Error("Agent node requires a goal.");

                // Full tool registry (must match legacy client-side agentExecutor defaults)
                const allTools = [
                    'deep_research', 'web_search', 'extract_url', 'crawl_site',
                    'llm_call', 'synthesize_report', 'declare_artifact',
                    'send_email', 'send_slack', 'api_call', 'javascript',
                    'calculate', 'store_memory', 'read_context', 'append_to_sheet'
                ];

                const enabledTools = (Array.isArray(node.data.agentTools) && node.data.agentTools.length > 0)
                    ? [...node.data.agentTools]
                    : [...allTools];
                // Ensure synthesize_report is always available for report/email delivery pipelines
                if (!enabledTools.includes('synthesize_report')) {
                    enabledTools.push('synthesize_report');
                }
                if (!enabledTools.includes('declare_artifact')) {
                    enabledTools.push('declare_artifact');
                }

                const maxIterations = node.data.agentMaxIterations || 30;
                // Default 10 minutes — multi-tool ReAct loops routinely exceed 2 minutes
                const timeoutMs = node.data.agentTimeoutMs || 600000;
                const thinkingModel = node.data.agentThinkingModel || 'gemini-3.1-flash-lite-preview';
                const thinkingProvider = thinkingModel.includes('claude') ? 'anthropic' : 'gemini';
                const thinkingModelId = thinkingModel.includes('claude') ? 'claude-sonnet-4-5' : 'gemini-3.1-flash-lite-preview';

                console.log(`[AgentExecutor] Starting agent with goal: "${agentGoal}"`);
                console.log(`[AgentExecutor] Available tools: ${enabledTools.join(', ')}`);

                const state = {
                    goal: agentGoal,
                    iteration: 0,
                    thoughts: [],
                    memory: {
                        ...context,
                        _workflow: {
                            startTime: Date.now(),
                            availableTools: enabledTools,
                            previousNodeOutputs: Object.keys(context).filter(k => !k.startsWith('_'))
                        },
                        _artifacts: {},
                        artifactStore: context.artifactStore || {},
                        _mcpServers: node.data?.agentMcpServers || [],
                        _primaryArtifact: null
                    },
                    finalAnswer: null,
                    status: 'running',
                    plan: [],
                    currentStep: 1,
                    toolAttempts: [],
                    consecutiveErrors: 0
                };

                let totalCredits = 15; // 15 base orchestration fee
                const startTime = Date.now();
                const siteUrl = getSiteUrl();
                const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
                    || process.env.SUPABASE_SERVICE_KEY
                    || secrets['SUPABASE_SERVICE_ROLE_KEY']
                    || secrets['SUPABASE_SERVICE_KEY']
                    || '';

                const buildToolDefs = () => {
                    const toolDefs = enabledTools.map(t => ({
                        name: t,
                        description: getToolDescription(t),
                        whenToUse: getToolWhenToUse(t),
                        whenNotToUse: getToolWhenNotToUse(t),
                        creditCost: 5,
                        inputSchema: getToolInputSchema(t)
                    }));
                    const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
                    for (const srv of state.memory._mcpServers || []) {
                        for (const t of srv.tools || []) {
                            const mcpName = `mcp_${clean(srv.label || 'server')}_${clean(t.name)}`.substring(0, 60);
                            toolDefs.push({
                                name: mcpName,
                                description: `[MCP Tool from ${srv.label}] ${t.description || ''}`,
                                whenToUse: `Need to use special MCP tool ${t.name} from server ${srv.label}`,
                                whenNotToUse: `Standard tools are sufficient`,
                                creditCost: 5,
                                inputSchema: t.inputSchema || {}
                            });
                        }
                    }
                    return toolDefs;
                };

                const buildAgentStateSnapshot = (iter) => ({
                    goal: state.goal,
                    iteration: iter,
                    thoughts: state.thoughts,
                    memory: {
                        ...Object.fromEntries(
                            Object.entries(state.memory).filter(([k, v]) =>
                                !k.startsWith('_') && k !== 'artifactStore' && typeof v !== 'function'
                            )
                        )
                    },
                    finalAnswer: state.finalAnswer,
                    status: state.status,
                    plan: state.plan,
                    currentStep: state.currentStep
                });

                const writeAgentLog = async (iter, thought, action = null, observation = null) => {
                    const payload = {
                        agentState: buildAgentStateSnapshot(iter),
                        thought: thought || '',
                        action,
                        observation,
                        answer: state.finalAnswer
                    };
                    try {
                        await supabase.from('execution_logs').insert({
                            run_id: runId,
                            flow_id: flowId,
                            node_id: node.id,
                            node_type: 'agent',
                            status: 'running',
                            input: { iteration: iter },
                            output: payload,
                            duration_ms: Date.now() - startTime,
                            credits_used: 0,
                            user_id: userId || null
                        });
                    } catch (e) {
                        console.error(`[AgentExecutor] Failed to write intermediate log:`, e.message);
                    }
                };

                // ---- Stage 0: PLAN (native agent-functions + local LLM fallback) ----
                console.log('[AgentExecutor] Stage 0: Generating plan...');
                let planResult = null;
                const toolDefs = buildToolDefs();
                try {
                    const planRes = await fetch(`${siteUrl}/api/agent-functions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${serviceKey}`
                        },
                        body: JSON.stringify({
                            mode: 'plan',
                            goal: agentGoal,
                            tools: toolDefs,
                            provider: thinkingProvider,
                            model: thinkingModelId
                        })
                    });

                    if (planRes.ok) {
                        const data = await planRes.json();
                        if (data.plan && Array.isArray(data.plan) && data.plan.length > 0) {
                            planResult = data.plan;
                        }
                        totalCredits += (data.credits || 4);
                    } else {
                        const errText = await planRes.text().catch(() => '');
                        console.error('[AgentExecutor] Plan call failed:', planRes.status, errText.substring(0, 300));
                        totalCredits += 4;
                    }
                } catch (err) {
                    console.error('[AgentExecutor] Planner network error:', err.message);
                    totalCredits += 4;
                }

                // Local LLM fallback planner (critical when Netlify agent-functions is unreachable)
                if (!planResult) {
                    try {
                        console.log('[AgentExecutor] Using local LLM plan fallback...');
                        const toolList = toolDefs.map(t => `- ${t.name}: ${t.description}`).join('\n');
                        const planPrompt = `GOAL: ${agentGoal}\n\nAVAILABLE TOOLS:\n${toolList}\n\nCreate a JSON array of atomic steps. Each step uses exactly ONE tool. Order: Research → synthesize_report → declare_artifact → delivery (email/slack if needed). Respond with ONLY a JSON array of strings.`;
                        const llmPlan = await callLlmDirectly({
                            provider: thinkingProvider === 'anthropic' ? 'anthropic' : 'gemini',
                            model: thinkingModelId,
                            prompt: planPrompt,
                            system: 'You are a planning assistant for an autonomous agent. Return ONLY a valid JSON array of step strings.',
                            temperature: 0.2,
                            maxTokens: 512,
                            secrets
                        });
                        const match = (llmPlan.text || '').match(/\[[\s\S]*\]/);
                        if (match) {
                            const parsed = JSON.parse(match[0]);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                planResult = parsed.map(s => String(s).replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
                            }
                        }
                        totalCredits += 4;
                    } catch (e) {
                        console.error('[AgentExecutor] Local plan fallback failed:', e.message);
                    }
                }

                if (!planResult || planResult.length === 0) {
                    planResult = [agentGoal];
                }
                state.plan = planResult;
                console.log('[AgentExecutor] Plan generated:', state.plan);
                await writeAgentLog(0, 'Execution plan generated.', null, `Plan: ${JSON.stringify(state.plan)}`);

                // ---- Main ReAct loop ----
                while (state.status === 'running') {
                    if (Date.now() - startTime > timeoutMs) {
                        state.status = 'failed';
                        state.finalAnswer = state.finalAnswer
                            || truncateObservation(state.thoughts[state.thoughts.length - 1]?.observation || '', 4000)
                            || 'Agent execution timed out. Partial results may be available in observations.';
                        break;
                    }

                    if (state.iteration >= maxIterations) {
                        state.status = 'max_iterations';
                        // Prefer last successful tool observation over a trailing [BLOCKED]/[SKIPPED] message
                        const successObs = [...state.thoughts].reverse().find(t =>
                            t.observation
                            && !String(t.observation).startsWith('[BLOCKED]')
                            && !String(t.observation).startsWith('[SKIPPED]')
                            && !String(t.observation).startsWith('[ERROR]')
                            && t.action !== 'error_no_tool_selected'
                            && t.action !== 'FINISH'
                        );
                        const lastThought = state.thoughts[state.thoughts.length - 1];
                        state.finalAnswer = state.finalAnswer
                            || (successObs ? truncateObservation(successObs.observation, 4000) : null)
                            || (state.memory.lastObservation ? truncateObservation(state.memory.lastObservation, 4000) : null)
                            || truncateObservation(lastThought?.observation || '', 4000)
                            || `Reached maximum iterations (${maxIterations}). Last observation may contain useful data.`;
                        // If we actually produced useful work, treat as soft-success for downstream nodes
                        if (state.toolAttempts.some(a => a.success) && state.finalAnswer && !String(state.finalAnswer).startsWith('[')) {
                            state.status = 'completed';
                        }
                        break;
                    }

                    // All plan steps completed → force FINISH with best available answer
                    if (state.currentStep > state.plan.length) {
                        const lastThought = state.thoughts[state.thoughts.length - 1];
                        state.finalAnswer = state.finalAnswer
                            || truncateObservation(lastThought?.observation || '', 4000)
                            || 'Goal completed.';
                        state.status = 'completed';
                        break;
                    }

                    state.iteration++;
                    console.log(`[AgentExecutor] Iteration ${state.iteration} (Step ${state.currentStep}/${state.plan.length})`);

                    // ---- Stage 1: DECIDE ----
                    let decision = null;
                    const currentToolDefs = buildToolDefs();
                    const observations = state.thoughts
                        .filter(t => t.observation)
                        .map(t => ({
                            iteration: t.iteration,
                            action: t.action,
                            observation: truncateObservation(t.observation || '', 300)
                        }));
                    const failedAttempts = state.toolAttempts.filter(a => !a.success);
                    const contextForDecider = {
                        ...Object.fromEntries(
                            Object.entries(state.memory).filter(([k, v]) =>
                                !k.startsWith('_') && k !== 'artifactStore' && typeof v !== 'function'
                            )
                        )
                    };

                    try {
                        const decRes = await fetch(`${siteUrl}/api/agent-functions`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${serviceKey}`
                            },
                            body: JSON.stringify({
                                mode: 'decide',
                                goal: state.goal,
                                plan: state.plan,
                                currentStep: state.currentStep,
                                observations,
                                failedAttempts,
                                context: contextForDecider,
                                tools: currentToolDefs,
                                provider: thinkingProvider,
                                model: thinkingModelId
                            })
                        });

                        if (decRes.ok) {
                            const data = await decRes.json();
                            decision = {
                                tool: data.tool,
                                input: data.input || {},
                                reasoning: data.reasoning || `Selected ${data.tool}`,
                                isFinal: data.isFinal || data.tool === 'FINISH',
                                finalAnswer: data.finalAnswer || data.input?.final_answer || null
                            };
                            totalCredits += (data.credits || 6);
                        } else {
                            const errText = await decRes.text().catch(() => '');
                            console.error('[AgentExecutor] Decider failed:', decRes.status, errText.substring(0, 300));
                            totalCredits += 6;
                        }
                    } catch (err) {
                        console.error('[AgentExecutor] Decider network error:', err.message);
                        totalCredits += 6;
                    }

                    // Local LLM decide fallback
                    if (!decision || !decision.tool || decision.tool === 'error_no_tool_selected') {
                        try {
                            console.log('[AgentExecutor] Using local LLM decide fallback...');
                            const planDisplay = state.plan.map((step, i) =>
                                `${i + 1}. ${step}${i + 1 === state.currentStep ? ' ← CURRENT' : (i + 1 < state.currentStep ? ' ✓' : '')}`
                            ).join('\n');
                            const toolList = currentToolDefs.map(t =>
                                `- ${t.name}: ${t.description} INPUT:${JSON.stringify(t.inputSchema)}`
                            ).join('\n');
                            const obsText = observations.length
                                ? observations.map(o => `Step ${o.iteration} [${o.action}]: ${o.observation}`).join('\n')
                                : 'None yet';
                            const decidePrompt = `Goal: ${state.goal}\nPlan:\n${planDisplay}\nObservations:\n${obsText}\nFailed: ${JSON.stringify(failedAttempts).substring(0, 500)}\nContext keys: ${Object.keys(contextForDecider).join(', ')}\n\nTools:\n${toolList}\n\nYou are on step ${state.currentStep}/${state.plan.length}. Select ONE tool for the current step.\nRespond with ONLY JSON: {"reasoning":"...","tool":"tool_name","input":{...},"is_final":false}\nOr when ALL steps done: {"reasoning":"...","tool":"FINISH","input":{"final_answer":"..."},"is_final":true}`;
                            const llmDecide = await callLlmDirectly({
                                provider: thinkingProvider === 'anthropic' ? 'anthropic' : 'gemini',
                                model: thinkingModelId,
                                prompt: decidePrompt,
                                system: 'You are a tool-selection agent. Return ONLY valid JSON with tool, input, reasoning, is_final.',
                                temperature: 0.3,
                                maxTokens: 800,
                                secrets
                            });
                            const raw = llmDecide.text || '';
                            const jsonMatch = raw.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                decision = {
                                    tool: parsed.tool || null,
                                    input: parsed.input || {},
                                    reasoning: parsed.reasoning || 'Local fallback decision',
                                    isFinal: parsed.is_final === true || parsed.tool === 'FINISH',
                                    finalAnswer: parsed.final_answer || parsed.input?.final_answer || null
                                };
                            }
                            totalCredits += 6;
                        } catch (e) {
                            console.error('[AgentExecutor] Local decide fallback failed:', e.message);
                        }
                    }

                    if (!decision || !decision.tool || decision.tool === 'error_no_tool_selected') {
                        state.consecutiveErrors = (state.consecutiveErrors || 0) + 1;
                        const thought = {
                            iteration: state.iteration,
                            thought: 'Failed to decide a tool or no tool selected.',
                            action: 'error_no_tool_selected',
                            actionInput: null,
                            observation: `[system] No valid tool selected (attempt ${state.consecutiveErrors}/3). Choose a tool from: ${enabledTools.join(', ')}.`,
                            timestamp: Date.now()
                        };
                        state.thoughts.push(thought);
                        await writeAgentLog(state.iteration, thought.thought, thought.action, thought.observation);
                        if (state.consecutiveErrors >= 3) {
                            state.status = 'failed';
                            state.finalAnswer = 'Agent terminated due to repeated tool selection failures.';
                            break;
                        }
                        continue;
                    }

                    state.consecutiveErrors = 0;
                    const toolName = String(decision.tool || '').toLowerCase() === 'finish'
                        ? 'FINISH'
                        : String(decision.tool);

                    const thought = {
                        iteration: state.iteration,
                        thought: decision.reasoning || `Using tool ${toolName}`,
                        action: toolName,
                        actionInput: decision.input,
                        observation: null,
                        timestamp: Date.now()
                    };

                    // ---- FINISH handling with smart guards ----
                    if (decision.isFinal || toolName === 'FINISH') {
                        const remainingSteps = state.plan.slice(Math.max(0, state.currentStep - 1));
                        const remainingHasSideEffects = remainingSteps.some(s =>
                            /email|slack|send_email|send_slack|notify|append_to_sheet|webhook/i.test(String(s))
                        );
                        const hasSuccessfulWork = state.toolAttempts.some(a => a.success);
                        const proposedAnswer = decision.finalAnswer
                            || decision.input?.final_answer
                            || decision.reasoning
                            || state.memory.lastObservation
                            || null;

                        // Strict block only when unfinished side-effect delivery remains
                        if (state.currentStep <= state.plan.length && remainingHasSideEffects) {
                            const stepsRemaining = remainingSteps.length;
                            thought.observation = `[BLOCKED] You cannot call FINISH yet. ${stepsRemaining} delivery step(s) remain (email/slack/etc). Execute Step ${state.currentStep}: "${state.plan[state.currentStep - 1]}".`;
                            state.thoughts.push(thought);
                            await writeAgentLog(state.iteration, thought.thought, 'FINISH', thought.observation);
                            console.warn(`[AgentExecutor] BLOCKED FINISH — side-effect steps remain`);
                            continue;
                        }

                        // Block empty FINISH before any successful tool work
                        if (!hasSuccessfulWork && state.currentStep <= state.plan.length && !proposedAnswer) {
                            thought.observation = `[BLOCKED] No work completed yet. Execute Step ${state.currentStep}: "${state.plan[state.currentStep - 1]}".`;
                            state.thoughts.push(thought);
                            await writeAgentLog(state.iteration, thought.thought, 'FINISH', thought.observation);
                            continue;
                        }

                        // Deliverable guard for goals that imply email/report delivery
                        const goalImpliesDeliverable = /\b(email|send|report|summary|document|case study)\b/i.test(state.goal);
                        const goalImpliesSideEffectDelivery = /\b(email|send|slack|notify)\b/i.test(state.goal);
                        if (goalImpliesSideEffectDelivery) {
                            const primaryArtifact = state.memory._primaryArtifact;
                            const artifacts = state.memory._artifacts || {};
                            const sentSideEffect = state.toolAttempts.some(a =>
                                a.success && ['send_email', 'send_slack'].includes(a.tool)
                            );
                            if (!sentSideEffect && (!primaryArtifact || !artifacts[primaryArtifact])) {
                                thought.observation = `[BLOCKED] Goal requires delivering content (email/slack). Complete synthesize_report → declare_artifact → send_* before FINISH.`;
                                state.thoughts.push(thought);
                                await writeAgentLog(state.iteration, thought.thought, 'FINISH', thought.observation);
                                continue;
                            }
                        }

                        // Accept FINISH: plan done, or remaining steps are non-critical formatting
                        state.finalAnswer = typeof proposedAnswer === 'string'
                            ? proposedAnswer
                            : (proposedAnswer != null ? JSON.stringify(proposedAnswer) : 'Goal completed.');
                        // Prefer last tool observation when FINISH text is just a blockage echo
                        if (String(state.finalAnswer).startsWith('[BLOCKED]') && state.memory.lastObservation) {
                            state.finalAnswer = truncateObservation(state.memory.lastObservation, 4000);
                        }
                        state.status = 'completed';
                        state.currentStep = Math.max(state.currentStep, state.plan.length + 1);
                        thought.observation = 'Goal completed';
                        state.thoughts.push(thought);
                        await writeAgentLog(state.iteration, thought.thought, 'FINISH', thought.observation);
                        break;
                    }

                    // ---- Stage 2: EXECUTE ----
                    const toolLower = toolName.toLowerCase();
                    const isKnownStatic = enabledTools.map(t => t.toLowerCase()).includes(toolLower);
                    const isMcp = toolLower.startsWith('mcp_');
                    if (!isKnownStatic && !isMcp) {
                        thought.observation = `[ERROR] Unknown or disabled tool: ${toolName}. Available: ${enabledTools.join(', ')}`;
                        state.thoughts.push(thought);
                        await writeAgentLog(state.iteration, thought.thought, toolName, thought.observation);
                        continue;
                    }

                    const inputHash = hashInput(decision.input || {});
                    const previousAttempt = state.toolAttempts.find(a => a.tool === toolLower && a.inputHash === inputHash);
                    const isExpensiveTool = ['deep_research', 'crawl_site'].includes(toolLower);
                    const isSideEffectTool = ['send_email', 'send_slack'].includes(toolLower);

                    if (previousAttempt && !previousAttempt.success) {
                        thought.observation = `[SKIPPED] You already tried ${toolName} with these exact inputs and it failed. Try different inputs or a different tool.`;
                        state.thoughts.push(thought);
                        await writeAgentLog(state.iteration, thought.thought, toolName, thought.observation);
                        continue;
                    }
                    if (previousAttempt && previousAttempt.success && isSideEffectTool) {
                        thought.observation = `[SKIPPED] You already sent this exact ${toolLower === 'send_email' ? 'email' : 'message'} with the same inputs. Do not send duplicates.`;
                        state.thoughts.push(thought);
                        await writeAgentLog(state.iteration, thought.thought, toolName, thought.observation);
                        continue;
                    }
                    if (previousAttempt && previousAttempt.success && isExpensiveTool) {
                        thought.observation = `[SKIPPED] You already ran ${toolName} with these inputs. Use previous results from context.`;
                        state.thoughts.push(thought);
                        await writeAgentLog(state.iteration, thought.thought, toolName, thought.observation);
                        continue;
                    }

                    // Identical web_search loop abort
                    if (toolLower === 'web_search' && previousAttempt && previousAttempt.success) {
                        const identicalCount = state.toolAttempts.filter(a => a.tool === toolLower && a.inputHash === inputHash).length;
                        if (identicalCount >= 2) {
                            thought.observation = `[SYSTEM ABORT] Identical search repeated too many times. Terminating to save credits.`;
                            state.status = 'failed';
                            state.finalAnswer = thought.observation;
                            state.thoughts.push(thought);
                            await writeAgentLog(state.iteration, thought.thought, toolName, thought.observation);
                            break;
                        }
                    }

                    totalCredits += 5;
                    console.log(`[AgentExecutor] Executing tool: ${toolName}`);
                    await writeAgentLog(state.iteration, thought.thought, toolName, 'Executing tool...');

                    const toolResult = await runAgentTool(
                        toolLower,
                        decision.input || {},
                        state.memory,
                        secrets,
                        supabase,
                        userId,
                        flowId,
                        runId
                    );
                    thought.observation = typeof toolResult.output === 'string'
                        ? toolResult.output
                        : JSON.stringify(toolResult.output);
                    state.thoughts.push(thought);

                    const success = !toolResult.error
                        && !String(toolResult.output || '').startsWith('[ERROR]')
                        && !String(toolResult.output || '').startsWith('[BLOCKED]');
                    state.toolAttempts.push({
                        tool: toolLower,
                        inputHash,
                        success,
                        error: success ? undefined : String(toolResult.output)
                    });

                    const memoryTypeMap = {
                        'deep_research': 'research.observations',
                        'synthesize_report': 'synthesis.report_handle',
                        'web_search': 'research.search_results'
                    };
                    if (memoryTypeMap[toolLower]) {
                        const key = memoryTypeMap[toolLower];
                        state.memory[key] = (state.memory[key] || '') + '\n' + toolResult.output;
                    }
                    state.memory[`observation_${state.iteration}`] = toolResult.output;
                    state.memory.lastObservation = toolResult.output;

                    // Intelligent step advancement (semantic match only)
                    const currentPlanStep = state.plan[state.currentStep - 1] || '';
                    if (success
                        && toolLower !== 'read_context'
                        && toolMatchesPlanStep(toolLower, currentPlanStep)) {
                        state.currentStep++;
                        console.log(`[AgentExecutor] Advanced to step ${state.currentStep} (tool matched step)`);
                    } else if (success && !toolMatchesPlanStep(toolLower, currentPlanStep)) {
                        console.log(`[AgentExecutor] Tool '${toolName}' did not match step ${state.currentStep}; staying on current step`);
                    }

                    await writeAgentLog(state.iteration, thought.thought, toolName, thought.observation);
                }

                // If we somehow exit the loop still "running", mark completed with best answer
                if (state.status === 'running') {
                    state.status = state.finalAnswer ? 'completed' : 'failed';
                    if (!state.finalAnswer) {
                        const lastThought = state.thoughts[state.thoughts.length - 1];
                        state.finalAnswer = truncateObservation(lastThought?.observation || '', 4000) || 'Agent stopped without a final answer.';
                    }
                }

                const agentStateFinal = buildAgentStateSnapshot(state.iteration);
                output = {
                    answer: state.finalAnswer,
                    success: state.status === 'completed',
                    iterations: state.iteration,
                    thoughts: state.thoughts,
                    status: state.status,
                    plan: state.plan,
                    agentState: agentStateFinal
                };
                context.artifactStore = state.memory.artifactStore;
                credits = totalCredits;

                // Surface hard failures as node errors so the canvas shows the problem
                if (state.status === 'failed' && !state.finalAnswer) {
                    error = 'Agent execution failed without producing an answer.';
                }

                console.log(`[AgentExecutor] Done. status=${state.status} iterations=${state.iteration} credits=${totalCredits}`);
                break;
            }

            case 'condition': {
                credits = CREDIT_COSTS.logic;
                const conditionStr = interpolateVariables(node.data.condition || 'true', context, secrets);
                let condResult = false;
                try {
                    const normalized = conditionStr
                        .replace(/&&/g, ' and ')
                        .replace(/\|\|/g, ' or ')
                        .replace(/===/g, ' == ')
                        .replace(/!==/g, ' != ')
                        .replace(/!/g, ' not ');
                    condResult = !!math.evaluate(normalized);
                } catch {
                    condResult = String(conditionStr).trim().toLowerCase() === 'true';
                }
                output = { result: condResult };
                activeHandles = condResult ? ['true', 'yes'] : ['false', 'no'];
                break;
            }

            case 'router': {
                credits = CREDIT_COSTS.logic;
                const routeValue = interpolateVariables(node.data.content || '', context, secrets);
                output = { route: routeValue };
                activeHandles = [String(routeValue)];
                break;
            }

            case 'web_search': {
                credits = CREDIT_COSTS.web_search;
                const query = interpolateVariables(node.data.webQuery || node.data.content || '', context, secrets);
                if (!query) throw new Error('Search query is required');

                const key = secrets['TAVILY_API_KEY'] || process.env.TAVILY_API_KEY;
                if (!key) throw new Error("Missing TAVILY_API_KEY. Add it to Secrets.");

                const response = await fetch('https://api.tavily.com/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
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
                    const err = new Error(`Tavily API Error (${response.status}): ${errorText}`);
                    err.status = response.status;
                    throw err;
                }

                const data = await response.json();
                output = data.answer || data.results.map(r => `- ${r.title}: ${r.content}`).join('\n');
                break;
            }

            case 'deep_research': {
                credits = CREDIT_COSTS.deep_research;
                const topic = interpolateVariables(node.data.researchTopic || node.data.content || '', context, secrets);
                if (!topic) throw new Error('Research topic is required');

                const key = secrets['TAVILY_API_KEY'] || process.env.TAVILY_API_KEY;
                if (!key) throw new Error("Missing TAVILY_API_KEY. Add it to Secrets.");

                const response = await fetch('https://api.tavily.com/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: key,
                        query: topic,
                        search_depth: 'advanced',
                        include_answer: true,
                        include_raw_content: true,
                        max_results: node.data.maxResults || 10
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const err = new Error(`Tavily API Error (${response.status}): ${errorText}`);
                    err.status = response.status;
                    throw err;
                }

                const data = await response.json();
                output = {
                    summary: data.answer || 'No summary available',
                    sources: (data.results || []).map(r => ({
                        title: r.title,
                        url: r.url,
                        snippet: r.content?.substring(0, 300)
                    })),
                    conclusion: data.answer ? "Research findings synthesized above." : "Insufficient data found.",
                    more_research_needed: !data.answer || data.answer.includes("I don't know")
                };
                break;
            }

            case 'extract_url': {
                credits = CREDIT_COSTS.extract_url;
                const extractUrl = interpolateVariables(node.data.extractUrl || node.data.content || '', context, secrets);
                if (!extractUrl) throw new Error('URL to extract is required');

                const key = secrets['TAVILY_API_KEY'] || process.env.TAVILY_API_KEY;
                if (!key) throw new Error("Missing TAVILY_API_KEY. Add it to Secrets.");

                const response = await fetch('https://api.tavily.com/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: key,
                        urls: [extractUrl]
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const err = new Error(`Tavily Extract Error (${response.status}): ${errorText}`);
                    err.status = response.status;
                    throw err;
                }

                const data = await response.json();
                const extracted = data.results?.[0] || {};
                output = {
                    url: extractUrl,
                    title: extracted.title || 'Unknown',
                    content: extracted.raw_content?.substring(0, 10000) || extracted.content || 'No content extracted'
                };
                break;
            }

            case 'crawl_site': {
                credits = CREDIT_COSTS.crawl_site;
                const crawlUrl = interpolateVariables(node.data.crawlUrl || node.data.content || '', context, secrets);
                if (!crawlUrl) throw new Error('Site URL is required');

                const key = secrets['TAVILY_API_KEY'] || process.env.TAVILY_API_KEY;
                if (!key) throw new Error("Missing TAVILY_API_KEY. Add it to Secrets.");

                const response = await fetch('https://api.tavily.com/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        api_key: key,
                        urls: [crawlUrl]
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const err = new Error(`Tavily Crawl Error (${response.status}): ${errorText}`);
                    err.status = response.status;
                    throw err;
                }

                const data = await response.json();
                output = {
                    baseUrl: crawlUrl,
                    pages: data.results || [],
                    pagesFound: (data.results || []).length
                };
                break;
            }

            case 'mcp': {
                credits = CREDIT_COSTS.mcp;
                const serverUrl = interpolateVariables(node.data.url || '', context, secrets);
                const toolName = node.data.mcpSelectedTool || interpolateVariables(node.data.content || '', context, secrets);
                if (!serverUrl || !toolName) {
                    throw new Error('MCP node requires Server URL and Tool Name');
                }

                let args = {};
                if (node.data.mcpInputValues && Object.keys(node.data.mcpInputValues).length > 0) {
                    for (const [key, value] of Object.entries(node.data.mcpInputValues)) {
                        args[key] = typeof value === 'string'
                            ? interpolateVariables(value, context, secrets)
                            : value;
                    }
                } else if (node.data.body) {
                    try {
                        args = JSON.parse(interpolateVariables(node.data.body, context, secrets));
                    } catch {
                        args = {};
                    }
                }

                const toolSchema = node.data.mcpToolSchema;
                if (toolSchema?.inputSchema) {
                    const schema = toolSchema.inputSchema;
                    const properties = schema.properties || {};
                    const required = schema.required || [];

                    for (const reqKey of required) {
                        if (args[reqKey] === undefined || args[reqKey] === null) {
                            throw new Error(`MCP Validation Error: Required argument "${reqKey}" is missing.`);
                        }
                    }

                    for (const [key, value] of Object.entries(args)) {
                        if (value === undefined || value === null) continue;

                        const propDef = properties[key];
                        if (!propDef) continue;

                        const expectedType = propDef.type;
                        const actualType = typeof value;

                        if (expectedType === 'number' || expectedType === 'integer') {
                            const num = Number(value);
                            if (isNaN(num)) {
                                throw new Error(`MCP Validation Error: Argument "${key}" must be a number.`);
                            }
                            args[key] = num;
                        } else if (expectedType === 'boolean') {
                            if (actualType !== 'boolean') {
                                if (value === 'true' || value === 1 || value === '1' || value === true) {
                                    args[key] = true;
                                } else if (value === 'false' || value === 0 || value === '0' || value === false) {
                                    args[key] = false;
                                } else {
                                    throw new Error(`MCP Validation Error: Argument "${key}" must be a boolean.`);
                                }
                            }
                        } else if (expectedType === 'object') {
                            if (actualType !== 'object' || value === null) {
                                try {
                                    args[key] = JSON.parse(String(value));
                                } catch (e) {
                                    throw new Error(`MCP Validation Error: Argument "${key}" must be a JSON object.`);
                                }
                            }
                        } else if (expectedType === 'array') {
                            if (!Array.isArray(value)) {
                                try {
                                    const parsed = JSON.parse(String(value));
                                    if (Array.isArray(parsed)) {
                                        args[key] = parsed;
                                    } else {
                                        throw new Error(`MCP Validation Error: Argument "${key}" must be an array.`);
                                    }
                                } catch (e) {
                                    throw new Error(`MCP Validation Error: Argument "${key}" must be a valid JSON array.`);
                                }
                            }
                        }
                    }
                }

                const authType = node.data.mcpAuthType || 'none';
                let auth = undefined;
                if (authType !== 'none') {
                    const secretKey = node.data.mcpAuthSecret;
                    auth = {
                        type: authType,
                        key: secretKey ? (secrets[secretKey] || secretKey) : undefined,
                        headerName: authType === 'api_key' ? (node.data.mcpAuthHeader || 'X-API-Key') : undefined
                    };
                }

                const mcpResult = await callMcpDirectly(serverUrl, toolName, args, auth);
                if (mcpResult?.content && Array.isArray(mcpResult.content)) {
                    const textContent = mcpResult.content.find(c => c.type === 'text');
                    output = textContent ? textContent.text : mcpResult.content;
                } else {
                    output = mcpResult;
                }
                if (mcpResult?.isError) {
                    throw new Error(`MCP Tool Error: ${output}`);
                }
                break;
            }

            case 'text': {
                credits = CREDIT_COSTS.logic;
                const textOp = node.data.textOperation || 'trim';
                const textContent = interpolateVariables(node.data.content || '', context, secrets);
                const separator = interpolateVariables(node.data.textSeparator || '', context, secrets);
                switch (textOp) {
                    case 'uppercase': output = String(textContent).toUpperCase(); break;
                    case 'lowercase': output = String(textContent).toLowerCase(); break;
                    case 'trim': output = String(textContent).trim(); break;
                    case 'split': output = String(textContent).split(separator || ','); break;
                    case 'join': 
                        if (Array.isArray(textContent)) {
                            output = textContent.join(separator || ',');
                        } else {
                            throw new Error("Content must be an array for 'join' operation");
                        }
                        break;
                    case 'replace':
                        const replacement = interpolateVariables(node.data.textReplacement || '', context, secrets);
                        output = String(textContent).split(separator).join(replacement);
                        break;
                    default:
                        output = textContent;
                }
                break;
            }

            case 'json': {
                credits = CREDIT_COSTS.logic;
                const jsonOp = node.data.jsonOperation || 'parse';
                const rawJsonContent = interpolateVariables(node.data.content || '', context, secrets);
                if (jsonOp === 'parse') {
                    try {
                        output = JSON.parse(String(rawJsonContent));
                    } catch {
                        output = rawJsonContent;
                    }
                } else if (jsonOp === 'stringify') {
                    output = JSON.stringify(typeof rawJsonContent === 'string' ? JSON.parse(rawJsonContent) : rawJsonContent);
                } else if (jsonOp === 'pick') {
                    const parsed = typeof rawJsonContent === 'string' ? JSON.parse(rawJsonContent) : rawJsonContent;
                    const key = interpolateVariables(node.data.jsonKey || '', context, secrets);
                    output = key.split('.').reduce((acc, k) => acc && acc[k], parsed);
                }
                break;
            }

            case 'input':
            case 'note':
                output = interpolateVariables(node.data.content || '', context, secrets);
                break;

            case 'output':
                const varToOutput = node.data.variableName || 'output';
                // Shallow-copy when emitting the whole context: assigning it by
                // reference lets context[nodeId] = output point back at context
                // itself, which breaks JSON serialization of logs and responses.
                output = context[varToOutput] || { ...context };
                break;

            default:
                console.log(`[Execute] Unsupported node type: ${nodeType}`);
                output = { ...context };
        }
    } catch (e) {
        error = e.message || String(e);
        console.error(`[Execute] Node ${node.id} error:`, error);
    }

    return { output, credits, error, activeHandles, consoleLogs };
}

// Main workflow execution
async function executeWorkflow(
    flowId,
    nodes,
    edges,
    initialContext,
    userId,
    supabase,
    triggerSource = 'Cloud',
    runId = crypto.randomUUID(),
    startNodeIds,
    mode = 'production'
) {
    const startTime = Date.now();
    const logs = [];
    let totalCredits = mode === 'production' ? CREDIT_COSTS.base_fee : 0;
    const context = { ...initialContext };
    
    // Node status mapping: nodeId -> 'pending' | 'eligible' | 'executing' | 'completed' | 'failed' | 'paused' | 'pruned'
    const nodeStatus = new Map();
    // Edge status mapping: edgeId -> 'pending' | 'active' | 'pruned'
    const edgeStatus = new Map();
    // Incoming edge IDs mapping: nodeId -> Set of edge IDs
    const incomingEdges = new Map();
    
    for (const node of nodes) {
        nodeStatus.set(node.id, 'pending');
        incomingEdges.set(node.id, new Set());
    }
    
    for (const edge of edges) {
        edgeStatus.set(edge.id, 'pending');
        const targetIncoming = incomingEdges.get(edge.target);
        if (targetIncoming) {
            targetIncoming.add(edge.id);
        }
    }
    
    // Identify start/initial queue
    let eligibleNodeIds = [];
    if (startNodeIds && startNodeIds.length > 0) {
        eligibleNodeIds = [...startNodeIds];
        for (const startId of startNodeIds) {
            const incoming = incomingEdges.get(startId);
            if (incoming) {
                for (const edgeId of incoming) {
                    edgeStatus.set(edgeId, 'pruned');
                }
            }
        }
    } else {
        const startNodes = nodes.filter(n =>
            ['start', 'webhook', 'schedule', 'form_trigger', 'whatsapp_trigger', 'razorpay_trigger', 'telegram_trigger', 'discord_trigger'].includes(n.data?.type || n.type) ||
            !edges.some(e => e.target === n.id)
        );
        eligibleNodeIds = startNodes.map(n => n.id);
    }
    
    // Non-blocking log promises queue
    const logPromises = [];
    const logInsertPromises = new Map();
    
    function queueRunningLog(nodeId, nodeType) {
        if (logInsertPromises.has(nodeId)) {
            return logInsertPromises.get(nodeId);
        }
        
        const insertPromise = (async () => {
            try {
                const { data: runningRow } = await supabase
                    .from('execution_logs')
                    .insert({
                        run_id: runId,
                        flow_id: flowId,
                        node_id: nodeId,
                        node_type: nodeType,
                        status: 'running',
                        user_id: userId || null,
                    })
                    .select('id')
                    .single();
                return runningRow?.id ?? null;
            } catch (e) {
                console.error(`[Execute] Failed to write running log for ${nodeId}:`, e.message);
                return null;
            }
        })();
        
        logInsertPromises.set(nodeId, insertPromise);
        return insertPromise;
    }
    
    // Start first log writes (for initial nodes) in parallel with secrets fetch!
    for (const nodeId of eligibleNodeIds) {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            const nodeType = node.data?.type || node.type;
            queueRunningLog(nodeId, nodeType);
        }
    }
    
    // Fetch decrypted secrets and wait for initial node log inserts in parallel!
    const secretsPromise = getDecryptedSecrets(userId, supabase);
    const [userSecrets] = await Promise.all([
        secretsPromise,
        ...logInsertPromises.values()
    ]);
    // Platform keys from Cloud Run Secret Manager / env, overridden by per-user BYOK secrets
    const secrets = mergeSecrets(userSecrets);
    
    let executionPaused = false;
    let resumeTokenForLog;

    const retryableNodeTypes = [
        'llm', 'api_call', 'web_search', 'deep_research', 'extract_url',
        'crawl_site', 'mcp', 'rss', 'sheets', 'hubspot'
    ];

    async function executeSingleNode(nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return { credits: 0 };

        const nodeStart = Date.now();
        const nodeType = node.data?.type || node.type;

        const logInsertPromise = queueRunningLog(nodeId, nodeType);

        let executionResult;
        if (retryableNodeTypes.includes(nodeType)) {
            const maxAttempts = node.data?.maxAttempts || 3;
            executionResult = await withRetry(
                () => executeNode(node, context, secrets, supabase, userId, flowId, runId),
                maxAttempts,
                250,
                2
            );
        } else {
            executionResult = await executeNode(node, context, secrets, supabase, userId, flowId, runId);
        }

        const { output, credits, error, activeHandles, consoleLogs, paused, resumeToken, approvalNotification } = executionResult;
        totalCredits += credits;

        const varName = node.data?.variableName || nodeId;
        context[varName] = output;
        context[nodeId] = output;

        let logOutput = output;
        if (consoleLogs && consoleLogs.length > 0) {
            if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
                logOutput = { ...output, __consoleLogs: consoleLogs };
            } else {
                logOutput = { result: output, __consoleLogs: consoleLogs };
            }
        }

        const logEntry = {
            run_id: runId,
            flow_id: flowId,
            node_id: nodeId,
            node_type: nodeType,
            status: error ? 'error' : 'success',
            input: initialContext,
            output: logOutput,
            error,
            duration_ms: Date.now() - nodeStart,
            credits_used: credits,
            user_id: userId || null,
        };
        logs.push(logEntry);

        const updatePromise = (async () => {
            try {
                const liveLogId = await logInsertPromise;
                if (liveLogId) {
                    await supabase.from('execution_logs').update(logEntry).eq('id', liveLogId);
                } else {
                    await supabase.from('execution_logs').insert(logEntry);
                }
            } catch (e) {
                console.error(`[Execute] Failed to update execution log for ${nodeId}:`, e.message);
            }
        })();
        logPromises.push(updatePromise);

        return { error, paused, resumeToken, approvalNotification, activeHandles };
    }

    // Topological execution loop
    while (true) {
        if (mode === 'preview' && (Date.now() - startTime) > 60000) {
            throw new Error('Preview mode timeout: execution exceeded 60s cap');
        }

        const newlyEligible = [];
        for (const node of nodes) {
            if (nodeStatus.get(node.id) !== 'pending') continue;

            const incoming = incomingEdges.get(node.id);
            let allResolved = true;
            for (const edgeId of incoming) {
                if (edgeStatus.get(edgeId) === 'pending') {
                    allResolved = false;
                    break;
                }
            }

            if (allResolved) {
                newlyEligible.push(node.id);
            }
        }

        if (newlyEligible.length === 0 && eligibleNodeIds.length > 0) {
            newlyEligible.push(...eligibleNodeIds);
            eligibleNodeIds = [];
        }

        if (newlyEligible.length === 0) {
            break;
        }

        const nodesToExecute = [];
        for (const nodeId of newlyEligible) {
            const incoming = incomingEdges.get(nodeId);
            const isPruned = incoming.size > 0 && Array.from(incoming).every(edgeId => edgeStatus.get(edgeId) === 'pruned');

            if (isPruned) {
                nodeStatus.set(nodeId, 'pruned');
                const outEdges = edges.filter(e => e.source === nodeId);
                for (const edge of outEdges) {
                    edgeStatus.set(edge.id, 'pruned');
                }
            } else {
                nodeStatus.set(nodeId, 'executing');
                nodesToExecute.push(nodeId);
            }
        }

        if (nodesToExecute.length === 0) {
            continue;
        }

        const executionPromises = nodesToExecute.map(async (nodeId) => {
            const res = await executeSingleNode(nodeId);
            return { nodeId, ...res };
        });

        const results = await Promise.all(executionPromises);

        let stopExecution = false;
        for (const res of results) {
            const { nodeId, error, paused, resumeToken, approvalNotification, activeHandles } = res;

            if (error) {
                nodeStatus.set(nodeId, 'failed');
                stopExecution = true;
            } else if (paused) {
                nodeStatus.set(nodeId, 'paused');
                executionPaused = true;
                resumeTokenForLog = resumeToken;

                const pauseWritePromise = (async () => {
                    try {
                        await supabase.from('paused_executions').insert({
                            run_id: runId,
                            flow_id: flowId,
                            node_id: nodeId,
                            resume_token: resumeToken,
                            context_snapshot: context,
                            status: 'paused'
                        });
                        if (approvalNotification && resumeToken) {
                            await sendApprovalNotification(approvalNotification, resumeToken);
                        }
                    } catch (e) {
                        console.error('[Execute] Failed to save paused execution:', e.message);
                    }
                })();
                logPromises.push(pauseWritePromise);
                
                stopExecution = true;
            } else {
                nodeStatus.set(nodeId, 'completed');
                
                const outEdges = edges.filter(e => e.source === nodeId);
                if (activeHandles && activeHandles.length > 0) {
                    const matched = outEdges.filter(e => activeHandles.includes(String(e.sourceHandle)));
                    const matchedIds = new Set(matched.map(e => e.id));
                    
                    let useDefault = matched.length === 0;
                    const defaultEdges = outEdges.filter(e => e.sourceHandle === 'default');
                    const defaultIds = new Set(defaultEdges.map(e => e.id));

                    for (const edge of outEdges) {
                        if (matchedIds.has(edge.id)) {
                            edgeStatus.set(edge.id, 'active');
                        } else if (useDefault && defaultIds.has(edge.id)) {
                            edgeStatus.set(edge.id, 'active');
                        } else {
                            edgeStatus.set(edge.id, 'pruned');
                        }
                    }
                } else {
                    for (const edge of outEdges) {
                        edgeStatus.set(edge.id, 'active');
                    }
                }
            }
        }

        if (stopExecution) {
            break;
        }
    }

    await Promise.allSettled(logPromises);

    if (mode === 'production') {
        try {
            await supabase.rpc('deduct_credits', { uid: userId, amount: totalCredits });
        } catch (e) {
            console.error('[Execute] Credit deduction RPC failed:', e.message);
        }
    } else {
        console.log(`[Preview Mode] Bypassing credit deduction. Calculated credits: ${totalCredits}`);
    }

    const duration = Date.now() - startTime;
    let finalStatus = logs.some(l => l.error) ? 'failed' : 'success';
    if (executionPaused) finalStatus = 'paused';

    if (finalStatus !== 'paused') {
        try {
            await supabase.from('execution_logs').insert({
                run_id: runId,
                flow_id: flowId,
                node_id: '__run_end__',
                node_type: 'system',
                status: finalStatus,
                user_id: userId || null,
                duration_ms: duration,
                credits_used: totalCredits,
            });
        } catch (e) {
            console.error('[Execute] Failed to write run-end marker:', e.message);
        }
    }

    try {
        await saveRunHistory(supabase, {
            runId,
            flowId,
            userId,
            status: finalStatus,
            duration,
            creditsUsed: mode === 'production' ? totalCredits : 0,
            logs,
            triggerSource,
        });
    } catch (e) {
        console.error('[Execute] Run history save failed:', e.message);
    }

    return {
        success: !logs.some(l => l.error),
        output: context,
        status: finalStatus,
        resumeToken: resumeTokenForLog,
        logs,
        creditsUsed: totalCredits
    };
}

// Process pending webhooks
async function processWebhooks(supabase) {
    let processed = 0;
    let errors = 0;

    const { data: pending } = await supabase.rpc('get_pending_webhooks', { limit_count: 10 });

    for (const item of pending || []) {
        try {
            await supabase
                .from('webhook_queue')
                .update({ status: 'processing' })
                .eq('id', item.queue_id);

            let userId = item.user_id;
            let nodes = item.nodes || [];
            let edges = item.edges || [];

            if (!userId || !nodes.length) {
                const { data: flow } = await supabase
                    .from('flows')
                    .select('user_id, content')
                    .eq('id', item.flow_id)
                    .single();

                if (flow) {
                    userId = userId || flow.user_id;
                    nodes = nodes.length ? nodes : (flow.content?.nodes || []);
                    edges = edges.length ? edges : (flow.content?.edges || []);
                }
            }

            const webhookNode = nodes.find(n => (n.data?.type || n.type) === 'webhook');
            const varName = webhookNode?.data?.variableName || 'payload';

            const { _webhook, ...userPayload } = item.payload || {};
            const initialContext = {
                [varName]: userPayload,
                ...userPayload,
                _webhook: _webhook || {},
            };

            const result = await executeWorkflow(
                item.flow_id,
                nodes,
                edges,
                initialContext,
                userId,
                supabase,
                'Webhook'
            );

            await supabase
                .from('webhook_queue')
                .update({
                    status: result.success ? 'completed' : 'failed',
                    processed_at: new Date().toISOString(),
                })
                .eq('id', item.queue_id);

            processed++;
        } catch (e) {
            console.error(`[Webhook] Processing error:`, e);
            await supabase
                .from('webhook_queue')
                .update({
                    status: 'failed',
                    processed_at: new Date().toISOString(),
                })
                .eq('id', item.queue_id);
            errors++;
        }
    }

    return { processed, errors };
}

// REST Routes

let jwksClient = null;
function getJwksClient(supabaseUrl) {
    if (!jwksClient) {
        jwksClient = jose.createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/jwks`));
    }
    return jwksClient;
}

async function verifySupabaseJwt(token, supabaseUrl) {
    try {
        const JWKS = getJwksClient(supabaseUrl);
        const { payload } = await jose.jwtVerify(token, JWKS);
        return payload;
    } catch (err) {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
        if (!serviceKey) throw err;
        const supabase = getSupabaseClient(supabaseUrl, serviceKey);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            throw new Error(error?.message || 'Invalid session');
        }
        return { sub: user.id };
    }
}

// Helper to authenticate caller is a trusted service (passes service role key) OR a valid user Supabase JWT
async function authenticateService(req, res, next) {
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
    
    if (serviceKey && token === serviceKey) {
        // Authenticated as service role
        return next();
    }

    // Try to verify as user Supabase JWT
    const supabaseUrl = process.env.SUPABASE_URL;
    if (token && supabaseUrl) {
        try {
            const payload = await verifySupabaseJwt(token, supabaseUrl);
            if (payload && payload.sub) {
                req.userId = payload.sub;
                return next();
            }
        } catch (err) {
            console.error('[Auth] JWT verification failed:', err.message);
            return res.status(401).json({ error: `Unauthorized: Invalid user session: ${err.message}` });
        }
    }

    return res.status(401).json({ error: 'Unauthorized: valid service credentials or user session required' });
}

// ============================================================================
// AGENT UTILS & TOOL EXECUTION HELPERS
// ============================================================================

function validateReport(report) {
    if (!report || typeof report !== 'object') return "Output is not a JSON object";
    if (!report.title || typeof report.title !== 'string') return "Missing or invalid 'title'";
    if (!report.summary || typeof report.summary !== 'string') return "Missing or invalid 'summary'";
    if (!Array.isArray(report.sections) || report.sections.length === 0) return "Missing or empty 'sections' array";
    if (!Array.isArray(report.sources)) return "Missing 'sources' array";

    for (let i = 0; i < report.sections.length; i++) {
        const s = report.sections[i];
        if (!s.heading || !s.content) return `Section ${i} missing 'heading' or 'content'`;
    }
    return null;
}

function truncateObservation(obs, maxLen = 1000) {
    let obsStr = typeof obs === 'string' ? obs : JSON.stringify(obs, null, 2);
    if (!obsStr || obsStr.length <= maxLen) return obsStr;
    const truncated = obsStr.substring(0, maxLen);
    const remaining = obsStr.length - maxLen;
    return `${truncated}\n\n[TRUNCATED: ${remaining} more characters. Key information extracted above.]`;
}

function hashInput(input) {
    return JSON.stringify(input).toLowerCase().replace(/\s+/g, '');
}

function repairJSON(str) {
    let repaired = str.replace(/,\s*([}\]])/g, '$1');
    repaired = repaired.replace(/[\x00-\x1F\x7F]/g, (ch) => {
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        return '';
    });
    return repaired;
}

const TOOL_TO_INTENT_KEYWORDS = {
    'deep_research': ['research', 'investigate', 'analyze', 'study', 'comprehensive', 'in-depth'],
    'web_search': ['search', 'find', 'look up', 'google', 'query'],
    'extract_url': ['extract', 'read', 'get content', 'url', 'webpage', 'page'],
    'crawl_site': ['crawl', 'site', 'website', 'map'],
    'synthesize_report': ['report', 'write', 'create', 'generate', 'summarize', 'compile', 'draft', 'synthesis'],
    'llm_call': ['generate', 'write', 'summarize', 'analyze', 'process', 'transform', 'categorize', 'classify', 'llm_call', 'llm'],
    'send_email': ['email', 'send', 'mail', 'notify', 'send_email'],
    'send_slack': ['slack', 'message', 'notify', 'alert', 'send_slack'],
    'api_call': ['api', 'fetch', 'call', 'request', 'endpoint', 'api_call'],
    'javascript': ['calculate', 'process', 'transform', 'code', 'script', 'javascript'],
    'calculate': ['calculate', 'math', 'compute', 'add', 'subtract', 'multiply', 'divide'],
    'declare_artifact': ['declare', 'save', 'artifact', 'finalize', 'declare_artifact'],
    'store_memory': ['store', 'save', 'remember', 'store_memory'],
    'read_context': ['read', 'get', 'context', 'variable', 'read_context'],
    'append_to_sheet': ['sheet', 'spreadsheet', 'google sheets', 'append', 'append_to_sheet']
};

function toolMatchesPlanStep(toolName, planStep) {
    const alwaysAdvanceTools = ['declare_artifact', 'store_memory'];
    if (alwaysAdvanceTools.includes(toolName)) return true;
    const stepLower = planStep.toLowerCase();
    if (stepLower.includes(toolName.toLowerCase())) return true;
    if (toolName.startsWith('mcp_')) return true;
    const keywords = TOOL_TO_INTENT_KEYWORDS[toolName] || [];
    if (keywords.length === 0) return false;
    return keywords.some(keyword => stepLower.includes(keyword));
}

function getToolDescription(t) {
    const descriptions = {
        deep_research: 'Perform comprehensive, multi-step research with detailed analysis and multiple sources.',
        crawl_site: 'Crawl an entire website to map structure and extract content from multiple pages.',
        synthesize_report: 'Generate a structured, validated report (JSON) from research data. REQUIRED for any goal asking for a report/summary.',
        extract_url: 'Extract and parse content from a specific URL/webpage.',
        llm_call: 'Call a language model to generate text, answer questions, or process instructions.',
        send_email: 'Send a formatted email using a SAVED artifact. You cannot write the body yourself.',
        declare_artifact: 'Mark a SAVED synthesis ID as the primary deliverable.',
        web_search: 'Search the web for current information, news, or facts.',
        api_call: 'Make an HTTP request to an external API.',
        send_slack: 'Send a message to Slack.',
        javascript: 'Execute JavaScript code for data processing, calculations, or transformations.',
        calculate: 'Evaluate a mathematical expression.',
        read_context: 'Read data from the current workflow context.',
        store_memory: 'Store a value in agent memory for later use.',
        append_to_sheet: 'Append a row to a Google Sheet.'
    };
    return descriptions[t] || '';
}

function getToolWhenToUse(t) {
    const whenToUse = {
        deep_research: 'Goal explicitly requires thorough/comprehensive/in-depth research, analysis, or report generation',
        crawl_site: 'Need to analyze entire website structure, all pages, or site-wide content',
        synthesize_report: 'You have gathered research and need to produce a final deliverable report.',
        extract_url: 'A specific URL is provided in the goal OR you have a URL from previous search results',
        llm_call: 'Need to write text, summarize information, translate, or perform general analysis',
        send_email: 'Goal requires sending an email report. You must have a synthesized artifact ID (e.g., "art_123...")',
        declare_artifact: 'After synthesize_report returns an ID. Do NOT pass full text content here.',
        web_search: 'Need quick facts, recent news, or general information lookup',
        api_call: 'Need to fetch data from or send data to a specific API endpoint',
        send_slack: 'Goal explicitly requires sending a Slack message or notification',
        javascript: 'Need to process, transform, filter, or manipulate data programmatically',
        calculate: 'Need to perform math calculations',
        read_context: 'Need to access variables or data from previous workflow nodes',
        store_memory: 'Need to save intermediate results for later steps',
        append_to_sheet: 'Need to save data to a Google Sheet.'
    };
    return whenToUse[t] || '';
}

function getToolWhenNotToUse(t) {
    const whenNotToUse = {
        deep_research: 'Goal only needs a quick fact, a single URL is provided, or budget is limited',
        crawl_site: 'Only need content from a single page (use extract_url) or need quick facts (use web_search)',
        synthesize_report: 'You are just answering a simple question or need an intermediate thought.',
        extract_url: 'No URL is available (use web_search first) OR need site-wide analysis (use crawl_site)',
        llm_call: 'Goal is math (use calculate) or research (use web_search/deep_research)',
        send_email: 'Need to just create content (use synthesize_report) or no saved artifact exists',
        declare_artifact: 'You do not have an artifact ID yet.',
        web_search: 'A specific URL is already provided (use extract_url) OR comprehensive research needed (use deep_research)',
        api_call: 'Need general web search (use web_search) OR need webpage content (use extract_url)',
        send_slack: 'Goal only asks to gather information without sending',
        javascript: 'Need to fetch external data (use api_call) OR simple math (use calculate)',
        calculate: 'Need complex data processing (use javascript)',
        read_context: 'Need external data (use api_call or web_search)',
        store_memory: 'Data is already available in context',
        append_to_sheet: 'Need to read from sheet (not yet supported in agent)'
    };
    return whenNotToUse[t] || '';
}

function getToolInputSchema(t) {
    const schemas = {
        deep_research: { topic: 'string', max_results: 'number (optional, default 10)' },
        crawl_site: { url: 'string', max_pages: 'number (optional, default 10)' },
        synthesize_report: { topic: 'string', research_data: 'string (concatenated research observations)', requirements: 'string (specific user instructions for tone, length, etc)' },
        extract_url: { url: 'string' },
        llm_call: { prompt: 'string', system: 'string (optional system instructions)', provider: 'string (optional, gemini/openai)', model: 'string (optional)' },
        send_email: { to: 'string (email address)', subject: 'string', artifact_id: 'string (the ID returned by synthesize_report, e.g., "art_54321")' },
        declare_artifact: { artifact_name: 'string (e.g., "final_report")', artifact_id: 'string (the ID returned by synthesize_report, e.g., "art_12345")' },
        web_search: { query: 'string' },
        api_call: { url: 'string', method: 'string (GET/POST)', headers: 'object (optional)', body: 'string (optional JSON)' },
        send_slack: { channel: 'string', message: 'string' },
        javascript: { code: 'string' },
        calculate: { expression: 'string (e.g., "2 + 2 * 3")' },
        read_context: { key: 'string (variable name or path like "nodeId.property")' },
        store_memory: { key: 'string', value: 'any' },
        append_to_sheet: { sheetId: 'string', values: 'array of values for the row' }
    };
    return schemas[t] || {};
}

async function runAgentTool(toolName, input, memory, secrets, supabase, userId, flowId, runId) {
    const siteUrl = getSiteUrl();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || secrets['SUPABASE_SERVICE_ROLE_KEY'] || '';
    
    switch (toolName.toLowerCase()) {
        case 'read_context': {
            try {
                const key = input.key;
                if (memory[key] !== undefined) {
                    return { output: memory[key] };
                }
                const parts = key.split('.');
                let current = memory;
                for (const part of parts) {
                    if (current === undefined || current === null) break;
                    current = current[part];
                }
                return { output: current !== undefined ? current : `[NOT FOUND] Key "${key}" not in context` };
            } catch (e) {
                return { output: `[ERROR] Context read error: ${e.message}` };
            }
        }
        case 'store_memory': {
            try {
                memory[input.key] = input.value;
                return { output: `Stored "${input.key}" in memory` };
            } catch (e) {
                return { output: `[ERROR] Store failed: ${e.message}` };
            }
        }
        case 'declare_artifact': {
            try {
                const name = input.artifact_name || input.name;
                // Accept common aliases the model may invent (content/id/handle)
                const id = input.artifact_id || input.content || input.id || input.handle;

                if (!id) {
                    return { output: `[ERROR] declare_artifact requires artifact_id (the ID returned by synthesize_report).` };
                }

                if (!memory.artifactStore?.[id]) {
                    return { output: `[ERROR] Artifact ID "${id}" does not exist. Run synthesize_report first.` };
                }

                memory._artifacts = memory._artifacts || {};
                memory._artifacts[name] = { type: 'reference', id: id };
                memory._primaryArtifact = name;

                return { output: `✓ Primary artifact "${name}" is now bound to ID "${id}". You can now proceed to delivery.` };
            } catch (e) {
                return { output: `[ERROR] Declaration failed: ${e.message}` };
            }
        }
        case 'calculate': {
            try {
                const expr = input.expression;
                const SAFE_PATTERN = /^[\d\s+\-*/().%^]+$|^Math\.\w+\([^)]*\)$/;
                const JS_KEYWORDS = ['constructor', 'prototype', '__proto__', 'eval', 'Function', 'window', 'document', 'global', 'this', 'self'];

                let resolved = expr;
                if (!SAFE_PATTERN.test(expr)) {
                    const varPattern = /\b([a-zA-Z_]\w*)\b/g;
                    let match;
                    while ((match = varPattern.exec(expr)) !== null) {
                        const varName = match[1];
                        if (JS_KEYWORDS.includes(varName)) {
                            return { output: `[ERROR] Invalid variable name: ${varName}` };
                        }
                    }

                    resolved = expr.replace(/\b([a-zA-Z_]\w*)\b/g, (m) => {
                        if (['Math', 'PI', 'E', 'abs', 'ceil', 'floor', 'round', 'sqrt', 'pow'].includes(m)) return m;
                        const val = memory[m];
                        if (val === undefined) return m;
                        const num = Number(val);
                        return isNaN(num) ? '0' : String(num);
                    });
                }

                if (!SAFE_PATTERN.test(resolved)) {
                    return { output: '[ERROR] Invalid expression - only math operations allowed' };
                }

                const result = Function(`"use strict"; return (${resolved})`)();
                return { output: result };
            } catch (e) {
                return { output: `[ERROR] Calculation error: ${e.message}` };
            }
        }
        case 'synthesize_report': {
            const MAX_RETRIES = 3;
            let lastError = '';

            const systemPrompt = `You are a synthesis engine. 
OUTPUT FORMAT: JSON ONLY. Minimize whitespace.
SCHEMA:
{
  "title": "string",
  "summary": "string (executive summary)",
  "sections": [{ "heading": "string", "content": "string (markdown allowed)" }],
  "sources": [{ "title": "string", "url": "string" }],
  "metadata": { "wordCount": number, "generatedAt": "ISO date" }
}
Produce a comprehensive report based on the provided research.`;

            let currentPrompt = `TOPIC: ${input.topic}
REQUIREMENTS: ${input.requirements}
RESEARCH DATA:
${input.research_data}

Generate the JSON report now.`;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    if (attempt > 1) {
                        currentPrompt += `\n\nPREVIOUS ERROR: ${lastError}. \nYou MUST fix this schema error and return valid JSON.`;
                    }

                    const llmResult = await callLlmDirectly({
                        provider: 'gemini',
                        model: 'gemini-3.1-flash-lite-preview',
                        prompt: currentPrompt,
                        system: systemPrompt,
                        temperature: 0.3,
                        maxTokens: 4096,
                        secrets
                    });

                    const jsonStr = llmResult.text.replace(/```json\n?|\n?```/g, '').trim();
                    let parsed;
                    try {
                        parsed = JSON.parse(jsonStr);
                    } catch (e) {
                        try {
                            parsed = JSON.parse(repairJSON(jsonStr));
                        } catch (e2) {
                            throw new Error("Failed to parse JSON output even after repair");
                        }
                    }

                    const validError = validateReport(parsed);
                    if (validError) throw new Error(`Schema Validation Failed: ${validError}`);

                    // Ensure metadata is complete for downstream delivery tools
                    const wordCount = typeof parsed.metadata?.wordCount === 'number'
                        ? parsed.metadata.wordCount
                        : String(parsed.summary || '').split(/\s+/).filter(Boolean).length
                            + (parsed.sections || []).reduce((n, s) => n + String(s.content || '').split(/\s+/).filter(Boolean).length, 0);
                    parsed.metadata = {
                        wordCount,
                        generatedAt: parsed.metadata?.generatedAt || new Date().toISOString()
                    };

                    const artifactId = `art_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    memory.artifactStore = memory.artifactStore || {};
                    memory.artifactStore[artifactId] = parsed;

                    return {
                        output: `SUCCESS. Report generated and saved.
ID: ${artifactId}
Title: ${parsed.title}
Word Count: ${parsed.metadata?.wordCount ?? 'N/A'}
Sources: ${parsed.sources.length}

NEXT STEP: Use 'declare_artifact' with artifact_name="final_report" and artifact_id="${artifactId}" (the ID, not the text).`
                    };
                } catch (e) {
                    lastError = e.message;
                }
            }

            return { output: `[ERROR] Failed to synthesize report after ${MAX_RETRIES} attempts. Last error: ${lastError}.` };
        }
        case 'send_email': {
            try {
                const artifactId = input.artifact_id;
                const artifact = memory.artifactStore?.[artifactId];

                if (!artifact) {
                    return { output: `[ERROR] Artifact ID "${artifactId}" not found in durable store. run synthesize_report first.` };
                }

                let htmlBody = `<h1>${artifact.title}</h1>`;
                htmlBody += `<p><em>${artifact.summary}</em></p><hr/>`;

                if (Array.isArray(artifact.sections)) {
                    htmlBody += artifact.sections.map(s => `<h2>${s.heading}</h2><div>${s.content}</div>`).join('');
                }

                if (Array.isArray(artifact.sources) && artifact.sources.length > 0) {
                    htmlBody += `<hr/><h3>Sources</h3><ul>${artifact.sources.map(s => `<li><a href="${s.url}">${s.title}</a></li>`).join('')}</ul>`;
                }

                htmlBody += `<br/><br/><small>Generated by Agent • Word Count: ${artifact.metadata?.wordCount || 'N/A'}</small>`;

                const toolResult = await executeNode({
                    type: 'email',
                    data: {
                        type: 'email',
                        emailProvider: 'smtp',
                        emailTo: input.to,
                        emailSubject: input.subject || artifact.title,
                        content: htmlBody
                    }
                }, memory, secrets, supabase, userId, flowId, runId);

                if (toolResult.error) {
                    return { output: `[ERROR] Email failed: ${toolResult.error}` };
                }

                return { output: `Email sent to ${input.to} with Report "${artifact.title}" (ID: ${artifactId})` };
            } catch (e) {
                return { output: `[ERROR] Email failed: ${e.message}` };
            }
        }
        case 'send_slack': {
            try {
                const accessToken = secrets['SLACK_ACCESS_TOKEN'];
                if (accessToken) {
                    const res = await fetch(`${siteUrl}/api/slack-api`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
                        body: JSON.stringify({
                            endpoint: 'chat.postMessage',
                            token: accessToken,
                            body: { channel: input.channel, text: input.message }
                        })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (data.ok) {
                        return { output: `Slack message sent to ${input.channel}` };
                    }
                }
                const hook = secrets['SLACK_WEBHOOK'];
                if (!hook) {
                    return { output: '[ERROR] Slack not configured. Add SLACK_WEBHOOK or connect Slack in Settings.' };
                }
                const res = await fetch(hook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: input.message, channel: input.channel })
                });
                if (!res.ok) throw new Error(await res.text());
                return { output: `Slack message sent to ${input.channel}` };
            } catch (e) {
                return { output: `[ERROR] Slack failed: ${e.message}` };
            }
        }
        case 'javascript': {
            try {
                const res = await fetch(`${siteUrl}/api/custom-node-executor`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${serviceKey}`
                    },
                    body: JSON.stringify({
                        node: {
                            id: 'agent-js-tool',
                            type: 'agent_js_tool',
                            data: {
                                type: 'agent_js_tool',
                                customExecutionType: 'plugin_js',
                                customExecutionConfig: {
                                    code: input.code,
                                    timeoutMs: 5000,
                                    capabilities: ['json', 'crypto', 'log']
                                },
                                customCreditCost: 1
                            }
                        },
                        context: memory
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) return { output: `[ERROR] Sandbox execution failed: ${data.error || res.statusText}` };
                return { output: data.output };
            } catch (e) {
                return { output: `[ERROR] JavaScript execution failed: ${e.message}` };
            }
        }
        case 'web_search': {
            const result = await executeNode({
                type: 'web_search',
                data: {
                    type: 'web_search',
                    webQuery: input.query,
                    content: input.query
                }
            }, memory, secrets, supabase, userId, flowId, runId);
            return { output: result.output || `[ERROR] ${result.error}` };
        }
        case 'deep_research': {
            const result = await executeNode({
                type: 'deep_research',
                data: {
                    type: 'deep_research',
                    researchTopic: input.topic,
                    content: input.topic,
                    maxResults: input.max_results
                }
            }, memory, secrets, supabase, userId, flowId, runId);
            return { output: typeof result.output === 'object' ? JSON.stringify(result.output, null, 2) : (result.output || `[ERROR] ${result.error}`) };
        }
        case 'extract_url': {
            const result = await executeNode({
                type: 'extract_url',
                data: {
                    type: 'extract_url',
                    extractUrl: input.url,
                    content: input.url
                }
            }, memory, secrets, supabase, userId, flowId, runId);
            return { output: typeof result.output === 'object' ? JSON.stringify(result.output, null, 2) : (result.output || `[ERROR] ${result.error}`) };
        }
        case 'crawl_site': {
            const result = await executeNode({
                type: 'crawl_site',
                data: {
                    type: 'crawl_site',
                    crawlUrl: input.url,
                    content: input.url,
                    maxPages: input.max_pages
                }
            }, memory, secrets, supabase, userId, flowId, runId);
            return { output: typeof result.output === 'object' ? JSON.stringify(result.output, null, 2) : (result.output || `[ERROR] ${result.error}`) };
        }
        case 'llm_call': {
            const result = await executeNode({
                type: 'llm',
                data: {
                    type: 'llm',
                    provider: input.provider || 'gemini',
                    model: input.model || 'gemini-3.1-flash-lite-preview',
                    content: input.prompt,
                    systemInstruction: input.system,
                    temperature: input.temperature || 0.4,
                    maxTokens: input.max_tokens || 1024
                }
            }, memory, secrets, supabase, userId, flowId, runId);
            return { output: result.output || `[ERROR] ${result.error}` };
        }
        case 'api_call': {
            const result = await executeNode({
                type: 'api_call',
                data: {
                    type: 'api_call',
                    url: input.url,
                    method: input.method || 'GET',
                    body: input.body,
                    headers: input.headers
                }
            }, memory, secrets, supabase, userId, flowId, runId);
            return { output: result.output || `[ERROR] ${result.error}` };
        }
        case 'append_to_sheet': {
            const result = await executeNode({
                type: 'sheets',
                data: {
                    type: 'sheets',
                    sheetId: input.sheetId,
                    sheetOperation: 'append',
                    content: JSON.stringify(input.values)
                }
            }, memory, secrets, supabase, userId, flowId, runId);
            return { output: result.output || `[ERROR] ${result.error}` };
        }
        default: {
            if (toolName.toLowerCase().startsWith('mcp_')) {
                const servers = memory._mcpServers || [];
                let matchedServer = null;
                let matchedToolName = null;
                
                const clean = (s) => s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
                
                for (const srv of servers) {
                    for (const t of srv.tools || []) {
                        const exactName = `mcp_${clean(srv.label || 'server')}_${clean(t.name)}`.substring(0, 60);
                        if (exactName.toLowerCase() === toolName.toLowerCase()) {
                            matchedServer = srv;
                            matchedToolName = t.name;
                            break;
                        }
                    }
                    if (matchedServer) break;
                }
                
                if (matchedServer && matchedToolName) {
                    const result = await executeNode({
                        type: 'mcp',
                        data: {
                            type: 'mcp',
                            url: matchedServer.url,
                            mcpSelectedTool: matchedToolName,
                            mcpInputValues: input,
                            mcpAuthType: matchedServer.authType || 'none',
                            mcpAuthSecret: matchedServer.authSecret
                        }
                    }, memory, secrets, supabase, userId, flowId, runId);
                    return { output: result.output || `[ERROR] ${result.error}` };
                }
            }
            return { output: `[ERROR] Unknown or unsupported tool: ${toolName}` };
        }
    }
}

app.post('/execute', authenticateService, async (req, res) => {
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
        }
        const supabase = getSupabaseClient(supabaseUrl, supabaseKey);

        const body = req.body || {};
        const { type, flowId, payload, queueId, mode } = body;
        const executionMode = mode || 'production';
        const runId = body.runId || crypto.randomUUID();

        let result;

        if (type === 'webhook') {
            result = await processWebhooks(supabase);
        } else if (type === 'scheduled' && flowId) {
            console.log(`[CloudRun] Scheduled execution for flow: ${flowId}`);

            const { data: flow } = await supabase
                .from('flows')
                .select('*')
                .eq('id', flowId)
                .single();

            if (!flow) {
                await supabase.rpc('update_schedule_run', {
                    p_flow_id: flowId,
                    p_success: false,
                    p_error: 'Flow not found'
                });
                throw new Error('Flow not found');
            }

            const nodes = flow.content?.nodes || [];
            const edges = flow.content?.edges || [];
            const scheduleNode = nodes.find(n => (n.data?.type || n.type) === 'schedule');
            const varName = scheduleNode?.data?.variableName || 'schedule';

            const { _schedule, ...otherPayload } = payload || {};
            const initialContext = {
                [varName]: _schedule || {},
                _schedule: {
                    cron: _schedule?.cron || scheduleNode?.data?.cronExpression || '',
                    triggered_at: _schedule?.triggered_at || new Date().toISOString(),
                    flow_id: flowId,
                    flow_name: flow.name,
                },
                ...otherPayload,
            };

            const runnerUserId = body.userId || flow.user_id;

            result = await executeWorkflow(flowId, nodes, edges, initialContext, runnerUserId, supabase, 'Schedule', runId, undefined, executionMode);

            await supabase.rpc('update_schedule_run', {
                p_flow_id: flowId,
                p_success: result.success,
                p_error: result.success ? null : (result.logs?.find(l => l.error)?.error || 'Unknown error')
            });

            console.log(`[CloudRun] Scheduled execution completed: ${result.success ? 'success' : 'failed'}`);
        } else if (type === 'direct' && (flowId || (body.nodes && body.edges))) {
            let nodes = body.nodes;
            let edges = body.edges;
            let runnerUserId = body.userId || req.userId;

            // Load from DB only when nodes/edges/user are missing and we have a flowId
            if ((!nodes || !edges || !runnerUserId) && flowId) {
                const { data: flow } = await supabase
                    .from('flows')
                    .select('*')
                    .eq('id', flowId)
                    .single();

                if (!flow) {
                    throw new Error('Flow not found');
                }
                nodes = nodes || flow.content?.nodes || [];
                edges = edges || flow.content?.edges || [];
                runnerUserId = runnerUserId || flow.user_id;
            }

            if (!nodes || !edges) {
                throw new Error('Direct execution requires nodes and edges (or a valid flowId)');
            }

            const webhookNode = nodes.find(n => (n.data?.type || n.type) === 'webhook');
            const varName = webhookNode?.data?.variableName || 'payload';

            const { _webhook, ...userPayload } = payload || {};
            const initialContext = {
                [varName]: userPayload,
                ...userPayload,
                _webhook: _webhook || {},
            };

            const triggerSource = body.triggerSource || 'Direct';

            result = await executeWorkflow(flowId, nodes, edges, initialContext, runnerUserId, supabase, triggerSource, runId, undefined, executionMode);

            if (queueId) {
                await supabase
                    .from('webhook_queue')
                    .update({
                        status: result.success ? 'completed' : 'failed',
                        processed_at: new Date().toISOString(),
                    })
                    .eq('id', queueId);
            }
        } else {
            result = await processWebhooks(supabase);
        }

        res.status(200).json(result);
    } catch (e) {
        console.error('[CloudRun] Execute Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/resume', authenticateService, async (req, res) => {
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
        }
        const supabase = getSupabaseClient(supabaseUrl, supabaseKey);

        const body = req.body || {};
        const token = body.token || req.query.token;
        const action = body.action || req.query.action || 'approve';
        const executionMode = body.mode || 'production';

        if (!token) {
            return res.status(400).json({ error: 'Missing resume token.' });
        }

        const { data: pausedRun } = await supabase
            .from('paused_executions')
            .select('*')
            .eq('resume_token', token)
            .in('status', ['paused', 'resumed'])
            .single();
            
        if (!pausedRun) {
            return res.status(400).json({ error: 'Invalid or expired resume token' });
        }

        // Match the confirmation endpoint and product contract: approval
        // links remain valid for seven days unless they are used first.
        const ageMs = Date.now() - new Date(pausedRun.created_at).getTime();
        const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        if (ageMs > maxAgeMs) {
            await supabase
                .from('paused_executions')
                .update({ status: 'expired' })
                .eq('id', pausedRun.id);
            return res.status(400).json({ error: 'This resume link has expired (7-day validity limit reached).' });
        }
        
        const { data: flow } = await supabase
            .from('flows')
            .select('*')
            .eq('id', pausedRun.flow_id)
            .single();
            
        if (!flow) {
            return res.status(404).json({ error: 'Flow not found' });
        }
        
        await supabase
            .from('paused_executions')
            .update({ status: 'resumed', resumed_at: new Date().toISOString() })
            .eq('id', pausedRun.id);
            
        const nodes = flow.content?.nodes || [];
        const edges = flow.content?.edges || [];
        const pausedNode = nodes.find(n => n.id === pausedRun.node_id);
        const varName = pausedNode?.data?.variableName || pausedRun.node_id;
        
        const context = pausedRun.context_snapshot || {};
        context[pausedRun.node_id] = { approved: action === 'approve', action };
        if (varName !== pausedRun.node_id) {
            context[varName] = context[pausedRun.node_id];
        }
        
        const outEdges = edges.filter(e => e.source === pausedRun.node_id);
        const startNodeIds = outEdges.map(e => e.target);
        
        const result = await executeWorkflow(flow.id, nodes, edges, context, flow.user_id, supabase, 'Resume', pausedRun.run_id, startNodeIds, executionMode);
        res.status(200).json(result);
    } catch (e) {
        console.error('[CloudRun] Resume Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Blupe Workflow Runner listening on port ${port}`);
});
