/**
 * MCP (Model Context Protocol) Proxy Function
 * 
 * Proxies JSON-RPC requests to external MCP servers, handling:
 * - CORS bypass (browser cannot directly call MCP servers)
 * - Authentication (API Key, Bearer Token, Custom Headers)
 * - Protocol validation (JSON-RPC 2.0)
 * - Full HTTP/SSE Transport handshake and message stream routing
 * - Direct POST fallback for custom simple JSON-RPC servers
 * - Proper stream termination on timeout or client errors
 */

// Helper to parse SSE stream chunk-by-chunk and call onEvent
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
            // Fallback for environments where body is directly an AsyncIterable
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

import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import dns from 'node:dns';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from './utils/auth.js';
import { getCorsHeaders } from './utils/cors.js';
import { enforceBilling } from './utils/billing.js';

/** Block SSRF to private/link-local/metadata/internal addresses with DNS resolution check */
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
    
    // 1. Block known unsafe hostnames statically
    if (
        host === 'localhost' ||
        host === 'metadata.google.internal' ||
        host.endsWith('.local') ||
        host === '0.0.0.0'
    ) {
        throw new Error(`Blocked host: ${host}`);
    }

    // 2. Helper to check if an IP address is private/internal
    const isPrivateIp = (ip) => {
        // IPv4 private/link-local/loopback checks
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
        // IPv6 private/link-local/loopback/ULA checks
        if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80') || ip === '::') {
            return true;
        }
        return false;
    };

    // If the host is already an IP, check it directly
    if (isPrivateIp(host)) {
        throw new Error(`Blocked private IP: ${host}`);
    }

    // 3. Resolve host via DNS to prevent DNS rebinding/pinning bypasses
    try {
        const lookup = await dns.promises.lookup(host, { all: true });
        for (const entry of lookup) {
            if (isPrivateIp(entry.address)) {
                throw new Error(`Blocked private IP resolution: ${entry.address} for host ${host}`);
            }
        }
    } catch (dnsErr) {
        if (dnsErr.message && dnsErr.message.includes('Blocked')) {
            throw dnsErr;
        }
        // Let natural connection errors handle unreachable hosts
    }

    return u.toString();
}


// Actionable messages for runtimes that are not installed on the host (ENOENT)
const RUNTIME_INSTALL_HINTS = {
    uvx: 'The "uvx" runtime (part of the uv Python toolchain) is not installed on the machine running this server. Install it with "brew install uv" (macOS) or see https://docs.astral.sh/uv/getting-started/installation/, then try again.',
    uv: 'The "uv" Python toolchain is not installed on the machine running this server. Install it with "brew install uv" (macOS) or see https://docs.astral.sh/uv/getting-started/installation/, then try again.',
    npx: 'The "npx" runtime was not found. Install Node.js (https://nodejs.org) on the machine running this server, then try again.',
    node: 'The "node" runtime was not found. Install Node.js (https://nodejs.org) on the machine running this server, then try again.',
    docker: 'The "docker" CLI was not found. Install Docker Desktop (https://www.docker.com/products/docker-desktop/) on the machine running this server, then try again.',
    python: 'The "python" runtime was not found. Install Python (https://www.python.org) on the machine running this server, then try again.',
    python3: 'The "python3" runtime was not found. Install Python (https://www.python.org) on the machine running this server, then try again.'
};

// Commands the proxy will spawn. Restricting to known MCP runtimes (rather than
// arbitrary executables) prevents authenticated users from running e.g. `sh -c ...`
// on the host through this endpoint.
const ALLOWED_STDIO_COMMANDS = new Set([
    'npx', 'node', 'bun', 'deno',
    'uvx', 'uv', 'python', 'python3', 'pipx',
    'docker'
]);

