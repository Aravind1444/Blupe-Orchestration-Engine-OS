/**
 * Agent Executor - Production-Grade ReAct Loop Implementation
 * 
 * Implements a Three-Stage Architecture:
 * Stage 0: PLANNER - Generate numbered execution plan
 * Stage 1: DECIDER - Select best tool for current step
 * Stage 2: EXECUTOR - Execute the selected tool
 * 
 * Key improvements:
 * - Native function calling support (Gemini)
 * - Two-stage decide-then-act flow
 * - Numbered plan tracking ("I am on step 2 of 3")
 * - Mutually exclusive tool descriptions
 * - Few-shot examples for correct behavior
 * - State awareness for failure prevention
 * - Observation truncation for context management
 * - XML-style delimiters for data/instruction separation
 * - Reversed tool ordering (specific first, generic last)
 * - Errors as observations for self-correction
 * 
 * @see implementation_plan.md for design details
 */

import { AgentState, AgentThought, LLMProvider, McpServerConfig } from '../types';
import { getAuthHeaders } from './supabase';

const originalFetch = window.fetch;
const agentFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    const urlString = typeof url === 'string' ? url : url.toString();
    if (urlString.startsWith('/api/')) {
        const headers = await getAuthHeaders((options?.headers || {}) as Record<string, string>);
        return originalFetch(url, {
            ...options,
            headers
        });
    }
    return originalFetch(url, options);
};
// @ts-ignore
const fetch = agentFetch;

// ============================================================================
// TYPES
// ============================================================================

export interface AgentToolDefinition {
    name: string;
    description: string;
    whenToUse: string;
    whenNotToUse: string;
    inputSchema: Record<string, string>;
    creditCost: number;
    execute: (
        input: Record<string, any>,
        context: Record<string, any>,
        secrets: Record<string, string>
    ) => Promise<{ output: any; credits: number }>;
}

export interface AgentConfig {
    goal: string;
    tools: string[];
    maxIterations: number;
    maxCredits: number;
    timeoutMs: number;
    thinkingModel: {
        provider: LLMProvider;
        model: string;
    };
    // Extra tools resolved at runtime (e.g. tools discovered on user-configured
    // MCP servers). Merged with the static AGENT_TOOLS registry for this run.
    dynamicTools?: AgentToolDefinition[];
}

export interface AgentCallbacks {
    onIterationStart?: (iteration: number, totalCredits: number) => void;
    onThinking?: (thought: string) => void;
    onActionStart?: (action: string, estimatedCredits: number) => void;
    onObservation?: (observation: string, creditsUsed: number, totalCredits: number) => void;
    onIterationEnd?: (thought: AgentThought, iterationCredits: number, totalCredits: number) => void;
    onPlanGenerated?: (plan: string[]) => void;
}

export interface ToolAttempt {
    tool: string;
    inputHash: string;
    success: boolean;
    error?: string;
}

/**
 * First-Class Artifact - Named, typed, versioned output
 * Artifacts solve the ephemeral output problem by giving outputs canonical names
 */
export interface ReportArtifact {
    title: string;
    summary: string;     // Executive summary
    sections: {
        heading: string;
        content: string; // Markdown supported
    }[];
    sources: {           // Required for factuality
        title: string;
        url: string;
    }[];
    metadata: {
        wordCount: number;
        generatedAt: string;
    }
}

export interface Artifact {
    name: string;           // Canonical name, e.g., "final_report"
    type: 'research' | 'synthesis' | 'data' | 'notification' | 'report';
    content: string | object | ReportArtifact; // Typed content
    createdAt: number;
    createdByStep: number;
    isPrimary: boolean;     // Is this THE deliverable for the goal?
    id?: string;            // Persistent handle (optional for legacy)
}

export interface ExtendedAgentState extends AgentState {
    plan: string[];
    currentStep: number;
    toolAttempts: ToolAttempt[];
    artifacts: Record<string, Artifact>;  // Named artifact registry
    primaryArtifact: string | null;       // Name of the main deliverable in memory
    artifactStore?: Record<string, ReportArtifact>; // Durable store for large objects (id -> content)
    consecutiveErrors?: number;           // Track repeated "no tool" errors
}

export interface AgentResult {
    success: boolean;
    finalAnswer: string | null;
    thoughts: AgentThought[];
    totalIterations: number;
    creditsUsed: number;
    state: ExtendedAgentState;
}

// ============================================================================
// AGENT PRICING CONFIG
// ============================================================================

/**
 * Flat credit cost per tool call when used by the Agent.
 * This is separate from standalone node pricing to provide predictable agent costs.
 * Example: deep_research costs 35 credits standalone, but only 5 credits when called by agent.
 */
const AGENT_TOOL_CREDIT_COST = 5;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate that an object matches the ReportArtifact schema
 * Returns null if valid, or an error message string if invalid
 */
function validateReport(report: any): string | null {
    if (!report || typeof report !== 'object') return "Output is not a JSON object";
    if (!report.title || typeof report.title !== 'string') return "Missing or invalid 'title'";
    if (!report.summary || typeof report.summary !== 'string') return "Missing or invalid 'summary'";
    if (!Array.isArray(report.sections) || report.sections.length === 0) return "Missing or empty 'sections' array";
    if (!Array.isArray(report.sources)) return "Missing 'sources' array";

    // Validate Sections
    for (let i = 0; i < report.sections.length; i++) {
        const s = report.sections[i];
        if (!s.heading || !s.content) return `Section ${i} missing 'heading' or 'content'`;
    }

    return null; // Valid
}


/**
 * Truncate observations to prevent context pollution
 * Keeps first portion and adds truncation notice
 */
function truncateObservation(obs: string | object, maxLen = 1000): string {
    let obsStr = typeof obs === 'string' ? obs : JSON.stringify(obs, null, 2);
    if (!obsStr || obsStr.length <= maxLen) return obsStr;
    const truncated = obsStr.substring(0, maxLen);
    const remaining = obsStr.length - maxLen;
    return `${truncated}\n\n[TRUNCATED: ${remaining} more characters. Key information extracted above.]`;
}

/**
 * Create a hash of tool input for duplicate detection
 */
function hashInput(input: Record<string, any>): string {
    return JSON.stringify(input).toLowerCase().replace(/\s+/g, '');
}

/**
 * Check if a tool+input combination was already attempted
 */
function wasAttempted(attempts: ToolAttempt[], tool: string, input: Record<string, any>): ToolAttempt | undefined {
    const inputHash = hashInput(input);
    return attempts.find(a => a.tool === tool && a.inputHash === inputHash);
}

/**
 * Repair malformed JSON from LLM output (Fix #3: Robustness)
 * Handles common issues like trailing commas and unescaped newlines
 */
function repairJSON(str: string): string {
    // Remove trailing commas before } or ]
    let repaired = str.replace(/,\s*([}\]])/g, '$1');
    // Remove control characters that break JSON
    repaired = repaired.replace(/[\x00-\x1F\x7F]/g, (ch) => {
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        return '';
    });
    return repaired;
}

/**
 * Tool-to-Intent keyword mapping for intelligent step advancement (Fix #1)
 * Maps tool names to keywords that indicate the tool matches a plan step
 */
