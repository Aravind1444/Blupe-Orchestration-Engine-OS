
export enum NodeType {
  START = 'start',
  // Triggers
  FORM_TRIGGER = 'form_trigger',
  WEBHOOK = 'webhook',
  SCHEDULE = 'schedule',
  // AI
  GEMINI = 'gemini', // Legacy
  LLM = 'llm', // Unified AI Node
  AI_VISION = 'ai_vision',
  REASONING = 'reasoning', // Chain-of-thought agentic reasoning
  AGENT = 'agent', // Autonomous AI Agent with ReAct loop
  BATCH = 'batch',
  // Logic
  CONDITION = 'condition',
  ROUTER = 'router', // Switch/Case
  JAVASCRIPT = 'javascript',
  WAIT = 'wait', // Delay
  APPROVAL = 'approval', // Human in the loop
  // Integrations
  API_CALL = 'api_call',
  RSS = 'rss', // RSS Reader
  SLACK = 'slack',
  EMAIL = 'email',
  SHEETS = 'sheets',
  WEB_SEARCH = 'web_search',
  DEEP_RESEARCH = 'deep_research', // Tavily Deep Research
  EXTRACT_URL = 'extract_url', // Tavily URL Extraction
  CRAWL_SITE = 'crawl_site', // Tavily Site Crawler
  MCP = 'mcp', // Model Context Protocol
  HUBSPOT = 'hubspot', // HubSpot CRM
  STRIPE = 'stripe', // Stripe Payments
  ZAPIER_WEBHOOK = 'zapier_webhook', // Zapier Webhooks Integration
  WHATSAPP_TRIGGER = 'whatsapp_trigger',
  WHATSAPP_SEND = 'whatsapp_send',
  RAZORPAY_TRIGGER = 'razorpay_trigger',
  RAZORPAY_ACTION = 'razorpay_action',
  TELEGRAM_TRIGGER = 'telegram_trigger',
  TELEGRAM_SEND = 'telegram_send',
  DISCORD_TRIGGER = 'discord_trigger',
  DISCORD_SEND = 'discord_send',
  // Data / Utils
  JSON = 'json', // Parse/Stringify/Pick
  MATH = 'math', // Math operations
  TEXT = 'text', // Text operations
  // IO
  INPUT = 'input',
  NOTE = 'note',
  OUTPUT = 'output',
}

export enum NodeStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error',
  SKIPPED = 'skipped',
  RETRYING = 'retrying',
  WAITING_APPROVAL = 'waiting_approval'
}

export type PageView = 'landing' | 'auth' | 'dashboard' | 'editor' | 'docs' | 'legal' | 'privacy' | 'terms' | 'refund' | 'security' | 'history' | 'settings' | 'admin' | 'admin-users' | 'admin-nodes' | 'admin-templates' | 'templates' | 'embed-form' | 'features' | 'public' | 'published';

export type LLMProvider = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'ollama';

// Agent (ReAct Loop) Types
export interface AgentThought {
  iteration: number;
  thought: string;
  action: string | null;  // Tool name or 'FINISH'
  actionInput: Record<string, any> | null;
  observation: string | null;
  timestamp: number;
}

export interface AgentState {
  goal: string;
  iteration: number;
  thoughts: AgentThought[];
  memory: Record<string, any>;
  finalAnswer: string | null;
  status: 'running' | 'completed' | 'failed' | 'max_iterations';
  // New fields for three-stage architecture
  plan?: string[];              // Numbered execution plan
  currentStep?: number;         // Current step in plan (1-indexed)
  toolAttempts?: ToolAttempt[]; // History of tool attempts for loop prevention
}

// Tool attempt tracking for state awareness
export interface ToolAttempt {
  tool: string;
  inputHash: string;
  success: boolean;
  error?: string;
}

// MCP tool metadata as discovered from a server (tools/list)
export interface McpDiscoveredTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

// A user-configured MCP server connection (used by the Agent node to expose
// every tool on the server as a native agent tool)
export interface McpServerConfig {
  id: string;                 // Stable id for React keys / dedup
  label: string;              // Short name, used to prefix tool names (e.g. "github")
  transportType: 'sse' | 'stdio'; // Transport protocol
  url?: string;                // MCP server endpoint (for 'sse')
  authType?: 'none' | 'api_key' | 'bearer'; // (for 'sse')
  authHeader?: string;        // Header name when authType === 'api_key' (for 'sse')
  authSecret?: string;        // Secret key reference (resolved from Secrets at runtime) (for 'sse')
  command?: string;           // Command to run (for 'stdio')
  args?: string[];            // Arguments to command (for 'stdio')
  env?: Record<string, string>; // Environment variable key to secret/raw value (for 'stdio')
  tools: McpDiscoveredTool[]; // Cached discovery result
  originalConfig?: string;    // Raw configuration for reproducibility
}

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'textarea' | 'date';
  variableName: string;
  required: boolean;
  placeholder?: string;
}