// The child gets a minimal environment: PATH/HOME/TMPDIR so runtimes can find
// their caches, plus the user-supplied env vars. Never inherit the full
// process.env — it contains the platform's own secrets (Supabase service key etc.).
function buildSpawnEnv(extraEnv) {
    const cleanEnv = {};
    if (extraEnv && typeof extraEnv === 'object' && !Array.isArray(extraEnv)) {
        for (const [key, value] of Object.entries(extraEnv)) {
            if (value !== undefined && value !== null) {
                cleanEnv[key] = String(value);
            }
        }
    }
    // Spawned from a dev server the PATH can be minimal (e.g. GUI-launched apps),
    // so append the common install locations for npx/uvx/docker.
    const extraPaths = [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        path.join(os.homedir(), '.local', 'bin')
    ];
    const pathParts = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const p of extraPaths) {
        if (!pathParts.includes(p)) pathParts.push(p);
    }
    const baseEnv = {};
    for (const key of ['HOME', 'TMPDIR', 'USER', 'LANG', 'SHELL']) {
        if (process.env[key]) baseEnv[key] = process.env[key];
    }
    return { ...baseEnv, ...cleanEnv, PATH: pathParts.join(path.delimiter) };
}

/**
 * Executes a single JSON-RPC request against a local stdio MCP server.
 *
 * Performs the full MCP handshake required by spec-compliant servers:
 *   1. `initialize` request
 *   2. `notifications/initialized` notification
 *   3. the actual request (e.g. `tools/list`)
 * stdin stays open until the matching response arrives (stdio servers exit
 * when stdin closes). Non-JSON stdout lines (server logs) are skipped.
 */
export function executeStdioMcp(command, args = [], env = {}, jsonRpcRequest, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
        const isLocalDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV === 'development' || !process.env.NETLIFY;
        if (!isLocalDev) {
            const err = new Error('Stdio transport is restricted to local development environment.');
            err.statusCode = 403;
            reject(err);
            return;
        }

        if (!ALLOWED_STDIO_COMMANDS.has(command)) {
            const err = new Error(
                `Command "${command}" is not an allowed MCP runtime. Supported commands: ${[...ALLOWED_STDIO_COMMANDS].join(', ')}.`
            );
            err.statusCode = 400;
            reject(err);
            return;
        }
        let settled = false;
        let stderrData = '';
        let stdoutBuffer = '';
        const pendingResponses = new Map(); // request id -> resolver

        const child = spawn(command, args, { env: buildSpawnEnv(env) });

        const finish = (settle, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            try { child.kill(); } catch (e) {}
            settle(value);
        };

        const timeout = setTimeout(() => {
            finish(reject, new Error(
                `MCP process timed out after ${timeoutMs}ms.` +
                (stderrData.trim() ? ` Stderr: ${stderrData.trim().slice(0, 500)}` : '')
            ));
        }, timeoutMs);

        child.on('error', (err) => {
            if (err.code === 'ENOENT') {
                const friendly = new Error(
                    RUNTIME_INSTALL_HINTS[command] ||
                    `The command "${command}" was not found on the machine running this server. Install it or use a server based on an available runtime (npx, node, docker).`
                );
                friendly.statusCode = 400;
                finish(reject, friendly);
            } else {
                finish(reject, new Error(`Failed to start MCP process: ${err.message}`));
            }
        });

        child.on('close', (code) => {
            finish(reject, new Error(
                `MCP process exited (code ${code}) before responding.` +
                (stderrData.trim() ? ` Stderr: ${stderrData.trim().slice(0, 500)}` : '')
            ));
        });

        // Swallow EPIPE etc. when the process dies mid-write; 'error'/'close' handle it
        child.stdin.on('error', () => {});
        child.stderr.on('data', (data) => { stderrData += data.toString(); });

        child.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            let newlineIdx;
            while ((newlineIdx = stdoutBuffer.indexOf('\n')) >= 0) {
                const line = stdoutBuffer.slice(0, newlineIdx).trim();
                stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
                if (!line) continue;
                let message;
                try { message = JSON.parse(line); } catch (e) { continue; } // skip log noise
                const resolveResponse = pendingResponses.get(message.id);
                if (resolveResponse) {
                    pendingResponses.delete(message.id);
                    resolveResponse(message);
                }
            }
        });

        const send = (message) => {
            if (child.stdin.writable) {
                child.stdin.write(JSON.stringify(message) + '\n');
            }
        };
        const request = (message) => new Promise((resolveResponse) => {
            pendingResponses.set(message.id, resolveResponse);
            send(message);
        });

        (async () => {
            try {
                if (jsonRpcRequest.method !== 'initialize') {
                    const initResponse = await request({
                        jsonrpc: '2.0',
                        id: `init_${jsonRpcRequest.id}`,
                        method: 'initialize',
                        params: {
                            protocolVersion: '2025-06-18',
                            capabilities: {},
                            clientInfo: { name: 'bloope-mcp-proxy', version: '1.0.0' }
                        }
                    });
                    if (initResponse.error) {
                        finish(reject, new Error(`MCP initialize failed: ${initResponse.error.message || JSON.stringify(initResponse.error)}`));
                        return;
                    }
                    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
                }
                const response = await request(jsonRpcRequest);
                finish(resolve, response);
            } catch (err) {
                finish(reject, err);
            }
        })();
    });
}