const TOOL_TO_INTENT_KEYWORDS: Record<string, string[]> = {
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

/**
 * Check if a tool execution matches the intent of the current plan step (Fix #1)
 * Returns true if the tool semantically aligns with what the plan step describes
 */
function toolMatchesPlanStep(toolName: string, planStep: string): boolean {
    // Always allow these utility tools to "complete" any step
    const alwaysAdvanceTools = ['declare_artifact', 'store_memory'];
    if (alwaysAdvanceTools.includes(toolName)) return true;

    const stepLower = planStep.toLowerCase();

    // Direct tool name match (e.g., "Use llm_call to..." or "llm_call:")
    if (stepLower.includes(toolName.toLowerCase())) return true;

    // Dynamic MCP tools are explicit user-configured capabilities: if the model
    // chose one and it succeeded, treat the current step as advanced.
    if (toolName.startsWith('mcp_')) return true;

    // Get keywords for this tool
    const keywords = TOOL_TO_INTENT_KEYWORDS[toolName] || [];
    if (keywords.length === 0) return false;

    // Check if any keyword appears in the plan step
    return keywords.some(keyword => stepLower.includes(keyword));
}

// ============================================================================
// TOOL REGISTRY - Ordered by specificity (most specific first)
// ============================================================================

export const AGENT_TOOLS: Record<string, AgentToolDefinition> = {
    // TIER 1: Premium/Specific Research Tools (place first to counter primacy bias)
    deep_research: {
        name: 'deep_research',
        description: 'Perform comprehensive, multi-step research with detailed analysis and multiple sources.',
        whenToUse: 'Goal explicitly requires thorough/comprehensive/in-depth research, analysis, or report generation',
        whenNotToUse: 'Goal only needs a quick fact, a single URL is provided, or budget is limited',
        inputSchema: { topic: 'string', max_results: 'number (optional, default 10)' },
        creditCost: 35,
        execute: async (input, context, secrets) => {
            try {
                console.log(`[Agent] Deep Research: "${input.topic}"`);
                const res = await fetch('/api/deep-research', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        topic: input.topic,
                        maxResults: input.max_results || 10,
                        apiKey: secrets['TAVILY_API_KEY']
                    })
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();

                // Return structured object directly (truncate happens when observing)
                return {
                    output: data.result,
                    credits: 35
                };
            } catch (e: any) {
                return { output: `[ERROR] Deep research failed: ${e.message}. Consider using web_search for simpler queries.`, credits: 5 };
            }
        }
    },

    crawl_site: {
        name: 'crawl_site',
        description: 'Crawl an entire website to map structure and extract content from multiple pages.',
        whenToUse: 'Need to analyze entire website structure, all pages, or site-wide content',
        whenNotToUse: 'Only need content from a single page (use extract_url) or need quick facts (use web_search)',
        inputSchema: { url: 'string', max_pages: 'number (optional, default 10)' },
        creditCost: 25,
        execute: async (input, context, secrets) => {
            try {
                console.log(`[Agent] Crawl Site: "${input.url}"`);
                const res = await fetch('/api/crawl-site', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: input.url,
                        maxPages: input.max_pages || 10,
                        apiKey: secrets['TAVILY_API_KEY']
                    })
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                const resultStr = JSON.stringify(data.result, null, 2);
                return {
                    output: truncateObservation(resultStr, 2000),
                    credits: 25
                };
            } catch (e: any) {
                return { output: `[ERROR] Site crawl failed: ${e.message}. Try extract_url for single page.`, credits: 5 };
            }
        }
    },

    // TIER 1.5: Validated Synthesis Tools
    synthesize_report: {
        name: 'synthesize_report',
        description: 'Generate a structured, validated report (JSON) from research data. REQUIRED for any goal asking for a report/summary.',
        whenToUse: 'You have gathered research and need to produce a final deliverable report.',
        whenNotToUse: 'You are just answering a simple question or need an intermediate thought.',
        inputSchema: {
            topic: 'string',
            research_data: 'string (concatenated research observations)',
            requirements: 'string (specific user instructions for tone, length, etc)'
        },
        creditCost: 15,
        execute: async (input, context, secrets) => {
            // RETRY LOOP config
            const MAX_RETRIES = 3;
            let lastError = '';

            const systemPrompt = `You are a synthesis engine. 
OUTPUT FORMAT: JSON ONLY. Miminize whitespace.
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

            // Retry Loop
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`[Agent] synthesize_report attempt ${attempt}/${MAX_RETRIES}`);
                    if (attempt > 1) {
                        currentPrompt += `\n\nPREVIOUS ERROR: ${lastError}. \nYou MUST fix this schema error and return valid JSON.`;
                    }

                    const res = await fetch('/api/llm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            provider: 'gemini',
                            model: 'gemini-3.1-flash-lite-preview',
                            prompt: currentPrompt,
                            system: systemPrompt,
                            maxTokens: 4096,
                            apiKey: secrets['GEMINI_API_KEY'] || secrets['API_KEY']
                        })
                    });

                    if (!res.ok) throw new Error(await res.text());
                    const data = await res.json();
                    const jsonStr = data.text.replace(/```json\n?|\n?```/g, '').trim();
                    let parsed: ReportArtifact;

                    try {
                        parsed = JSON.parse(jsonStr);
                    } catch (e) {
                        // Attempt JSON repair before failing (Fix #3: Robustness)
                        try {
                            parsed = JSON.parse(repairJSON(jsonStr));
                            console.log('[Agent] JSON repaired successfully');
                        } catch (e2) {
                            throw new Error("Failed to parse JSON output even after repair");
                        }
                    }

                    // VALIDATE
                    const validError = validateReport(parsed);
                    if (validError) throw new Error(`Schema Validation Failed: ${validError}`);

                    // SUCCESS - Save to durable store
                    const artifactId = `art_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                    context.artifactStore = context.artifactStore || {};
                    context.artifactStore[artifactId] = parsed;

                    // Return HANDLE
                    return {
                        output: `SUCCESS. Report generated and saved.
ID: ${artifactId}
Title: ${parsed.title}
Word Count: ${parsed.metadata.wordCount}
Sources: ${parsed.sources.length}

NEXT STEP: Use 'declare_artifact' with artifact_name="final_report" and content="${artifactId}" (the ID, not the text).`,
                        credits: 15
                    };

                } catch (e: any) {
                    lastError = e.message;
                    console.warn(`[Agent] Synthesis attempt ${attempt} failed: ${e.message}`);
                }
            }

            return { output: `[ERROR] Failed to synthesize report after ${MAX_RETRIES} attempts. Last error: ${lastError}. Reduce data size or clarify requirements.`, credits: 5 };
        }
    },

    extract_url: {
        name: 'extract_url',
        description: 'Extract and parse content from a specific URL/webpage.',
        whenToUse: 'A specific URL is provided in the goal OR you have a URL from previous search results',
        whenNotToUse: 'No URL is available (use web_search first) OR need site-wide analysis (use crawl_site)',
        inputSchema: { url: 'string' },
        creditCost: 10,
        execute: async (input, context, secrets) => {
            try {
                console.log(`[Agent] Extract URL: "${input.url}"`);
                const res = await fetch('/api/extract-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: input.url,
                        apiKey: secrets['TAVILY_API_KEY']
                    })
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                const resultStr = JSON.stringify(data.result, null, 2);
                return {
                    output: truncateObservation(resultStr, 1500),
                    credits: 10
                };
            } catch (e: any) {
                return { output: `[ERROR] URL extraction failed: ${e.message}. Verify URL is accessible.`, credits: 2 };
            }
        }
    },

    // TIER 2: LLM and Processing Tools
    llm_call: {
        name: 'llm_call',
        description: 'Call an LLM for text generation, summarization, analysis, or any text processing.',
        whenToUse: 'Need to generate, summarize, analyze, or transform text content',
        whenNotToUse: 'Need factual/current information (use web_search) OR need to fetch data (use api_call)',
        inputSchema: { prompt: 'string', system: 'string (optional)' },
        creditCost: 6,
        execute: async (input, context, secrets) => {
            try {
                const res = await fetch('/api/llm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: 'gemini',
                        model: 'gemini-3.1-flash-lite-preview',
                        prompt: input.prompt,
                        system: input.system,
                        apiKey: secrets['GEMINI_API_KEY'] || secrets['API_KEY']
                    })
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                // Truncate LLM responses to prevent context pollution (higher limit for JSON)
                return { output: truncateObservation(data.text, 3000), credits: 6 };
            } catch (e: any) {
                return { output: `[ERROR] LLM call failed: ${e.message}`, credits: 1 };
            }
        }
    },

    // TIER 3: Notification/Action Tools
    send_email: {
        name: 'send_email',
        description: 'Send a formatted email using a SAVED artifact. You cannot write the body yourself.',
        whenToUse: 'Goal requires sending an email report. You must have a synthesized artifact ID (e.g., "art_123...")',
        whenNotToUse: 'Need to just create content (use synthesize_report) or no saved artifact exists',
        inputSchema: {
            to: 'string (email address)',
            subject: 'string',
            artifact_id: 'string (the ID returned by synthesize_report, e.g., "art_54321")'
        },
        creditCost: 5,
        execute: async (input, context, secrets) => {
            try {
                // ID-BASED GATING
                const artifactId = input.artifact_id;
                const artifact = context.artifactStore?.[artifactId];

                if (!artifact) {
                    return {
                        output: `[ERROR] Artifact ID "${artifactId}" not found in durable store. run synthesize_report first.`,
                        credits: 0
                    };
                }

                // Deterministic Template Rendering
                let htmlBody = `<h1>${artifact.title}</h1>`;
                htmlBody += `<p><em>${artifact.summary}</em></p><hr/>`;

                if (Array.isArray(artifact.sections)) {
                    htmlBody += artifact.sections.map((s: any) => `<h2>${s.heading}</h2><div>${s.content}</div>`).join('');
                }

                if (Array.isArray(artifact.sources) && artifact.sources.length > 0) {
                    htmlBody += `<hr/><h3>Sources</h3><ul>${artifact.sources.map((s: any) => `<li><a href="${s.url}">${s.title}</a></li>`).join('')}</ul>`;
                }

                htmlBody += `<br/><br/><small>Generated by Agent • Word Count: ${artifact.metadata?.wordCount || 'N/A'}</small>`;

                const smtpConfig = {
                    host: secrets['SMTP_HOST'],
                    port: secrets['SMTP_PORT'],
                    user: secrets['SMTP_USER'],
                    pass: secrets['SMTP_PASS']
                };
                const res = await fetch('/api/email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: input.to,
                        subject: input.subject || artifact.title, // Fallback to title
                        html: htmlBody,
                        text: `${artifact.title}\n\n${artifact.summary}\n\n(See HTML for full report)`,
                        from: 'no-reply@blupe.space',
                        smtp: smtpConfig
                    })
                });
                if (!res.ok) throw new Error(await res.text());
                return { output: `Email sent to ${input.to} with Report "${artifact.title}" (ID: ${artifactId})`, credits: 5 };
            } catch (e: any) {
                return { output: `[ERROR] Email failed: ${e.message}`, credits: 1 };
            }
        }
    },

    // TIER 6: Artifact Management
    declare_artifact: {
        name: 'declare_artifact',
        description: 'Mark a SAVED synthesis ID as the primary deliverable.',
        whenToUse: 'After synthesize_report returns an ID. Do NOT pass full text content here.',
        whenNotToUse: 'You do not have an artifact ID yet.',
        inputSchema: {
            artifact_name: 'string (e.g., "final_report")',
            artifact_id: 'string (the ID returned by synthesize_report, e.g., "art_12345")'
        },
        creditCost: 0,
        execute: async (input, context, secrets) => {
            try {
                const name = input.artifact_name;
                const id = input.artifact_id;

                if (!context.artifactStore?.[id]) {
                    return { output: `[ERROR] Artifact ID "${id}" does not exist. Run synthesize_report first.`, credits: 0 };
                }

                // Reference Binding
                context._artifacts = context._artifacts || {};
                context._artifacts[name] = { type: 'reference', id: id }; // Pointer
                context._primaryArtifact = name;

                return {
                    output: `✓ Primary artifact "${name}" is now bound to ID "${id}". You can now proceed to delivery.`,
                    credits: 0
                };
            } catch (e: any) {
                return { output: `[ERROR] Declaration failed: ${e.message}`, credits: 0 };
            }
        }
    },

    // TIER 4: Generic/Cheap Tools (placed last)
    web_search: {
        name: 'web_search',
        description: 'Search the web for current information, news, or facts.',
        whenToUse: 'Need quick facts, recent news, or general information lookup',
        whenNotToUse: 'A specific URL is already provided (use extract_url) OR comprehensive research needed (use deep_research)',
        inputSchema: { query: 'string' },
        creditCost: 3,
        execute: async (input, context, secrets) => {
            const query = input.query;
            try {
                const res = await fetch('/api/web-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query,
                        apiKey: secrets['TAVILY_API_KEY']
                    })
                });
                if (!res.ok) throw new Error(await res.text());
                const data = await res.json();
                const results = data.results || data;
                if (Array.isArray(results) && results.length === 0) {
                    return { output: '[NO RESULTS] Web search returned 0 results. Try different keywords or use deep_research.', credits: 3 };
                }
                return { output: truncateObservation(JSON.stringify(results, null, 2), 1200), credits: 3 };
            } catch (e: any) {
                return { output: `[ERROR] Search failed: ${e.message}`, credits: 1 };
            }
        }
    },

    api_call: {
        name: 'api_call',
        description: 'Make an HTTP request to an external API.',
        whenToUse: 'Need to fetch data from or send data to a specific API endpoint',
        whenNotToUse: 'Need general web search (use web_search) OR need webpage content (use extract_url)',
        inputSchema: { url: 'string', method: 'string (GET/POST)', headers: 'object (optional)', body: 'string (optional JSON)' },
        creditCost: 2,
        execute: async (input, context, secrets) => {
            try {
                const options: RequestInit = {
                    method: input.method || 'GET',
                    headers: { 'Content-Type': 'application/json', ...(input.headers || {}) }
                };
                if (input.body && input.method !== 'GET') {
                    options.body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
                }
                const res = await fetch(input.url, options);
                const text = await res.text();
                let output;
                try { output = JSON.parse(text); } catch { output = text; }
                return { output: truncateObservation(typeof output === 'string' ? output : JSON.stringify(output, null, 2), 1000), credits: 2 };
            } catch (e: any) {
                return { output: `[ERROR] API call failed: ${e.message}`, credits: 1 };
            }
        }
    },

    send_slack: {
        name: 'send_slack',
        description: 'Send a message to Slack.',
        whenToUse: 'Goal explicitly requires sending a Slack message or notification',
        whenNotToUse: 'Goal only asks to gather information without sending',
        inputSchema: { channel: 'string', message: 'string' },
        creditCost: 2,
        execute: async (input, context, secrets) => {
            try {
                const accessToken = secrets['SLACK_ACCESS_TOKEN'];
                if (accessToken) {
                    const res = await fetch('/api/slack-api', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            endpoint: 'chat.postMessage',
                            token: accessToken,
                            body: { channel: input.channel, text: input.message }
                        })
                    });
                    const data = await res.json();
                    if (data.ok) {
                        return { output: `Slack message sent to ${input.channel}`, credits: 2 };
                    }
                }
                const hook = secrets['SLACK_WEBHOOK'];
                if (!hook) {
                    return { output: '[ERROR] Slack not configured. Add SLACK_WEBHOOK or connect Slack in Settings.', credits: 0 };
                }
                const res = await fetch(hook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: input.message, channel: input.channel })
                });
                if (!res.ok) throw new Error(await res.text());
                return { output: `Slack message sent to ${input.channel}`, credits: 2 };
            } catch (e: any) {
                return { output: `[ERROR] Slack failed: ${e.message}`, credits: 1 };
            }
        }
    },

    /**
     * JavaScript tool — ALWAYS executes via authenticated custom-node-executor
     * → Cloud Run sandbox. Never uses new Function / local eval.
     */
    javascript: {
        name: 'javascript',
        description: 'Execute JavaScript code for data processing, calculations, or transformations.',
        whenToUse: 'Need to process, transform, filter, or manipulate data programmatically',
        whenNotToUse: 'Need to fetch external data (use api_call) OR simple math (use calculate)',
        inputSchema: { code: 'string' },
        creditCost: 1,
        execute: async (input, context, secrets) => {
            try {
                const code = String(input.code || '');
                if (!code.trim()) {
                    return { output: '[ERROR] Empty code', credits: 0 };
                }
                const { getAuthHeaders } = await import('./supabase');
                const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
                // Synthetic custom node → plugin_js path (sandbox only, no local VM)
                const res = await fetch('/api/custom-node-executor', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        node: {
                            id: 'agent-js-tool',
                            type: 'agent_js_tool',
                            data: {
                                type: 'agent_js_tool',
                                customExecutionType: 'plugin_js',
                                customExecutionConfig: {
                                    code,
                                    timeoutMs: 5000,
                                    // No network capabilities for agent JS tool
                                    capabilities: ['json', 'crypto', 'log'],
                                },
                                customCreditCost: 1,
                            },
                        },
                        context: context || {},
                        // Do not forward secrets object to reduce exposure; sandbox gets owner secrets server-side when needed
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    return {
                        output: `[ERROR] Sandbox execution failed: ${data.error || res.statusText}`,
                        credits: 1,
                    };
                }
                return { output: data.output, credits: data.creditsUsed ?? 1 };
            } catch (e: any) {
                return { output: `[ERROR] JavaScript error: ${e.message}`, credits: 1 };
            }
        }
    },

    // TIER 5: Free/Utility Tools
    /**
     * Safe math evaluation (Fix #5: Security)
     * Blocks JS keywords that could enable injection attacks
     */
    calculate: {
        name: 'calculate',
        description: 'Evaluate a mathematical expression.',
        whenToUse: 'Need to perform math calculations',
        whenNotToUse: 'Need complex data processing (use javascript)',
        inputSchema: { expression: 'string (e.g., "2 + 2 * 3")' },
        creditCost: 0,
        execute: async (input, context, secrets) => {
            try {
                const expr = input.expression;
                const SAFE_PATTERN = /^[\d\s+\-*/().%^]+$|^Math\.\w+\([^)]*\)$/;

                // Block dangerous JS keywords that could enable injection
                const JS_KEYWORDS = ['constructor', 'prototype', '__proto__', 'eval', 'Function',
                    'window', 'document', 'global', 'this', 'self'];

                let resolved = expr;
                if (!SAFE_PATTERN.test(expr)) {
                    // Check for dangerous keywords before resolution
                    const varPattern = /\b([a-zA-Z_]\w*)\b/g;
                    let match;
                    while ((match = varPattern.exec(expr)) !== null) {
                        const varName = match[1];
                        if (JS_KEYWORDS.includes(varName)) {
                            return { output: `[ERROR] Invalid variable name: ${varName}`, credits: 0 };
                        }
                    }

                    // Resolve variables, forcing numeric conversion for safety
                    resolved = expr.replace(/\b([a-zA-Z_]\w*)\b/g, (m: string) => {
                        if (['Math', 'PI', 'E', 'abs', 'ceil', 'floor', 'round', 'sqrt', 'pow'].includes(m)) return m;
                        const val = context[m];
                        if (val === undefined) return m;
                        const num = Number(val);
                        return isNaN(num) ? '0' : String(num);
                    });
                }

                // Final validation after resolution
                if (!SAFE_PATTERN.test(resolved)) {
                    return { output: '[ERROR] Invalid expression - only math operations allowed', credits: 0 };
                }

                // eslint-disable-next-line no-eval
                const result = Function(`"use strict"; return (${resolved})`)();
                return { output: result, credits: 0 };
            } catch (e: any) {
                return { output: `[ERROR] Calculation error: ${e.message}`, credits: 0 };
            }
        }
    },

    read_context: {
        name: 'read_context',
        description: 'Read data from the current workflow context.',
        whenToUse: 'Need to access variables or data from previous workflow nodes',
        whenNotToUse: 'Need external data (use api_call or web_search)',
        inputSchema: { key: 'string (variable name or path like "nodeId.property")' },
        creditCost: 0,
        execute: async (input, context, secrets) => {
            try {
                const key = input.key;
                if (context[key] !== undefined) {
                    return { output: context[key], credits: 0 };
                }
                const parts = key.split('.');
                let current: any = context;
                for (const part of parts) {
                    if (current === undefined || current === null) break;
                    current = current[part];
                }
                return { output: current !== undefined ? current : `[NOT FOUND] Key "${key}" not in context`, credits: 0 };
            } catch (e: any) {
                return { output: `[ERROR] Context read error: ${e.message}`, credits: 0 };
            }
        }
    },

    store_memory: {
        name: 'store_memory',
        description: 'Store a value in agent memory for later use.',
        whenToUse: 'Need to save intermediate results for later steps',
        whenNotToUse: 'Data is already available in context',
        inputSchema: { key: 'string', value: 'any' },
        creditCost: 0,
        execute: async (input, context, secrets) => {
            try {
                context[input.key] = input.value;
                return { output: `Stored "${input.key}" in memory`, credits: 0 };
            } catch (e: any) {
                return { output: `[ERROR] Store failed: ${e.message}`, credits: 0 };
            }
        }
    },

    append_to_sheet: {
        name: 'append_to_sheet',
        description: 'Append a row to a Google Sheet.',
        whenToUse: 'Need to save data to a Google Sheet',
        whenNotToUse: 'Need to read from sheet (not yet supported in agent)',
        inputSchema: { sheetId: 'string', values: 'array of values for the row' },
        creditCost: 3,
        execute: async (input, context, secrets) => {
            try {
                let token = secrets['GOOGLE_ACCESS_TOKEN'];
                if (!token) {
                    try {
                        const { getGoogleAccessToken } = await import('./oauth');
                        token = await getGoogleAccessToken();
                    } catch (e) { /* OAuth not available */ }
                }
                if (!token) {
                    return { output: '[ERROR] Google Sheets not connected. Add GOOGLE_ACCESS_TOKEN to secrets.', credits: 0 };
                }
                const values = Array.isArray(input.values) ? [input.values] : [[input.values]];
                const res = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${input.sheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ values })
                    }
                );
                if (!res.ok) throw new Error(await res.text());
                return { output: 'Row appended to sheet successfully', credits: 3 };
            } catch (e: any) {
                return { output: `[ERROR] Sheets error: ${e.message}`, credits: 1 };
            }
        }
    },


};

