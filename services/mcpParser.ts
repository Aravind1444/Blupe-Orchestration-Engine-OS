/**
 * MCP Configuration Parser
 * Handles parsing of various MCP configuration formats:
 * - Standard claude_desktop_config.json
 * - Single server MCP config object
 * - Simple SSE JSON configuration
 * - Raw URL strings
 */

export interface ParsedMcpServer {
  name: string;
  transportType: 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>; // env key to placeholder or value
  authType?: 'none' | 'api_key' | 'bearer' | 'custom';
  authHeader?: string;
  authSecret?: string;
  headers?: Record<string, string>; // extra headers for remote servers (authType 'custom')
}

export function parseMcpConfig(rawInput: string): ParsedMcpServer[] {
  const input = rawInput.trim();
  if (!input) {
    throw new Error('Configuration input is empty.');
  }

  // 1. Check if it is a raw URL
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const name = new URL(input).hostname.replace('mcp.', '').split('.')[0] || 'mcp-server';
    return [{
      name,
      transportType: 'sse',
      url: input,
      authType: 'none'
    }];
  }

  // 2. Try parsing as JSON
  try {
    const json = JSON.parse(input);

    // Case A: Claude Desktop format (mcpServers object)
    if (json.mcpServers && typeof json.mcpServers === 'object') {
      return Object.entries(json.mcpServers).map(([name, config]: [string, any]) => {
        return parseSingleServerConfig(name, config);
      });
    }

    // Case B: Single server config wrapped in { "server-name": { ... } }
    if (typeof json === 'object' && Object.keys(json).length === 1 && typeof Object.values(json)[0] === 'object') {
      const name = Object.keys(json)[0];
      const config = Object.values(json)[0] as any;
      if (config && (config.command || config.url)) {
        return [parseSingleServerConfig(name, config)];
      }
    }

    // Case C: Direct single server config (no name key)
    if (typeof json === 'object') {
      if (json.command || json.url) {
        const name = json.name || (json.url ? new URL(json.url).hostname.replace('mcp.', '').split('.')[0] : 'imported-server');
        return [parseSingleServerConfig(name, json)];
      }
    }

    throw new Error('JSON structure not recognized as a valid MCP server configuration.');
  } catch (err: any) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${err.message}`);
    }
    throw err;
  }
}

function parseSingleServerConfig(name: string, config: any): ParsedMcpServer {
  if (!config || typeof config !== 'object') {
    throw new Error(`Invalid server config for "${name}"`);
  }

  // Respect an explicit transport declaration ("type"/"transport": stdio | sse |
  // http | streamable-http | streamable_http); otherwise infer from url/command.
  const declaredType = String(config.type || config.transport || '').toLowerCase();
  const transportType: 'sse' | 'stdio' =
    declaredType === 'stdio' ? 'stdio'
    : declaredType ? 'sse' // any remote transport flavor goes through the proxy's remote path
    : config.url ? 'sse'
    : 'stdio';

  if (transportType === 'stdio') {
    if (!config.command) {
      throw new Error(`Missing required "command" for stdio server "${name}"`);
    }
    // Coerce env values to strings — configs commonly hold numbers/booleans (e.g. "PORT": 3000)
    const env: Record<string, string> = {};
    if (config.env && typeof config.env === 'object' && !Array.isArray(config.env)) {
      for (const [key, value] of Object.entries(config.env)) {
        if (value !== undefined && value !== null) {
          env[key] = String(value);
        }
      }
    }
    return {
      name,
      transportType,
      command: String(config.command),
      args: Array.isArray(config.args) ? config.args.map(String) : [],
      env
    };
  }

  // Remote (SSE / Streamable HTTP)
  if (!config.url) {
    throw new Error(`Missing required "url" for remote server "${name}"`);
  }

  const parsed: ParsedMcpServer = {
    name,
    transportType,
    url: String(config.url),
    authType: config.auth?.type || config.authType || 'none',
    authHeader: config.auth?.headerName || config.authHeader,
    authSecret: config.auth?.key || config.authSecret
  };

  // Map a "headers" block (common in remote configs) onto our auth model
  if (parsed.authType === 'none' && config.headers && typeof config.headers === 'object') {
    const headerEntries = Object.entries(config.headers)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)] as [string, string]);
    const authEntry = headerEntries.find(([k]) => k.toLowerCase() === 'authorization');

    if (authEntry && headerEntries.length === 1 && /^Bearer\s+/i.test(authEntry[1])) {
      parsed.authType = 'bearer';
      parsed.authSecret = authEntry[1].replace(/^Bearer\s+/i, '');
    } else if (headerEntries.length === 1) {
      parsed.authType = 'api_key';
      parsed.authHeader = headerEntries[0][0];
      parsed.authSecret = headerEntries[0][1];
    } else if (headerEntries.length > 1) {
      parsed.authType = 'custom';
      parsed.headers = Object.fromEntries(headerEntries);
    }
  }

  return parsed;
}

/**
 * Checks if a value is a placeholder indicating a credential needs to be provided.
 */
export function isPlaceholderValue(value: string): boolean {
  if (value === undefined || value === null || value === '') return true;
  // Defensive: raw configs can carry numbers/booleans (e.g. "PORT": 3000) —
  // those are real values, not placeholders
  if (typeof value !== 'string') return false;
  const lower = value.toLowerCase();
  return (
    lower.includes('your_') ||
    lower.includes('<your') ||
    lower.includes('placeholder') ||
    lower.includes('sk_key') ||
    lower === '...' ||
    lower.replace(/[^a-z]/g, '') === 'apikey' ||
    lower.replace(/[^a-z]/g, '') === 'token'
  );
}

/**
 * Returns a human-friendly label for common credential keys.
 */
export function getFriendlyCredentialLabel(key: string): string {
  const commonLabels: Record<string, string> = {
    GITHUB_TOKEN: 'GitHub Personal Access Token',
    OPENAI_API_KEY: 'OpenAI API Key',
    SARVAM_API_KEY: 'Sarvam API Key',
    ANTHROPIC_API_KEY: 'Anthropic API Key',
    TAVILY_API_KEY: 'Tavily API Key',
    GEMINI_API_KEY: 'Gemini API Key',
    SUPABASE_SERVICE_KEY: 'Supabase Service Key',
    SMTP_PASS: 'SMTP Password',
    SLACK_BOT_TOKEN: 'Slack Bot Token',
    NOTION_API_KEY: 'Notion API Key',
  };

  if (commonLabels[key]) {
    return commonLabels[key];
  }

  // Generate generic human-friendly label (e.g. CUSTOM_SECRET_KEY -> Custom Secret Key)
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
