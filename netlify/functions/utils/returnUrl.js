/**
 * Validate OAuth return URLs against an allowlist to prevent open redirects.
 */
const DEFAULT_ALLOWED_HOSTS = [
  'blupe.space',
  'www.blupe.space',
  'bloope.netlify.app',
  'localhost',
  '127.0.0.1',
];

export function sanitizeReturnUrl(returnUrl, fallback) {
  const siteUrl = fallback || process.env.SITE_URL || 'https://blupe.space';
  if (!returnUrl || typeof returnUrl !== 'string') {
    return siteUrl;
  }

  try {
    const url = new URL(returnUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return siteUrl;
    }

    const allowed = new Set(DEFAULT_ALLOWED_HOSTS);
    // Allow current deploy host if present
    for (const envHost of [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.SITE_URL]) {
      if (!envHost) continue;
      try {
        allowed.add(new URL(envHost).hostname);
      } catch {
        /* ignore */
      }
    }

    const host = url.hostname.toLowerCase();
    if (allowed.has(host) || host.endsWith('.netlify.app')) {
      return url.toString();
    }
    return siteUrl;
  } catch {
    return siteUrl;
  }
}