// Tool order for prompt construction (specific → generic)
// Note: append_to_sheet removed due to Gemini schema compatibility issues
const TOOL_ORDER = [
    'deep_research',
    'crawl_site',
    'extract_url',
    'synthesize_report', // New validated synthesis tool
    'llm_call',
    'declare_artifact',  // After synthesis, before delivery
    'send_email',
    'send_slack',
    'web_search',
    'api_call',
    'javascript',
    'calculate',
    'read_context',
    'store_memory'
];

// ============================================================================
// DYNAMIC TOOL REGISTRY (static registry + per-run tools, e.g. MCP)
// ============================================================================

/**
 * Merge the static AGENT_TOOLS registry with any per-run dynamic tools
 * (currently: tools discovered on the agent's configured MCP servers).
 */
function resolveToolRegistry(config: AgentConfig): Record<string, AgentToolDefinition> {
    if (!config.dynamicTools || config.dynamicTools.length === 0) return AGENT_TOOLS;
    const registry: Record<string, AgentToolDefinition> = { ...AGENT_TOOLS };
    for (const tool of config.dynamicTools) {
        registry[tool.name] = tool;
    }
    return registry;
}

/** Order tools for prompts: known tools by TOOL_ORDER, dynamic tools first (most specific). */
function orderToolNames(names: string[]): string[] {
    return [...names].sort((a, b) => {
        const ia = TOOL_ORDER.indexOf(a);
        const ib = TOOL_ORDER.indexOf(b);
        return (ia === -1 ? -1 : ia) - (ib === -1 ? -1 : ib);
    });
}