const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export async function handler(event) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
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
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Enforce authentication
    const authResult = await requireUser(event);
    if (authResult.error) {
        return {
            statusCode: authResult.status || 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ error: authResult.error })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { serverUrl, transportType, command, args, env, method, params, id, auth } = body;

        // Rate limiting check
        if (authResult.user && authResult.user.id !== 'service_role') {
            const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
                p_user_id: authResult.user.id,
                p_endpoint: 'mcp-proxy',
                p_max_requests: 100,
                p_window_minutes: 60
            });
            if (rateLimitError) {
                console.error('[RateLimit] Error checking rate limit in MCP proxy:', rateLimitError);
            } else if (!allowed) {
                return {
                    statusCode: 429,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
                };
            }
        }

        // Credit deduction check
        const billingResult = await enforceBilling(authResult, 'mcp-proxy', body);
        if (!billingResult.allowed) {
            return {
                statusCode: billingResult.statusCode || 402,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: billingResult.error })
            };
        }

        // Validate required fields
        if (transportType === 'stdio') {
            const isLocalDev = process.env.NETLIFY_DEV === 'true' || process.env.NODE_ENV === 'development' || !process.env.NETLIFY;
            if (!isLocalDev) {
                return {
                    statusCode: 403,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify({ error: 'Stdio transport is restricted to local development environment.' })
                };
            }

            if (!command) {
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify({ error: 'command is required for stdio transport' })
                };
            }
        } else {
            if (!serverUrl) {
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify({ error: 'serverUrl is required' })
                };
            }
            try {
                await validateMcpUrl(serverUrl);
            } catch (err) {
                console.error(`[MCP Proxy] SSRF Blocked for URL ${serverUrl}: ${err.message}`);
                return {
                    statusCode: 400,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify({ error: `Blocked URL: ${err.message}` })
                };
            }
        }

        if (!method) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: 'method is required (tools/list or tools/call)' })
            };
        }

        // Validate method is allowed
        const allowedMethods = ['tools/list', 'tools/call', 'initialize'];
        if (!allowedMethods.includes(method)) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ error: `Invalid method. Allowed: ${allowedMethods.join(', ')}` })
            };
        }

        // Build standard JSON-RPC 2.0 request
        const requestId = id || Date.now();
        const jsonRpcRequest = {
            jsonrpc: '2.0',
            id: requestId,
            method: method,
            params: params || {}
        };

        // Handle stdio transport
        if (transportType === 'stdio') {
            console.log(`[MCP Proxy] Executing local stdio MCP command: ${command} ${args ? args.join(' ') : ''}`);
            try {
                const response = await executeStdioMcp(command, args, env, jsonRpcRequest);
                if (response.error) {
                    console.error('[MCP Proxy] JSON-RPC error from stdio process:', response.error);
                    return {
                        statusCode: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders },
                        body: JSON.stringify({
                            error: response.error.message || 'MCP server error',
                            code: response.error.code,
                            details: response.error.data
                        })
                    };
                }
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify(response)
                };
            } catch (err) {
                console.error('[MCP Proxy] Stdio execution failed:', err);
                return {
                    statusCode: err.statusCode || 500,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify({
                        error: err.message || 'Stdio MCP execution error'
                    })
                };
            }
        }

        // Build base headers for external MCP server requests
        const headers = {
            'Accept': 'text/event-stream, application/json',
            'MCP-Protocol-Version': '2025-06-18'
        };

        // Add authentication headers based on auth type
        if (auth) {
            switch (auth.type) {
                case 'api_key':
                    let apiHeader = auth.headerName;
                    if (!apiHeader) {
                        if (serverUrl.includes('sarvam.ai')) {
                            apiHeader = 'api-subscription-key';
                        } else {
                            apiHeader = 'X-API-Key';
                        }
                    }
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

        console.log(`[MCP Proxy] Checking SSE transport on ${serverUrl}`);

        let sseResponse = null;
        let sseError = null;
        let resolvedSseUrl = serverUrl;

        // 1. Attempt standard SSE GET request to establish connection
        try {
            sseResponse = await fetch(resolvedSseUrl, {
                method: 'GET',
                headers
            });

            const initialContentType = sseResponse.headers.get('content-type') || '';
            const isHtml = initialContentType.includes('text/html');

            // Fallback for servers that host the SSE stream on /sse (e.g. mcp.sarvam.ai)
            if ((!sseResponse.ok || sseResponse.status === 405 || sseResponse.status === 404 || isHtml) && !resolvedSseUrl.endsWith('/sse')) {
                const fallbackUrl = resolvedSseUrl.endsWith('/') ? `${resolvedSseUrl}sse` : `${resolvedSseUrl}/sse`;
                console.log(`[MCP Proxy] Primary SSE GET failed/returned HTML (status: ${sseResponse.status}, type: ${initialContentType}). Trying fallback: ${fallbackUrl}`);
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
            sseError = err.message;
            console.warn(`[MCP Proxy] SSE GET request failed: ${sseError}.`);
            if (!resolvedSseUrl.endsWith('/sse')) {
                const fallbackUrl = resolvedSseUrl.endsWith('/') ? `${resolvedSseUrl}sse` : `${resolvedSseUrl}/sse`;
                try {
                    console.log(`[MCP Proxy] Trying fallback: ${fallbackUrl}`);
                    const fallbackResponse = await fetch(fallbackUrl, {
                        method: 'GET',
                        headers
                    });
                    if (fallbackResponse.ok) {
                        sseResponse = fallbackResponse;
                        resolvedSseUrl = fallbackUrl;
                    }
                } catch (fallbackErr) {
                    console.warn(`[MCP Proxy] Fallback SSE GET failed: ${fallbackErr.message}`);
                }
            }
        }

        const contentType = sseResponse?.headers.get('content-type') || '';

        if (sseResponse && contentType.includes('text/html')) {
            console.warn(`[MCP Proxy] SSE connection returned HTML instead of text/event-stream.`);
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({
                    error: 'MCP server returned HTML instead of SSE (text/event-stream). Ensure the URL is a valid MCP endpoint, not a landing page or website.'
                })
            };
        }

        if (sseResponse && sseResponse.ok && contentType.includes('text/event-stream')) {
            console.log(`[MCP Proxy] SSE stream opened. Waiting for endpoint event to POST request...`);

            let postUrl = '';
            let jsonRpcResponse = null;
            let postError = null;

            try {
                await readSseStream(sseResponse, async (eventType, eventData) => {
                    if (eventType === 'endpoint') {
                        // Resolve the post endpoint relative to resolvedSseUrl
                        postUrl = new URL(eventData, resolvedSseUrl).toString();
                        console.log(`[MCP Proxy] Resolved SSE POST endpoint: ${postUrl}`);

                        try {
                            await validateMcpUrl(postUrl);
                        } catch (err) {
                            console.error(`[MCP Proxy] SSRF Blocked postUrl: ${err.message}`);
                            postError = err;
                            if (sseResponse.body.getReader) {
                                try {
                                    const r = sseResponse.body.getReader();
                                    await r.cancel();
                                } catch (e) {}
                            } else if (typeof sseResponse.body.destroy === 'function') {
                                try { sseResponse.body.destroy(); } catch (e) {}
                            }
                            return true; // Stop reading stream
                        }

                        // POST the JSON-RPC request to the message endpoint
                        const postHeaders = {
                            'Content-Type': 'application/json',
                            ...headers
                        };
                        delete postHeaders['Accept']; // POST does not stream back text/event-stream directly

                        fetch(postUrl, {
                            method: 'POST',
                            headers: postHeaders,
                            body: JSON.stringify(jsonRpcRequest)
                        }).then(async (res) => {
                            if (!res.ok) {
                                const errBody = await res.text();
                                console.error(`[MCP Proxy] POST error response: ${res.status} - ${errBody}`);
                                postError = new Error(`POST failed: ${res.status} - ${errBody}`);
                                // Immediately trigger stream cancellation
                                if (sseResponse.body.getReader) {
                                    try {
                                        const r = sseResponse.body.getReader();
                                        await r.cancel();
                                    } catch (e) {}
                                } else if (typeof sseResponse.body.destroy === 'function') {
                                    try { sseResponse.body.destroy(); } catch (e) {}
                                }
                            }
                        }).catch(async (err) => {
                            console.error('[MCP Proxy] Failed to POST message to SSE endpoint:', err);
                            postError = err;
                            // Immediately trigger stream cancellation
                            if (sseResponse.body.getReader) {
                                try {
                                    const r = sseResponse.body.getReader();
                                    await r.cancel();
                                } catch (e) {}
                            } else if (typeof sseResponse.body.destroy === 'function') {
                                try { sseResponse.body.destroy(); } catch (e) {}
                            }
                        });
                    } else if (eventType === 'message') {
                        try {
                            const parsed = JSON.parse(eventData);
                            if (parsed.id === requestId) {
                                console.log(`[MCP Proxy] Received matching JSON-RPC response for id: ${requestId}`);
                                jsonRpcResponse = parsed;
                                return true; // Stop reading stream
                            }
                        } catch (e) {
                            // Skip non-JSON payloads
                        }
                    }
                    
                    // Throw if a POST error occurred to break readSseStream
                    if (postError) {
                        throw postError;
                    }

                    return false;
                });
            } catch (streamErr) {
                console.warn(`[MCP Proxy] SSE stream reading ended: ${streamErr.message}`);
                if (postError) {
                    return {
                        statusCode: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders },
                        body: JSON.stringify({
                            error: 'MCP server message endpoint call failed',
                            details: postError.message
                        })
                    };
                }
            }

            if (jsonRpcResponse) {
                if (jsonRpcResponse.error) {
                    console.error('[MCP Proxy] JSON-RPC error from SSE:', jsonRpcResponse.error);
                    return {
                        statusCode: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders },
                        body: JSON.stringify({
                            error: jsonRpcResponse.error.message || 'MCP server error',
                            code: jsonRpcResponse.error.code,
                            details: jsonRpcResponse.error.data
                        })
                    };
                }
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                    body: JSON.stringify(jsonRpcResponse)
                };
            } else {
                console.warn('[MCP Proxy] SSE connection closed/timed out without returning matching response. Falling back to direct POST.');
            }
        }

        // 2. Direct POST Fallback (for non-SSE custom JSON-RPC servers)
        console.log(`[MCP Proxy] Invoking direct POST fallback to ${serverUrl}`);
        
        const directHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'MCP-Protocol-Version': '2025-06-18',
            ...headers
        };
        delete directHeaders['Accept']; // Enforce direct JSON response

        await validateMcpUrl(serverUrl);
        const response = await fetch(serverUrl, {
            method: 'POST',
            headers: directHeaders,
            body: JSON.stringify(jsonRpcRequest)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[MCP Proxy] Direct POST server error: ${response.status} - ${errorText}`);
            return {
                statusCode: response.status,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({ 
                    error: `MCP server returned ${response.status}`,
                    details: errorText
                })
            };
        }

        const responseContentType = response.headers.get('content-type') || '';
        if (!responseContentType.includes('application/json')) {
            const text = await response.text();
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({
                    error: 'MCP server returned a non-JSON response. Ensure the URL is a valid MCP endpoint, not a landing page or website.',
                    details: text.substring(0, 300)
                })
            };
        }

        const jsonResponse = await response.json();

        // Check for JSON-RPC error
        if (jsonResponse.error) {
            console.error('[MCP Proxy] JSON-RPC error from direct POST:', jsonResponse.error);
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
                body: JSON.stringify({
                    error: jsonResponse.error.message || 'MCP server error',
                    code: jsonResponse.error.code,
                    details: jsonResponse.error.data
                })
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify(jsonResponse)
        };

    } catch (error) {
        console.error('[MCP Proxy] Critical error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
            body: JSON.stringify({ 
                error: error.message || 'Internal proxy error',
                type: error.name
            })
        };
    }
}
