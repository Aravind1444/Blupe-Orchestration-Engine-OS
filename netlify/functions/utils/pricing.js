/**
 * Shared utility for server-side credit calculation and billing metrics
 */
export function getEndpointCost(endpoint, body) {
  switch (endpoint) {
    case 'email': return 5;
    case 'whatsapp-api': return 5;
    case 'telegram-api': return 3;
    case 'discord-api': return 3;
    case 'razorpay-api': return 5;
    case 'web-search': return 3;
    case 'deep-research': return 35;
    case 'extract-url': return 10;
    case 'crawl-site': return 25;
    case 'mcp-proxy': return 2;
    case 'slack-api': return 2;
    case 'stripe-api': return 2;
    case 'llm': {
      const { provider, model, apiKey, secrets } = body || {};
      // BYOK only when a real provider key is present — not a dummy secrets array
      // that would otherwise arbitrage platform keys at the cheap rate.
      const providerKeyNames = {
        openai: ['OPENAI_API_KEY'],
        anthropic: ['ANTHROPIC_API_KEY'],
        groq: ['GROQ_API_KEY'],
        gemini: ['GEMINI_API_KEY', 'API_KEY'],
      };
      const names = providerKeyNames[(provider || '').toLowerCase()] || ['API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY'];
      const secretVal = Array.isArray(secrets)
        ? secrets.find(s => names.includes(s.key) && s.value)?.value
        : null;
      const candidateKey = apiKey || secretVal || '';
      const platformKeys = [
        process.env.OPENAI_API_KEY,
        process.env.ANTHROPIC_API_KEY,
        process.env.GROQ_API_KEY,
        process.env.GEMINI_API_KEY,
        process.env.API_KEY,
      ].filter(Boolean);
      const isPlatformKey = candidateKey && platformKeys.includes(candidateKey);
      const hasCustomKey = Boolean(candidateKey) && !isPlatformKey;
      if (hasCustomKey) {
        return 3; // flat rate for BYOK
      }
      // Platform keys pricing based on model weight
      const modelStr = (model || '').toLowerCase();
      if (modelStr.includes('pro') || modelStr.includes('opus') || modelStr.includes('5.1') || modelStr.includes('gpt-5.1') || modelStr.includes('claude-opus')) {
        return 20;
      }
      if (modelStr.includes('flash') || modelStr.includes('mini') || modelStr.includes('8b') || modelStr.includes('instant') || modelStr.includes('nano')) {
        return 6;
      }
      return 10; // default platform LLM cost
    }
    default: return 1;
  }
}