export interface NodeData {
  label: string;
  type: NodeType | string; // Allow string for dynamic nodes
  content?: string;
  imageUrl?: string; // For AI Vision node
  status?: NodeStatus;
  output?: any;
  error?: string;
  variableName?: string;

  // AI Unified
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemInstruction?: string;

  // API / Integration specific
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: string; // JSON string
  body?: string; // JSON string
  apiAuthProvider?: 'none' | 'google' | 'slack' | 'hubspot' | 'stripe' | 'microsoft';
  apiAuthHeader?: string;
  // Integration Fields
  slackChannel?: string;
  slackBody?: string; // Custom JSON Schema for Slack
  slackMappings?: Record<string, string>; // Maps JSON paths to variables
  emailTo?: string;
  emailSubject?: string;
  emailProvider?: 'smtp' | 'microsoft';
  sheetId?: string;
  range?: string;
  // Web Search
  webQuery?: string;
  // Condition/Logic specific
  condition?: string;
  routes?: string[]; // For Router node
  // Schedule
  cronExpression?: string;
  scheduleActive?: boolean;
  lastRun?: number;
  lastTriggerMinute?: string;
  // RSS
  rssItemLimit?: number;
  // Form Trigger
  formFields?: FormField[];
  formTitle?: string;
  formDescription?: string;
  // Batch
  batchInputVariable?: string;
  batchPrompt?: string;
  // Utils
  waitTimeMs?: number;
  mathExpression?: string;
  textOperation?: 'uppercase' | 'lowercase' | 'trim' | 'split' | 'join' | 'replace';
  textSeparator?: string; // For split/join
  jsonOperation?: 'parse' | 'stringify' | 'pick';
  jsonKey?: string; // For pick
  sheetOperation?: 'append' | 'read';
  sheetProvider?: 'google' | 'microsoft';
  sheetRange?: string; // For read operation (e.g. "Sheet1!A1:B10")
  sheetHeaders?: string[]; // Cached headers for mapping
  sheetOutputVar?: string; // Variable name to store read result in
  microsoftDriveId?: string;

  // Approval (Human in the loop)
  approvalMessage?: string;
  approvers?: string;
  webhookUrl?: string; // Callback URL for async HITL
  webhookSecret?: string; // HMAC-SHA256 signing secret for callback verification
  approvalNotify?: 'none' | 'webhook' | 'telegram' | 'discord' | 'slack'; // Where to ask the human
  approvalTelegramBotToken?: string; // Falls back to TELEGRAM_BOT_TOKEN secret
  approvalTelegramChatId?: string;   // Falls back to TELEGRAM_CHAT_ID secret
  approvalDiscordWebhookUrl?: string; // Discord incoming webhook (falls back to DISCORD_WEBHOOK_URL secret)
  approvalSlackWebhookUrl?: string;   // Slack incoming webhook (falls back to SLACK_WEBHOOK secret)

  // Discord
  discordAppId?: string;          // Discord Application ID (trigger)
  discordPublicKey?: string;      // Ed25519 public key for interaction signature verification (trigger)
  discordBotToken?: string;       // Bot token (trigger command registration / bot-mode send)
  discordCommandName?: string;    // Slash command that triggers the flow (default: run)
  discordCommandDescription?: string;
  discordSendMode?: 'webhook' | 'bot'; // Send via incoming webhook URL or bot token + channel
  discordWebhookUrl?: string;     // Incoming webhook URL (send, webhook mode)
  discordChannelId?: string;      // Channel ID (send, bot mode)
  discordMessage?: string;        // Message content to send
  discordUsername?: string;       // Optional username override (webhook mode only)

  // Reasoning (Agentic)
  reasoningGoal?: string;
  maxIterations?: number;
  thinkingStyle?: 'step-by-step' | 'tree-of-thought' | 'chain-of-thought';
  reasoningContext?: string;

  // HubSpot
  hubspotOperation?: 'create_contact' | 'update_contact' | 'get_contact' | 'search_contacts' | 'create_deal' | 'get_deal';
  hubspotEmail?: string; // Contact email
  hubspotProperties?: string; // JSON string of properties to set/filter
  hubspotContactId?: string; // Contact ID for updates/gets
  hubspotDealId?: string; // Deal ID for deal operations

  // MCP (Model Context Protocol)
  mcpAuthType?: 'none' | 'api_key' | 'bearer' | 'custom';
  mcpAuthHeader?: string; // Custom header name (default: X-API-Key)
  mcpAuthSecret?: string; // Secret key reference (e.g., 'MCP_API_KEY')
  mcpSelectedTool?: string; // Selected tool name from discovery
  mcpToolSchema?: {
    name: string;
    title?: string;
    description?: string;
    inputSchema?: object;
  };
  mcpToolsCache?: Array<{
    name: string;
    title?: string;
    description?: string;
    inputSchema?: object;
  }>;
  mcpInputValues?: Record<string, any>; // User-provided values for schema fields