/** Sanitize an MCP server label + tool name into a valid function-calling name. */
function mcpToolName(serverLabel: string, toolName: string): string {
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    return `mcp_${clean(serverLabel)}_${clean(toolName)}`.substring(0, 60);
}

/** Render an MCP JSON Schema as the flat description map the prompts expect. */
function mcpInputSchemaToDescription(schema?: {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
}): Record<string, string> {
    if (!schema?.properties) return {};
    const required = new Set(schema.required || []);
    const out: Record<string, string> = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
        const type = prop.type || 'string';
        const optional = required.has(key) ? '' : ' (optional)';
        out[key] = prop.description ? `${type}${optional} - ${prop.description}` : `${type}${optional}`;
    }
    return out;
}

/**
 * Turn every tool discovered on the agent's configured MCP servers into a
 * native AgentToolDefinition. Execution goes through /api/mcp-proxy
 * (same path as the standalone MCP node), so keys never leave the server side.
 */
export function buildMcpAgentTools(servers: McpServerConfig[]): AgentToolDefinition[] {
    const definitions: AgentToolDefinition[] = [];
    const seen = new Set<string>();

    for (const server of servers || []) {
        if (!server?.url || !Array.isArray(server.tools)) continue;

        for (const mcpTool of server.tools) {
            if (!mcpTool?.name) continue;
            let name = mcpToolName(server.label || 'server', mcpTool.name);
            // Guarantee uniqueness across servers exposing same-named tools
            let suffix = 2;
            while (seen.has(name)) {
                name = `${name.substring(0, 56)}_${suffix++}`;
            }
            seen.add(name);

            definitions.push({
                name,
                description: `[MCP:${server.label}] ${mcpTool.description || mcpTool.title || mcpTool.name}`,
                whenToUse: `The current step needs the external capability "${mcpTool.name}" provided by the connected ${server.label} MCP server`,
                whenNotToUse: 'A built-in tool already covers this need, or the step does not involve this external service',
                inputSchema: mcpInputSchemaToDescription(mcpTool.inputSchema),
                creditCost: AGENT_TOOL_CREDIT_COST,
                execute: async (input, _context, secrets) => {
                    try {
                        let auth: any = undefined;
                        if (server.authType && server.authType !== 'none') {
                            const keyValue = server.authSecret
                                ? (secrets[server.authSecret] || server.authSecret)
                                : undefined;
                            auth = {
                                type: server.authType,
                                key: keyValue,
                                headerName: server.authType === 'api_key' ? (server.authHeader || 'X-API-Key') : undefined
                            };
                        }

                        const res = await fetch('/api/mcp-proxy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                serverUrl: server.url,
                                method: 'tools/call',
                                params: { name: mcpTool.name, arguments: input || {} },
                                auth
                            })
                        });

                        const jsonRes = await res.json();
                        if (!res.ok || jsonRes.error) {
                            throw new Error(jsonRes.error || jsonRes.details || `MCP call failed (${res.status})`);
                        }

                        const result = jsonRes.result;
                        let output: any;
                        if (result?.content && Array.isArray(result.content)) {
                            const textContent = result.content.find((c: any) => c.type === 'text');
                            output = textContent ? textContent.text : JSON.stringify(result.content);
                        } else {
                            output = result;
                        }

                        if (result?.isError) {
                            return { output: `[ERROR] MCP tool "${mcpTool.name}" reported an error: ${output}`, credits: AGENT_TOOL_CREDIT_COST };
                        }

                        return {
                            output: typeof output === 'string' ? truncateObservation(output, 2000) : output,
                            credits: AGENT_TOOL_CREDIT_COST
                        };
                    } catch (e: any) {
                        return { output: `[ERROR] MCP tool "${mcpTool.name}" failed: ${e.message}`, credits: AGENT_TOOL_CREDIT_COST };
                    }
                }
            });
        }
    }

    return definitions;
}

