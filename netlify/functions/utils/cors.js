// Shared CORS configuration for Netlify functions
// Environment-aware origin restrictions — use everywhere instead of '*'

const ALLOWED_ORIGINS = [
    'https://blupe.space',
    'https://www.blupe.space',
    'https://bloope.netlify.app',
];

const DEV_ORIGINS = [
    'http://localhost:3001',
    'http://localhost:8888',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:8888',
];

/**
 * @param {object} event - Netlify function event object
 * @param {boolean} restrictInProduction - If true, restrict to allowlist in production
 * @returns {string} The origin to use in Access-Control-Allow-Origin header
 */
export function getCorsOrigin(event, restrictInProduction = true) {
    const origin = event?.headers?.origin || event?.headers?.Origin || '';
    const isDevEnv =
        process.env.NODE_ENV === 'development' ||
        process.env.CONTEXT === 'dev' ||
        process.env.CONTEXT === 'deploy-preview' ||
        process.env.CONTEXT === 'branch-deploy';

    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        return origin;
    }

    if (origin && DEV_ORIGINS.includes(origin)) {
        return origin;
    }

    // Netlify deploy previews / branch deploys
    if (origin) {
        try {
            const host = new URL(origin).hostname.toLowerCase();
            if (host.endsWith('.netlify.app')) {
                return origin;
            }
        } catch {
            /* ignore */
        }
    }

    if (isDevEnv) {
        const localRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
        if (origin && localRegex.test(origin)) {
            return origin;
        }
        // Dev without Origin header (curl) — allow
        if (!origin) return '*';
        return origin;
    }

    // Production fallback (preflight may omit Origin)
    return ALLOWED_ORIGINS[0];
}

/**
 * Full CORS headers for browser-facing API responses.
 * @param {object} event
 * @param {boolean} restrictInProduction
 * @param {object} extraHeaders
 */
export function getCorsHeaders(event, restrictInProduction = true, extraHeaders = {}) {
    return {
        'Access-Control-Allow-Origin': getCorsOrigin(event, restrictInProduction),
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, x-api-key, X-API-Key, x-flow-id, X-Flow-Id, x-flow-owner-id, X-Flow-Owner-Id, X-Cron-Secret, X-Blupe-Custom-Node-Secret',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json',
        ...extraHeaders,
    };
}

/**
 * Webhook/inbound endpoints often need open CORS (no browser credentials).
 * Still set a sane Content-Type.
 */
export function getWebhookCorsHeaders(extraHeaders = {}) {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
            'Content-Type, Authorization, X-API-Key, X-Telegram-Bot-Api-Secret-Token, X-Hub-Signature-256, X-Razorpay-Signature, X-Signature-Ed25519, X-Signature-Timestamp',
        'Content-Type': 'application/json',
        ...extraHeaders,
    };
}

export { ALLOWED_ORIGINS, DEV_ORIGINS };