  // Agent (ReAct Loop)
  agentGoal?: string; // What the agent should achieve
  agentTools?: string[]; // Enabled tool names from registry
  agentMcpServers?: McpServerConfig[]; // MCP servers whose tools the agent can call
  agentMaxIterations?: number; // Max reasoning iterations (default: 10)
  agentMaxCredits?: number; // Credit limit for agent execution (default: 100)
  agentTimeoutMs?: number; // Execution timeout in ms (default: 120000)
  agentThinkingModel?: string; // Model for planning/thinking (e.g., 'gemini-3.1-flash-lite-preview')
  agentState?: AgentState; // Runtime state during execution

  // Custom/admin-defined node snapshot
  customDefinitionId?: string;
  customDefinitionUpdatedAt?: string;
  customDisplayName?: string;
  customDescription?: string;
  customIcon?: string;
  customColor?: string;
  customExecutionType?: CustomNodeExecutionType;
  customExecutionConfig?: Record<string, any>;
  customCreditCost?: number;
  customConfigSchema?: Record<string, any>;

  [key: string]: any;
}

export interface ExecutionLog {
  id: string;
  timestamp: number;
  nodeId: string;
  nodeLabel: string;
  status: NodeStatus;
  output: any;
  duration: number;
  cost?: number; // Estimated cost in USD
  provider?: string;
  model?: string;
  consoleLogs?: string[];
}

export interface RunRecord {
  id: string;
  flowId: string;
  flowName?: string; // Optional for settings view
  status: 'success' | 'failed' | 'stopped';
  startTime: number;
  duration: number;
  totalCost: number;
  creditsUsed?: number;
  logs: ExecutionLog[];
  triggeredBy: string;
}

export interface Secret {
  key: string;
  value: string;
}

export interface SavedFlow {
  id: string;
  user_id?: string; // Owner of the flow
  name: string;
  nodes: any[];
  edges: any[];
  updated_at: number;
  versions?: FlowVersion[];
  // V2: Webhook settings
  webhook_enabled?: boolean;
  webhook_api_key?: string;
  webhook_response_mode?: 'async' | 'sync';
}

export interface FlowVersion {
  id: string;
  timestamp: number;
  name: string;
  nodes: any[];
  edges: any[];
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

export interface UserCredits {
  balance: number;
  tier: 'starter' | 'pro' | 'enterprise';
  flow_limit: number;
  next_billing_date?: number;
  subscription_end_date?: string; // ISO date string for when Pro subscription expires
  // Profile fields stored in user_credits table
  full_name?: string;
  avatar_url?: string;
  handle?: string;
  last_reset_date?: string;
  is_admin?: boolean;
}

// ============================================================================
// ADMIN CONSOLE TYPES
// ============================================================================

export type AdminPageView = 'dashboard' | 'users' | 'nodes' | 'templates';

export type NodeCategory = 'Triggers' | 'AI' | 'Logic' | 'Integrations' | 'Data' | 'IO' | 'Custom';

export type CustomNodeExecutionType = 'api_call' | 'javascript' | 'llm_prompt' | 'plugin_js';

export interface CustomNodeDefinitionSnapshot {
  customDefinitionId?: string;
  customDefinitionUpdatedAt?: string;
  customDisplayName?: string;
  customDescription?: string;
  customIcon?: string;
  customColor?: string;
  customExecutionType?: CustomNodeExecutionType;
  customExecutionConfig?: Record<string, any>;
  customCreditCost?: number;
  customConfigSchema?: Record<string, any>;
}

export interface AdminNode {
  id: string;
  node_type: string;
  display_name: string;
  description?: string;
  category: NodeCategory | string;
  icon_name: string;
  color: string;
  config_schema: Record<string, any>;
  default_config: Record<string, any>;
  execution_type: CustomNodeExecutionType;
  execution_config: Record<string, any>;
  credit_cost: number; // Credits deducted when this node executes
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminTemplate {
  id: string;
  name: string;
  description?: string;
  category: 'Sales' | 'Marketing' | 'Dev' | 'HR' | 'Personal' | 'Other';
  nodes: any[];
  edges: any[];
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  user_id: string;
  email: string;
  full_name?: string;
  handle?: string;
  balance: number;
  tier: 'starter' | 'pro' | 'enterprise';
  flow_limit: number;
  is_admin: boolean;
  created_at: string;
  last_reset_date?: string;
  subscription_end_date?: string; // ISO date string for when Pro subscription expires
  flow_count: number;
  run_count: number;
}

export interface AdminAnalytics {
  total_users: number;
  paid_users: number;
  free_users: number;
  total_flows: number;
  total_runs: number;
  successful_runs: number;
  failed_runs?: number;
  total_credits_used: number;
  users_last_7_days: number;
  users_last_30_days: number;
  runs_last_7_days: number;
  runs_last_30_days: number;
  credits_last_7_days?: number;
  credits_last_30_days?: number;
  mrr_estimate: number;
  avg_runs_per_user?: number;
  // Chart data
  daily_users?: Array<{ date: string; count: number }>;
  daily_runs?: Array<{ date: string; count: number }>;
}