// ============================================================================
// FEW-SHOT EXAMPLES
// ============================================================================

const FEW_SHOT_EXAMPLES = `
<Examples>
EXAMPLE A - URL Provided:
Goal: "Summarize the content from https://example.com/article"
Correct: Use extract_url with url="https://example.com/article"
Wrong: Using web_search (URL already provided)

EXAMPLE B - Comprehensive Research:
Goal: "Research competitors in the AI automation space and create a detailed report"
Correct: Use deep_research with topic="AI automation competitors analysis"
Wrong: Using web_search (goal requires comprehensive/detailed research)

EXAMPLE C - Quick Fact:
Goal: "What is the current price of Bitcoin?"
Correct: Use web_search with query="current Bitcoin price"
Wrong: Using deep_research (overkill for simple fact)

EXAMPLE D - Multi-Step with Notification:
Goal: "Research Tesla stock and email me a summary at user@example.com"
Correct Plan: 1) web_search for Tesla stock info, 2) send_email with summary
Wrong: Finishing after research without sending email

EXAMPLE E - Data Processing:
Goal: "Calculate the average of these numbers: 10, 20, 30, 40"
Correct: Use calculate with expression="(10+20+30+40)/4"
Wrong: Using llm_call for simple math
</Examples>
`;

// ============================================================================
// PLANNER STEP (Native Function Calling)
// ============================================================================

async function generatePlan(
    goal: string,
    tools: string[],
    context: Record<string, any>,
    secrets: Record<string, string>,
    config: AgentConfig
): Promise<{ plan: string[]; credits: number }> {
    const registry = resolveToolRegistry(config);
    const toolDefinitions = orderToolNames(tools.filter(t => registry[t]))
        .map(t => ({
            name: registry[t].name,
            description: registry[t].description,
            whenToUse: registry[t].whenToUse,
            whenNotToUse: registry[t].whenNotToUse,
            creditCost: registry[t].creditCost,
            inputSchema: registry[t].inputSchema
        }));

    try {
        // Try native function calling endpoint (Fix #7: Clean fallback)
        const { getAuthHeaders } = await import('./supabase');
        const res = await fetch('/api/agent-functions', {
            method: 'POST',
            headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                mode: 'plan',
                goal,
                tools: toolDefinitions,
                // Map model names to providers/IDs
                provider: config.thinkingModel.model.includes('claude') ? 'anthropic' : 'gemini',
                model: config.thinkingModel.model.includes('claude') ? 'claude-sonnet-4-5' : 'gemini-3.1-flash-lite-preview',
                apiKey: config.thinkingModel.model.includes('claude')
                    ? secrets['ANTHROPIC_API_KEY']
                    : (secrets['GEMINI_API_KEY'] || secrets['API_KEY'])
            })
        });

        // Immediate fallback on non-200 (Fix #7)
        if (!res.ok) {
            console.warn('[AgentExecutor] Native plan endpoint returned status:', res.status);
            return await generatePlanFallback(goal, tools, context, secrets, config);
        }

        const data = await res.json();
        if (data.plan && Array.isArray(data.plan) && data.plan.length > 0) {
            console.log('[AgentExecutor] Generated plan (native):', data.plan);
            return { plan: data.plan, credits: data.credits || 4 };
        }

        // Invalid response format - fallback (Fix #7)
        console.warn('[AgentExecutor] Native plan response invalid, falling back.');
        return await generatePlanFallback(goal, tools, context, secrets, config);

    } catch (e: any) {
        // Any error (network, JSON parse, etc.) - fallback (Fix #7)
        console.warn('[AgentExecutor] Native plan generation error:', e.message);
        return await generatePlanFallback(goal, tools, context, secrets, config);
    }
}

async function generatePlanFallback(
    goal: string,
    tools: string[],
    context: Record<string, any>,
    secrets: Record<string, string>,
    config: AgentConfig
): Promise<{ plan: string[]; credits: number }> {
    const registry = resolveToolRegistry(config);
    const toolList = orderToolNames(tools.filter(t => registry[t]))
        .map(t => `- ${t}: ${registry[t].description} (${registry[t].creditCost} credits)`)
        .join('\n');

    const systemPrompt = `You are a planning assistant. Given a goal and available tools, create a numbered step-by-step execution plan.

AVAILABLE TOOLS:
${toolList}

RULES:
1. Each step should use exactly one tool
2. Order steps logically (gather data before processing, process before sending)
3. If goal requires sending email/slack, include that as a step - don't skip it
4. Keep plans concise (typically 2-5 steps)
5. Use the most appropriate tool for each step

Respond with ONLY a JSON array of step descriptions, like:
["Search for competitor pricing data", "Extract detailed information from top result", "Send summary email to user"]`;

    const userPrompt = `GOAL: ${goal}

CONTEXT AVAILABLE: ${Object.keys(context).filter(k => !k.startsWith('_')).join(', ') || 'None'}

Create an execution plan for this goal.`;

    try {
        const res = await fetch('/api/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: config.thinkingModel.provider,
                model: config.thinkingModel.model,
                prompt: userPrompt,
                system: systemPrompt,
                temperature: 0.3,
                maxTokens: 512,
                apiKey: secrets[`${config.thinkingModel.provider.toUpperCase()}_API_KEY`] || secrets['API_KEY']
            })
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const text = data.text || '';

        // Parse JSON array from response
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const plan = JSON.parse(jsonMatch[0]);
            if (Array.isArray(plan) && plan.length > 0) {
                console.log('[AgentExecutor] Generated plan (fallback):', plan);
                return { plan, credits: 4 };
            }
        }

        // Fallback: single step plan
        return { plan: [goal], credits: 4 };
    } catch (e: any) {
        console.warn('[AgentExecutor] Plan fallback failed:', e.message);
        return { plan: [goal], credits: 2 };
    }
}

// ============================================================================
// DECIDER STEP
// ============================================================================

function buildDeciderPrompt(
    state: ExtendedAgentState,
    config: AgentConfig
): { system: string; user: string } {
    // Build tool descriptions with when/when-not guidance
    const registry = resolveToolRegistry(config);
    const toolDescriptions = orderToolNames(config.tools.filter(t => registry[t]))
        .map(t => {
            const tool = registry[t];
            return `<Tool name="${tool.name}" cost="${tool.creditCost}">
  ${tool.description}
  WHEN TO USE: ${tool.whenToUse}
  WHEN NOT TO USE: ${tool.whenNotToUse}
  INPUT: ${JSON.stringify(tool.inputSchema)}
</Tool>`;
        })
        .join('\n\n');

    // Build previous attempts warning
    const failedAttempts = state.toolAttempts.filter(a => !a.success);
    const attemptWarning = failedAttempts.length > 0
        ? `\n<FailedAttempts>
${failedAttempts.map(a => `- ${a.tool}: ${a.error || 'failed'}`).join('\n')}
DO NOT retry these same tools with the same inputs.
</FailedAttempts>`
        : '';

    // Build observation history (truncated)
    const observations = state.thoughts
        .filter(t => t.observation)
        .map(t => `Step ${t.iteration} [${t.action}]: ${truncateObservation(t.observation || '', 300)}`)
        .join('\n');

    const system = `You are a tool selection agent implementing a Decide-Then-Act pattern.

<AvailableTools>
${toolDescriptions}
</AvailableTools>

${FEW_SHOT_EXAMPLES}

<Instructions>
1. Review the current plan and identify which step you are on
2. Consider what tool is BEST for the current step
3. Check the failed attempts - do not repeat them
4. Return your decision as valid JSON only
</Instructions>

RESPONSE FORMAT:
{
  "reasoning": "Brief explanation of why this tool is best for the current step",
  "tool": "tool_name",
  "input": { "param": "value" },
  "is_final": false
}

When the goal is FULLY achieved (including any required notifications), respond:
{
  "reasoning": "All steps completed: ...",
  "tool": "FINISH",
  "input": null,
  "is_final": true,
  "final_answer": "Complete answer to the original goal"
}`;

    const user = `<Goal>${state.goal}</Goal>

<Plan>
${state.plan.map((step, i) => `${i + 1}. ${step}${i + 1 === state.currentStep ? ' ← CURRENT STEP' : ''}`).join('\n')}
Progress: Step ${state.currentStep} of ${state.plan.length}
</Plan>

<PreviousObservations>
${observations || 'None yet'}
</PreviousObservations>
${attemptWarning}

<Context>
${JSON.stringify(state.memory, null, 2).substring(0, 1500)}
</Context>

Which tool should be used for the current step? Respond with JSON only.`;

    return { system, user };
}

async function decideNextAction(
    state: ExtendedAgentState,
    config: AgentConfig,
    secrets: Record<string, string>
): Promise<{
    reasoning: string;
    tool: string | null;
    input: Record<string, any> | null;
    isFinal: boolean;
    finalAnswer: string | null;
    credits: number;
    native?: boolean;
}> {
    // Prepare tool definitions for native function calling
    const registry = resolveToolRegistry(config);
    const toolDefinitions = orderToolNames(config.tools.filter(t => registry[t]))
        .map(t => ({
            name: registry[t].name,
            description: registry[t].description,
            whenToUse: registry[t].whenToUse,
            whenNotToUse: registry[t].whenNotToUse,
            creditCost: registry[t].creditCost,
            inputSchema: registry[t].inputSchema
        }));

    // Prepare observations for native API
    const observations = state.thoughts
        .filter(t => t.observation)
        .map(t => ({
            iteration: t.iteration,
            action: t.action,
            observation: truncateObservation(t.observation || '', 300)
        }));

    // Prepare failed attempts
    const failedAttempts = state.toolAttempts
        .filter(a => !a.success)
        .map(a => ({
            tool: a.tool,
            error: a.error
        }));

    try {
        // Use native function calling logic (via agent-functions endpoint)
        const { getAuthHeaders } = await import('./supabase');
        const res = await fetch('/api/agent-functions', {
            method: 'POST',
            headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                mode: 'decide',
                goal: state.goal,
                plan: state.plan,
                currentStep: state.currentStep,
                observations: observations, // USE THE LOCAL VARIABLE, NOT state.memory._observations
                failedAttempts: state.toolAttempts.filter(a => !a.success),
                context: {
                    // Only serialize primitive/safe values to avoid circular refs
                    // Fix #2: Exclude artifactStore to prevent context pollution
                    ...Object.fromEntries(
                        Object.entries(state.memory)
                            .filter(([k, v]) => {
                                if (k.startsWith('_')) return false; // Exclude internal state
                                if (k === 'artifactStore') return false; // Fix #2: Exclude large artifact content
                                if (typeof v === 'function') return false; // Exclude functions
                                return true;
                            })
                            .map(([k, v]) => {
                                // Truncate very large strings
                                if (typeof v === 'string' && v.length > 5000) {
                                    return [k, v.substring(0, 5000) + '...[truncated]'];
                                }
                                return [k, v];
                            })
                    ),
                    lastObservation: state.memory.lastObservation
                },
                tools: toolDefinitions,
                // Map model names to providers/IDs
                provider: config.thinkingModel.model.includes('claude') ? 'anthropic' : 'gemini',
                model: config.thinkingModel.model.includes('claude') ? 'claude-sonnet-4-5' : 'gemini-3.1-flash-lite-preview',
                apiKey: config.thinkingModel.model.includes('claude')
                    ? secrets['ANTHROPIC_API_KEY']
                    : (secrets['GEMINI_API_KEY'] || secrets['API_KEY'])
            })
        });

        if (res.ok) {
            const data = await res.json();
            console.log('[AgentExecutor] Native function call decision:', data.tool, data.native ? '(native)' : '(fallback)');

            return {
                reasoning: data.reasoning || '',
                tool: data.tool || null,
                input: data.input || null,
                isFinal: data.isFinal || data.tool === 'FINISH',
                finalAnswer: data.finalAnswer || null,
                credits: data.credits || 6,
                native: data.native
            };
        }

        // Fallback: use traditional prompt-based decision
        console.log('[AgentExecutor] Native decide failed, falling back to prompt');
        return await decideNextActionFallback(state, config, secrets);

    } catch (e: any) {
        console.warn('[AgentExecutor] Native decide error:', e.message);
        return await decideNextActionFallback(state, config, secrets);
    }
}

async function decideNextActionFallback(
    state: ExtendedAgentState,
    config: AgentConfig,
    secrets: Record<string, string>
): Promise<{
    reasoning: string;
    tool: string | null;
    input: Record<string, any> | null;
    isFinal: boolean;
    finalAnswer: string | null;
    credits: number;
    native?: boolean;
}> {
    const { system, user } = buildDeciderPrompt(state, config);

    try {
        const res = await fetch('/api/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: config.thinkingModel.provider,
                model: config.thinkingModel.model,
                prompt: user,
                system: system,
                temperature: 0.4,  // Slightly higher for better tool consideration
                maxTokens: 1024,
                apiKey: secrets[`${config.thinkingModel.provider.toUpperCase()}_API_KEY`] || secrets['API_KEY']
            })
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const responseText = data.text || '';

        // Log raw prompt for debugging
        console.log('[AgentExecutor] Decider prompt length:', system.length + user.length);
        console.log('[AgentExecutor] Decider response (fallback):', responseText.substring(0, 500));

        // Parse JSON response
        let parsed;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found');
            }
        } catch (e) {
            console.warn('[AgentExecutor] Failed to parse decider response');
            return {
                reasoning: responseText,
                tool: 'FINISH',
                input: null,
                isFinal: true,
                finalAnswer: responseText,
                credits: 6,
                native: false
            };
        }

        return {
            reasoning: parsed.reasoning || '',
            tool: parsed.tool || null,
            input: parsed.input || null,
            isFinal: parsed.is_final || parsed.tool === 'FINISH',
            finalAnswer: parsed.final_answer || null,
            credits: 6,
            native: false
        };
    } catch (e: any) {
        return {
            reasoning: `Error in decision: ${e.message}`,
            tool: 'FINISH',
            input: null,
            isFinal: true,
            finalAnswer: `Agent decision error: ${e.message}`,
            credits: 1,
            native: false
        };
    }
}

// ============================================================================
// MAIN EXECUTION FUNCTION (LEGACY)
// ============================================================================

export async function executeAgent(
    config: AgentConfig,
    context: Record<string, any>,
    secrets: Record<string, string>,
    callbacks: AgentCallbacks = {}
): Promise<AgentResult> {
    // Static registry + per-run dynamic tools (MCP)
    const toolRegistry = resolveToolRegistry(config);

    // Initialize extended state
    const state: ExtendedAgentState = {
        goal: config.goal,
        iteration: 0,
        thoughts: [],
        memory: {
            ...context,
            _workflow: {
                startTime: Date.now(),
                availableTools: config.tools,
                previousNodeOutputs: Object.keys(context).filter(k => !k.startsWith('_'))
            },
            _artifacts: {}  // Artifact storage in memory for tool access
        },
        finalAnswer: null,
        status: 'running',
        plan: [],
        currentStep: 1,
        toolAttempts: [],
        artifacts: {},           // First-class artifact registry
        primaryArtifact: null    // Name of the main deliverable
    };

    let totalCredits = 0;
    const startTime = Date.now();
    // Track observation hashes to detect loops
    const observationHashes: string[] = [];

    console.log(`[AgentExecutor] Starting agent with goal: "${config.goal}"`);
    console.log(`[AgentExecutor] Available tools: ${config.tools.join(', ')}`);

    // ========================================
    // STAGE 0: GENERATE PLAN
    // ========================================
    console.log('[AgentExecutor] Stage 0: Generating execution plan...');
    const planResult = await generatePlan(config.goal, config.tools, context, secrets, config);
    state.plan = planResult.plan;
    totalCredits += planResult.credits;

    callbacks.onPlanGenerated?.(state.plan);
    console.log(`[AgentExecutor] Plan generated (${planResult.credits} credits):`, state.plan);

    // ========================================
    // MAIN REACT LOOP
    // ========================================
    while (state.status === 'running') {
        // Timeout check
        if (Date.now() - startTime > config.timeoutMs) {
            console.warn('[AgentExecutor] Timeout reached');
            state.status = 'failed';
            state.finalAnswer = 'Agent execution timed out. Partial results may be available in observations.';
            break;
        }

        // Max iterations check
        if (state.iteration >= config.maxIterations) {
            console.warn('[AgentExecutor] Max iterations reached');
            state.status = 'max_iterations';
            const lastThought = state.thoughts[state.thoughts.length - 1];
            state.finalAnswer = lastThought?.observation ||
                `Reached maximum iterations (${config.maxIterations}). Last observation may contain useful data.`;
            break;
        }

        // Runtime Assertion: Plan Completion
        if (state.currentStep > state.plan.length) {
            console.log('[AgentExecutor] All steps marked complete. Forcing FINISH.');
            // Only force finish if we haven't already tried to finish
            const decision = { tool: 'FINISH', reasoning: 'All steps completed.', input: { final_answer: state.finalAnswer || 'Completed' }, isFinal: true, credits: 0 };
            // Fall through to handling logic below
        }

        state.iteration++;
        let iterationCredits = 0;
        callbacks.onIterationStart?.(state.iteration, totalCredits);
        console.log(`[AgentExecutor] --- Iteration ${state.iteration} (Step ${state.currentStep}/${state.plan.length}) ---`);

        // ========================================
        // STAGE 1: DECIDE
        // ========================================
        const decision: any = await decideNextAction(state, config, secrets); // Cast to any to access custom props
        totalCredits += decision.credits;
        iterationCredits += decision.credits;

        callbacks.onThinking?.(decision.reasoning);
        console.log(`[AgentExecutor] Decision: ${decision.tool} - ${decision.reasoning.substring(0, 100)}`);

        const thought: AgentThought = {
            iteration: state.iteration,
            thought: decision.reasoning,
            action: decision.tool,
            actionInput: decision.input,
            observation: null,
            timestamp: Date.now()
        };

        // Handle "No Tool Selected" Error explicitly
        if (decision.tool === 'error_no_tool_selected' || (decision.tool === null && !decision.isFinal)) {
            thought.observation = `[system] Attempt failed: No valid tool selected. Please select a valid tool from the list (e.g., 'web_search', 'llm_call').`;
            state.thoughts.push(thought);
            callbacks.onIterationEnd?.(thought, iterationCredits, totalCredits);
            continue; // Retry
        }

        // Check if agent is done
        if (decision.isFinal || decision.tool === 'FINISH') {
            // HARD ENFORCEMENT: Prevent premature FINISH (step count)
            if (state.currentStep <= state.plan.length) {
                const stepsRemaining = state.plan.length - state.currentStep + 1;
                console.warn(`[AgentExecutor] BLOCKED premature FINISH. Step ${state.currentStep}/${state.plan.length}. stepsRemaining=${stepsRemaining}`);

                thought.observation = `[BLOCKED] You cannot call FINISH yet. You have ${stepsRemaining} steps remaining. You must execute Step ${state.currentStep}: "${state.plan[state.currentStep - 1]}".`;
                state.thoughts.push(thought);
                callbacks.onIterationEnd?.(thought, iterationCredits, totalCredits);
                continue;
            }

            // PRE-FINISH VALIDATION: Check if goal implies deliverable
            const goalImpliesDeliverable = /email|send|report|summary|document|case study/i.test(state.goal);

            if (goalImpliesDeliverable) {
                const primaryArtifact = state.memory._primaryArtifact;
                const artifacts = state.memory._artifacts || {};

                if (!primaryArtifact || !artifacts[primaryArtifact]) {
                    console.warn(`[AgentExecutor] BLOCKED FINISH: Goal requires deliverable but no artifact declared.`);
                    thought.observation = `[BLOCKED] Your goal requires delivering content (email/report), but you have not declared an artifact. Use declare_artifact first to name the content, then send_email with that artifact name.`;
                    state.thoughts.push(thought);
                    callbacks.onIterationEnd?.(thought, iterationCredits, totalCredits);
                    continue;
                }

                // Dereference artifact: if it's a reference pointer, look up the actual content
                let artifactContent = artifacts[primaryArtifact];
                if (artifactContent && typeof artifactContent === 'object' && artifactContent.type === 'reference' && artifactContent.id) {
                    // This is a pointer to artifactStore - dereference it
                    const actualContent = state.memory.artifactStore?.[artifactContent.id];
                    if (actualContent) {
                        artifactContent = actualContent;
                        console.log(`[AgentExecutor] Dereferenced artifact "${primaryArtifact}" -> ID "${artifactContent.id}"`);
                    }
                }

                const contentLength = typeof artifactContent === 'string' ? artifactContent.length : JSON.stringify(artifactContent).length;

                if (contentLength < 100) {
                    console.warn(`[AgentExecutor] BLOCKED FINISH: Artifact "${primaryArtifact}" too short (${contentLength} chars)`);
                    thought.observation = `[BLOCKED] Artifact "${primaryArtifact}" is too short (${contentLength} chars). Re-synthesize substantial content before finishing.`;
                    state.thoughts.push(thought);
                    callbacks.onIterationEnd?.(thought, iterationCredits, totalCredits);
                    continue;
                }

                console.log(`[AgentExecutor] Pre-FINISH validation passed. Artifact "${primaryArtifact}" (${contentLength} chars)`);
            }

            state.finalAnswer = decision.finalAnswer || decision.reasoning;
            state.status = 'completed';
            thought.observation = 'Goal completed';
            state.thoughts.push(thought);
            console.log(`[AgentExecutor] Agent finished after completing all steps: ${state.finalAnswer?.substring(0, 200)}`);
            callbacks.onIterationEnd?.(thought, iterationCredits, totalCredits);
            break;
        }

        // ========================================
        // STAGE 2: EXECUTE
        // ========================================
        const toolName = (decision.tool || '').toLowerCase();

        if (config.tools.includes(toolName) && toolRegistry[toolName]) {
            const tool = toolRegistry[toolName];
            const inputHash = hashInput(decision.input || {});

            // IDEMPOTENCY CHECK
            const previousAttempt = wasAttempted(state.toolAttempts, toolName, decision.input || {});
            const isExpensiveTool = ['deep_research', 'crawl_site'].includes(toolName);
            const isSideEffectTool = ['send_email', 'send_slack'].includes(toolName);

            // If it failed before, DO NOT RETRY identical input
            if (previousAttempt && !previousAttempt.success) {
                thought.observation = `[SKIPPED] You already tried ${toolName} with these exact inputs and it failed. Do not repeat mistakes. Try a different input or tool.`;
                console.log(`[AgentExecutor] Skipping duplicate failed attempt: ${toolName}`);
            }
            // Side-effect tools with IDENTICAL inputs should not repeat (prevents exact duplicates)
            // NOTE: Agent CAN send multiple emails/messages with DIFFERENT inputs (e.g., to different recipients)
            else if (previousAttempt && previousAttempt.success && isSideEffectTool) {
                thought.observation = `[SKIPPED] You already sent this exact ${toolName === 'send_email' ? 'email' : 'message'} with the same inputs. Do not send duplicates.`;
                console.log(`[AgentExecutor] Blocking duplicate side-effect tool with same inputs: ${toolName}`);
            }
            // If it SUCCEEDED before and is expensive, prevent loop unless strictly needed
            else if (previousAttempt && previousAttempt.success && isExpensiveTool) {
                thought.observation = `[SKIPPED] You already ran ${toolName} with these inputs. Use the previous results from context. Do not burn credits re-running it.`;
            }
            else {
                callbacks.onActionStart?.(toolName, AGENT_TOOL_CREDIT_COST);
                console.log(`[AgentExecutor] Executing: ${toolName} (${AGENT_TOOL_CREDIT_COST} credits - agent pricing)`);

                const actionResult = await tool.execute(
                    decision.input || {},
                    state.memory,
                    secrets
                );

                // Record attempt
                const outputStr = String(actionResult.output);
                const success = !outputStr.startsWith('[ERROR]') && !outputStr.startsWith('[BLOCKED]');

                state.toolAttempts.push({
                    tool: toolName,
                    inputHash,
                    success,
                    error: success ? undefined : outputStr
                });

                thought.observation = typeof actionResult.output === 'string'
                    ? actionResult.output
                    : JSON.stringify(actionResult.output);

                // LOOP DETECTION: Consecutive "No Tool" or Bad Actions
                if (toolName === 'error_no_tool_selected') {
                    state.consecutiveErrors = (state.consecutiveErrors || 0) + 1;
                    if (state.consecutiveErrors >= 3) {
                        thought.observation = `[SYSTEM ABORT] Too many consecutive invalid tool selections (${state.consecutiveErrors}). Terminating agent execution to prevent infinite loop.`;
                        state.finalAnswer = "Agent terminated due to repeated tool selection failures.";
                        state.status = 'failed';
                        state.thoughts.push(thought);
                        break;
                    }
                } else {
                    state.consecutiveErrors = 0; // Reset on valid attempt
                }

                // LOOP DETECTION: Identical Repeated Search/Actions
                if (toolName === 'web_search' && previousAttempt && previousAttempt.success) {
                    // Hard stop on 3rd identical search
                    const identicalCount = state.toolAttempts.filter(a => a.tool === toolName && a.inputHash === inputHash).length;
                    if (identicalCount >= 3) {
                        thought.observation = `[SYSTEM ABORT] You have run the exact same search query 3 times. Terminating to save credits.`;
                        state.status = 'failed';
                        state.thoughts.push(thought);
                        break;
                    }
                }

                // Update memory
                // CONTEXT KEY STANDARDIZATION
                const memoryTypeMap: Record<string, string> = {
                    'deep_research': 'research.observations',
                    'synthesize_report': 'synthesis.report_handle',
                    'web_search': 'research.search_results'
                };

                if (memoryTypeMap[toolName]) {
                    const key = memoryTypeMap[toolName];
                    state.memory[key] = (state.memory[key] || '') + '\n' + thought.observation;
                }
                state.memory[`observation_${state.iteration}`] = actionResult.output;
                state.memory.lastObservation = actionResult.output;

                // Use flat agent pricing instead of individual tool credits
                const agentCredits = AGENT_TOOL_CREDIT_COST;
                callbacks.onObservation?.(thought.observation, agentCredits, totalCredits);
                console.log(`[AgentExecutor] Result: ${thought.observation.substring(0, 200)}...`);

                // Track success but don't advance here - will advance after thought is recorded
                totalCredits += agentCredits;
                iterationCredits += agentCredits;
            }
        } else {
            thought.observation = `[ERROR] Unknown or disabled tool: ${decision.tool}. Available: ${config.tools.join(', ')}`;
            console.warn(`[AgentExecutor] ${thought.observation}`);
        }

        state.thoughts.push(thought);
        callbacks.onIterationEnd?.(thought, iterationCredits, totalCredits);

        // Fix #1: Intelligent step advancement - only advance if tool matches plan step intent
        // Advance to next step AFTER recording thought, BEFORE next iteration
        const currentPlanStep = state.plan[state.currentStep - 1] || '';
        const toolMatchesStep = toolMatchesPlanStep(thought.action || '', currentPlanStep);

        if (thought.observation && !thought.observation.startsWith('[ERROR]') &&
            !thought.observation.startsWith('[SKIPPED]') &&
            !thought.observation.startsWith('[BLOCKED]') &&
            state.currentStep <= state.plan.length &&
            thought.action !== 'read_context' &&
            thought.action !== 'error_no_tool_selected' &&
            toolMatchesStep) {
            state.currentStep++;
            console.log(`[AgentExecutor] Advanced to step ${state.currentStep}/${state.plan.length} (tool '${thought.action}' matched step intent)`);
        } else if (thought.observation && !thought.observation.startsWith('[ERROR]') &&
            !thought.observation.startsWith('[SKIPPED]') &&
            !thought.observation.startsWith('[BLOCKED]') &&
            thought.action !== 'read_context' &&
            thought.action !== 'error_no_tool_selected' &&
            !toolMatchesStep) {
            console.log(`[AgentExecutor] Tool '${thought.action}' executed but did not match step ${state.currentStep}: "${currentPlanStep.substring(0, 50)}...". Staying on current step.`);
        }
    }

    console.log(`[AgentExecutor] Completed. Status: ${state.status}, Iterations: ${state.iteration}, Credits: ${totalCredits}`);

    return {
        success: state.status === 'completed',
        finalAnswer: state.finalAnswer,
        thoughts: state.thoughts,
        totalIterations: state.iteration,
        creditsUsed: totalCredits,
        state
    };
}

