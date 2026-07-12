
import { Edge, Node } from 'reactflow';
import { NodeData, NodeStatus, NodeType } from '../types';
import { supabase } from './supabase';

export interface Template {
    id: string;
    name: string;
    description: string;
    category: 'Sales' | 'Marketing' | 'Dev' | 'HR' | 'Personal' | 'Other';
    nodes: Node<NodeData>[];
    edges: Edge[];
}

/**
 * Fetch templates from database, falling back to static templates if DB unavailable
 */
export async function getTemplates(): Promise<Record<string, Template>> {
    try {
        const { data, error } = await supabase
            .from('admin_templates')
            .select('*')
            .eq('is_active', true)
            .order('is_featured', { ascending: false });

        if (error) {
            console.warn('[Templates] DB fetch failed, using static:', error.message);
            return templates;
        }

        if (data && data.length > 0) {
            const dbTemplates: Record<string, Template> = {};
            data.forEach((t: any) => {
                dbTemplates[t.id] = {
                    id: t.id,
                    name: t.name,
                    description: t.description || '',
                    category: t.category,
                    nodes: t.nodes || [],
                    edges: t.edges || []
                };
            });
            console.log(`[Templates] Loaded ${data.length} templates from database`);
            return dbTemplates;
        }
    } catch (e) {
        console.warn('[Templates] Error fetching from DB:', e);
    }

    // Fallback to static templates
    return templates;
}


export const templates: Record<string, Template> = {
    // --- Marketing ---
    'content-gen': {
        id: 'content-gen', name: "AI LinkedIn Post Generator", description: "Generate viral LinkedIn posts from a simple topic.", category: 'Marketing',
        nodes: [
            { id: 'start', type: NodeType.START, position: { x: 50, y: 300 }, data: { label: 'Start', type: NodeType.START } },
            { id: 'input', type: NodeType.INPUT, position: { x: 250, y: 150 }, data: { label: 'Topic', type: NodeType.INPUT, content: 'Future of AI Agents', variableName: 'topic' } },
            { id: 'llm', type: NodeType.LLM, position: { x: 550, y: 250 }, data: { label: 'Write Post', type: NodeType.LLM, provider: 'gemini', model: 'gemini-3.1-flash-lite-preview', content: 'Write a LinkedIn post about {{topic}}. Use emojis and short paragraphs.', variableName: 'post' } },
            { id: 'output', type: NodeType.OUTPUT, position: { x: 900, y: 300 }, data: { label: 'Result', type: NodeType.OUTPUT } }
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'llm', animated: true }, { id: 'e2', source: 'input', target: 'llm', animated: true }, { id: 'e3', source: 'llm', target: 'output', animated: true }
        ]
    },
    'blog-writer': {
        id: 'blog-writer', name: "SEO Blog Writer", description: "Create SEO-optimized articles with outline approval.", category: 'Marketing',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 100, y: 300 }, data: { label: 'Keyword', type: NodeType.INPUT, content: 'Enterprise Automation', variableName: 'kw' } },
            { id: 'outline', type: NodeType.LLM, position: { x: 400, y: 300 }, data: { label: 'Gen Outline', type: NodeType.LLM, provider: 'anthropic', model: 'claude-3-sonnet-20240229', content: 'Outline for: {{kw}}', variableName: 'outline' } },
            { id: 'approve', type: NodeType.APPROVAL, position: { x: 700, y: 300 }, data: { label: 'Approve', type: NodeType.APPROVAL, approvalMessage: 'Review: {{outline}}' } },
            { id: 'write', type: NodeType.LLM, position: { x: 1000, y: 300 }, data: { label: 'Write Article', type: NodeType.LLM, provider: 'openai', model: 'gpt-4o', content: 'Write full article: {{outline}}' } }
        ],
        edges: [
            { id: 'e1', source: 'input', target: 'outline', animated: true }, { id: 'e2', source: 'outline', target: 'approve', animated: true }, { id: 'e3', source: 'approve', target: 'write', animated: true }
        ]
    },
    'social-monitor': {
        id: 'social-monitor', name: "Brand Mention Monitor", description: "Analyze brand sentiment from RSS feed.", category: 'Marketing',
        nodes: [
            { id: 'rss', type: NodeType.RSS, position: { x: 100, y: 100 }, data: { label: 'News Feed', type: NodeType.RSS, url: 'https://news.google.com/rss/search?q=OpenAI', variableName: 'news' } },
            { id: 'batch', type: NodeType.BATCH, position: { x: 100, y: 300 }, data: { label: 'Analyze Sentiment', type: NodeType.BATCH, batchInputVariable: 'news.items', batchPrompt: 'Sentiment of: {{item.title}}? (Positive/Negative)', variableName: 'sentiments' } },
            { id: 'email', type: NodeType.EMAIL, position: { x: 100, y: 500 }, data: { label: 'Report', type: NodeType.EMAIL, emailTo: 'pr@company.com', emailSubject: 'Daily Sentiment', content: '{{sentiments}}' } }
        ],
        edges: [{ id: 'e1', source: 'rss', target: 'batch' }, { id: 'e2', source: 'batch', target: 'email' }]
    },

    // --- Sales ---
    'lead-score': {
        id: 'lead-score', name: "Inbound Lead Scorer", description: "Score leads via Webhook & route hot ones to Slack.", category: 'Sales',
        nodes: [
            { id: 'hook', type: NodeType.WEBHOOK, position: { x: 50, y: 300 }, data: { label: 'New Lead', type: NodeType.WEBHOOK, variableName: 'lead' } },
            { id: 'score', type: NodeType.LLM, position: { x: 350, y: 300 }, data: { label: 'Score', type: NodeType.LLM, content: 'Score lead 0-100: {{lead}}', variableName: 'score' } },
            { id: 'router', type: NodeType.ROUTER, position: { x: 650, y: 300 }, data: { label: 'Check Score', type: NodeType.ROUTER, content: '{{score}} > 80 ? "HOT" : "COLD"' } },
            { id: 'slack', type: NodeType.SLACK, position: { x: 950, y: 200 }, data: { label: 'Sales Alert', type: NodeType.SLACK, slackChannel: '#sales', content: 'HOT LEAD: {{lead.email}}' } },
            { id: 'sheet', type: NodeType.SHEETS, position: { x: 950, y: 400 }, data: { label: 'Archive', type: NodeType.SHEETS, sheetId: 'leads_db' } }
        ],
        edges: [
            { id: 'e1', source: 'hook', target: 'score' }, { id: 'e2', source: 'score', target: 'router' },
            { id: 'e3', source: 'router', target: 'slack', sourceHandle: 'HOT' }, { id: 'e4', source: 'router', target: 'sheet', sourceHandle: 'default' }
        ]
    },
    'email-outreach': {
        id: 'email-outreach', name: "Cold Email Personalizer", description: "Enrich prospect data and send personalized intro.", category: 'Sales',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Prospect', type: NodeType.INPUT, content: 'john@example.com', variableName: 'email' } },
            { id: 'enrich', type: NodeType.API_CALL, position: { x: 300, y: 200 }, data: { label: 'Enrich Data', type: NodeType.API_CALL, url: 'https://api.enrich.com?email={{email}}', variableName: 'data' } },
            { id: 'draft', type: NodeType.LLM, position: { x: 550, y: 200 }, data: { label: 'Draft Email', type: NodeType.LLM, content: 'Draft intro for {{data.name}} at {{data.company}}', variableName: 'body' } },
            { id: 'send', type: NodeType.EMAIL, position: { x: 800, y: 200 }, data: { label: 'Send', type: NodeType.EMAIL, emailTo: '{{email}}', content: '{{body}}' } }
        ],
        edges: [{ id: 'e1', source: 'input', target: 'enrich' }, { id: 'e2', source: 'enrich', target: 'draft' }, { id: 'e3', source: 'draft', target: 'send' }]
    },

    // --- HR ---
    'resume-screen': {
        id: 'resume-screen', name: "Resume Screener", description: "Extract skills from PDF resumes text.", category: 'HR',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Resume Text', type: NodeType.INPUT, content: 'Paste text...', variableName: 'resume' } },
            { id: 'extract', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Extract Skills', type: NodeType.LLM, content: 'List top 5 skills: {{resume}}', variableName: 'skills' } },
            { id: 'save', type: NodeType.SHEETS, position: { x: 550, y: 200 }, data: { label: 'Save Candidate', type: NodeType.SHEETS, content: '["{{skills}}"]' } }
        ],
        edges: [{ id: 'e1', source: 'input', target: 'extract' }, { id: 'e2', source: 'extract', target: 'save' }]
    },
    'onboard-new-hire': {
        id: 'onboard-new-hire', name: "Employee Onboarding", description: "Send welcome kit and create accounts.", category: 'HR',
        nodes: [
            { id: 'hook', type: NodeType.WEBHOOK, position: { x: 50, y: 200 }, data: { label: 'New Hire', type: NodeType.WEBHOOK, variableName: 'emp' } },
            { id: 'email', type: NodeType.EMAIL, position: { x: 300, y: 100 }, data: { label: 'Welcome Email', type: NodeType.EMAIL, emailTo: '{{emp.email}}', content: 'Welcome to the team!' } },
            { id: 'slack', type: NodeType.SLACK, position: { x: 300, y: 300 }, data: { label: 'IT Ticket', type: NodeType.SLACK, content: 'Create account for {{emp.name}}' } }
        ],
        edges: [{ id: 'e1', source: 'hook', target: 'email' }, { id: 'e2', source: 'hook', target: 'slack' }]
    },

    // --- Dev / Ops ---
    'error-classifier': {
        id: 'error-classifier', name: "Error Log Classifier", description: "Classify logs and alert on Critical issues.", category: 'Dev',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Error Log', type: NodeType.INPUT, content: 'Error 500: Database timeout', variableName: 'log' } },
            { id: 'class', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Classify', type: NodeType.LLM, content: 'Is this CRITICAL or INFO? {{log}}', variableName: 'level' } },
            { id: 'cond', type: NodeType.CONDITION, position: { x: 550, y: 200 }, data: { label: 'Is Critical?', type: NodeType.CONDITION, condition: '{{level}} == "CRITICAL"' } },
            { id: 'pager', type: NodeType.SLACK, position: { x: 800, y: 100 }, data: { label: 'PagerDuty', type: NodeType.SLACK, content: 'WAKE UP! {{log}}' } }
        ],
        edges: [{ id: 'e1', source: 'input', target: 'class' }, { id: 'e2', source: 'class', target: 'cond' }, { id: 'e3', source: 'cond', target: 'pager', sourceHandle: 'true' }]
    },
    'pr-reviewer': {
        id: 'pr-reviewer', name: "PR Auto-Reviewer", description: "Review code diffs for bugs.", category: 'Dev',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Diff', type: NodeType.INPUT, content: 'function add(a,b) { return a - b; }', variableName: 'diff' } },
            { id: 'review', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Review', type: NodeType.LLM, content: 'Find bugs in this diff: {{diff}}', variableName: 'comments' } },
            { id: 'slack', type: NodeType.SLACK, position: { x: 550, y: 200 }, data: { label: 'Post Review', type: NodeType.SLACK, content: '{{comments}}' } }
        ],
        edges: [{ id: 'e1', source: 'input', target: 'review' }, { id: 'e2', source: 'review', target: 'slack' }]
    },
    'release-notes': {
        id: 'release-notes', name: "Release Note Gen", description: "Generate notes from commit messages.", category: 'Dev',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Commits', type: NodeType.INPUT, variableName: 'commits' } },
            { id: 'gen', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Draft Notes', type: NodeType.LLM, content: 'Draft release notes: {{commits}}', variableName: 'notes' } },
            { id: 'slack', type: NodeType.SLACK, position: { x: 550, y: 200 }, data: { label: 'Publish', type: NodeType.SLACK, content: 'Release v1.0:\n{{notes}}' } }
        ],
        edges: [{ id: 'e1', source: 'input', target: 'gen' }, { id: 'e2', source: 'gen', target: 'slack' }]
    },

    // --- Personal ---
    'daily-plan': {
        id: 'daily-plan', name: "Daily Planner", description: "Plan your day from Todo list.", category: 'Personal',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Todos', type: NodeType.INPUT, content: 'Gym, Code, Meeting', variableName: 'tasks' } },
            { id: 'plan', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Schedule', type: NodeType.LLM, content: 'Create a schedule for: {{tasks}}', variableName: 'schedule' } },
            { id: 'email', type: NodeType.EMAIL, position: { x: 550, y: 200 }, data: { label: 'Email Me', type: NodeType.EMAIL, content: '{{schedule}}' } }
        ],
        edges: [{ id: 'e1', source: 'input', target: 'plan' }, { id: 'e2', source: 'plan', target: 'email' }]
    },
    'meal-plan': {
        id: 'meal-plan', name: "Meal Planner", description: "Generate recipes for ingredients you have.", category: 'Personal',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Fridge', type: NodeType.INPUT, content: 'Chicken, Rice, Broccoli', variableName: 'ingredients' } },
            { id: 'recipe', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Find Recipe', type: NodeType.LLM, content: 'Recipe for: {{ingredients}}', variableName: 'recipe' } },
            { id: 'save', type: NodeType.NOTE, position: { x: 550, y: 200 }, data: { label: 'Recipe', type: NodeType.NOTE, content: '{{recipe}}' } }
        ],
        edges: [{ id: 'e1', source: 'input', target: 'recipe' }, { id: 'e2', source: 'recipe', target: 'save' }]
    },
    'book-summary': {
        id: 'book-summary', name: "Book Summarizer", description: "Get key takeaways from any book.", category: 'Personal',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Book Title', type: NodeType.INPUT, content: 'Atomic Habits', variableName: 'book' } },
            { id: 'sum', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Summarize', type: NodeType.LLM, content: 'Key takeaways from {{book}}', variableName: 'summary' } },
            { id: 'out', type: NodeType.OUTPUT, position: { x: 550, y: 200 }, data: { label: 'Takeaways', type: NodeType.OUTPUT } }
        ],
        edges: [{ id: 'e1', source: 'input', target: 'sum' }, { id: 'e2', source: 'sum', target: 'out' }]
    },

    // --- Support ---
    'ticket-class': {
        id: 'ticket-class', name: "Support Ticket Router", description: "Route tickets to Billing/Tech channels.", category: 'Other',
        nodes: [
            { id: 'in', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Ticket', type: NodeType.INPUT, content: 'Payment failed' } },
            { id: 'llm', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Classify', type: NodeType.LLM, content: 'Classify: {{in}} (Billing/Tech)', variableName: 'cat' } },
            { id: 'sw', type: NodeType.ROUTER, position: { x: 550, y: 200 }, data: { label: 'Route', type: NodeType.ROUTER, content: '{{cat}}' } }
        ],
        edges: [{ id: 'e1', source: 'in', target: 'llm' }, { id: 'e2', source: 'llm', target: 'sw' }]
    },
    'sentiment-notify': {
        id: 'sentiment-notify', name: "Angry Customer Alert", description: "Detect angry emails and alert manager.", category: 'Other',
        nodes: [
            { id: 'hook', type: NodeType.WEBHOOK, position: { x: 50, y: 200 }, data: { label: 'Email In', type: NodeType.WEBHOOK, variableName: 'msg' } },
            { id: 'llm', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Sentiment', type: NodeType.LLM, content: 'Is this angry? {{msg}}', variableName: 'mood' } },
            { id: 'cond', type: NodeType.CONDITION, position: { x: 550, y: 200 }, data: { label: 'Angry?', type: NodeType.CONDITION, condition: '{{mood}} == "Yes"' } },
            { id: 'alert', type: NodeType.SLACK, position: { x: 800, y: 100 }, data: { label: 'Alert Manager', type: NodeType.SLACK, content: 'Angry customer: {{msg}}' } }
        ],
        edges: [{ id: 'e1', source: 'hook', target: 'llm' }, { id: 'e2', source: 'llm', target: 'cond' }, { id: 'e3', source: 'cond', target: 'alert', sourceHandle: 'true' }]
    },

    // --- Misc ---
    'joke-gen': {
        id: 'joke-gen', name: "Daily Joke Email", description: "Start your day with a laugh.", category: 'Personal',
        nodes: [
            { id: 'sched', type: NodeType.SCHEDULE, position: { x: 50, y: 200 }, data: { label: '8 AM', type: NodeType.SCHEDULE } },
            { id: 'joke', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Tell Joke', type: NodeType.LLM, content: 'Tell me a tech joke', variableName: 'joke' } },
            { id: 'mail', type: NodeType.EMAIL, position: { x: 550, y: 200 }, data: { label: 'Email', type: NodeType.EMAIL, content: '{{joke}}' } }
        ],
        edges: [{ id: 'e1', source: 'sched', target: 'joke' }, { id: 'e2', source: 'joke', target: 'mail' }]
    },
    'invoice-ocr': {
        id: 'invoice-ocr', name: "Invoice OCR", description: "Extract invoice totals from images.", category: 'Sales',
        nodes: [
            { id: 'in', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Image URL', type: NodeType.INPUT } },
            { id: 'vis', type: NodeType.AI_VISION, position: { x: 300, y: 200 }, data: { label: 'Extract Total', type: NodeType.AI_VISION, content: 'What is the total?', variableName: 'total' } },
            { id: 'sheet', type: NodeType.SHEETS, position: { x: 550, y: 200 }, data: { label: 'Save', type: NodeType.SHEETS, content: '["{{total}}"]' } }
        ],
        edges: [{ id: 'e1', source: 'in', target: 'vis' }, { id: 'e2', source: 'vis', target: 'sheet' }]
    },
    'meeting-notes': {
        id: 'meeting-notes', name: "Meeting Summarizer", description: "Convert transcript to bullet points.", category: 'Other',
        nodes: [
            { id: 'in', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Transcript', type: NodeType.INPUT } },
            { id: 'llm', type: NodeType.LLM, position: { x: 300, y: 200 }, data: { label: 'Summarize', type: NodeType.LLM, content: 'Bullet points: {{in}}' } },
            { id: 'not', type: NodeType.NOTE, position: { x: 550, y: 200 }, data: { label: 'Notes', type: NodeType.NOTE, content: '{{llm.output}}' } }
        ],
        edges: [{ id: 'e1', source: 'in', target: 'llm' }, { id: 'e2', source: 'llm', target: 'not' }]
    },
    'data-clean': {
        id: 'data-clean', name: "Data Cleaner", description: "Format phone numbers via JS.", category: 'Dev',
        nodes: [
            { id: 'in', type: NodeType.INPUT, position: { x: 50, y: 200 }, data: { label: 'Phone', type: NodeType.INPUT, content: '(555) 123-4567' } },
            { id: 'js', type: NodeType.JAVASCRIPT, position: { x: 300, y: 200 }, data: { label: 'Format', type: NodeType.JAVASCRIPT, content: 'return input.replace(/\D/g, "")' } },
            { id: 'out', type: NodeType.OUTPUT, position: { x: 550, y: 200 }, data: { label: 'Clean', type: NodeType.OUTPUT } }
        ],
        edges: [{ id: 'e1', source: 'in', target: 'js' }, { id: 'e2', source: 'js', target: 'out' }]
    },
    'hello-world': {
        id: 'hello-world', name: "Hello World", description: "Simple starting point.", category: 'Other',
        nodes: [
            { id: 'start', type: NodeType.START, position: { x: 50, y: 200 }, data: { label: 'Start', type: NodeType.START } },
            { id: 'log', type: NodeType.JAVASCRIPT, position: { x: 300, y: 200 }, data: { label: 'Log', type: NodeType.JAVASCRIPT, content: 'console.log("Hello!")' } }
        ],
        edges: [{ id: 'e1', source: 'start', target: 'log' }]
    },

    // --- Advanced Agentic Workflows ---
    'research-agent': {
        id: 'research-agent', name: "AI Research Agent", description: "Autonomous research agent that searches web, analyzes results, and generates comprehensive reports.", category: 'Marketing',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 300 }, data: { label: 'Research Topic', type: NodeType.INPUT, content: 'Latest AI trends 2024', variableName: 'topic' } },
            { id: 'search', type: NodeType.WEB_SEARCH, position: { x: 350, y: 300 }, data: { label: 'Web Search', type: NodeType.WEB_SEARCH, searchQuery: '{{topic}}', variableName: 'results' } },
            { id: 'reason', type: NodeType.REASONING, position: { x: 650, y: 300 }, data: { label: 'Analyze Findings', type: NodeType.REASONING, reasoningGoal: 'Analyze search results and identify key trends, patterns, and insights about {{topic}}', thinkingStyle: 'chain-of-thought', variableName: 'analysis' } },
            { id: 'report', type: NodeType.LLM, position: { x: 950, y: 300 }, data: { label: 'Generate Report', type: NodeType.LLM, provider: 'anthropic', model: 'claude-3-sonnet-20240229', content: 'Create a comprehensive research report based on this analysis: {{analysis.answer}}. Include executive summary, key findings, and recommendations.', variableName: 'final_report' } },
            { id: 'save', type: NodeType.SHEETS, position: { x: 1250, y: 300 }, data: { label: 'Save to Sheets', type: NodeType.SHEETS, operation: 'append', content: '["{{topic}}", "{{final_report}}"]' } }
        ],
        edges: [
            { id: 'e1', source: 'input', target: 'search', animated: true },
            { id: 'e2', source: 'search', target: 'reason', animated: true },
            { id: 'e3', source: 'reason', target: 'report', animated: true },
            { id: 'e4', source: 'report', target: 'save', animated: true }
        ]
    },
    'competitive-intel': {
        id: 'competitive-intel', name: "Competitive Intelligence Bot", description: "Monitor competitors via web search, analyze strategy, and track in spreadsheet.", category: 'Sales',
        nodes: [
            { id: 'schedule', type: NodeType.SCHEDULE, position: { x: 50, y: 300 }, data: { label: 'Daily 9 AM', type: NodeType.SCHEDULE, cronExpression: '0 9 * * *' } },
            { id: 'search1', type: NodeType.WEB_SEARCH, position: { x: 350, y: 200 }, data: { label: 'Search Competitor A', type: NodeType.WEB_SEARCH, searchQuery: 'Competitor A news announcements', variableName: 'comp_a' } },
            { id: 'search2', type: NodeType.WEB_SEARCH, position: { x: 350, y: 400 }, data: { label: 'Search Competitor B', type: NodeType.WEB_SEARCH, searchQuery: 'Competitor B product updates', variableName: 'comp_b' } },
            { id: 'batch', type: NodeType.BATCH, position: { x: 650, y: 300 }, data: { label: 'Analyze Each', type: NodeType.BATCH, batchInputVariable: '[comp_a, comp_b]', batchPrompt: 'Summarize key strategic moves: {{item}}', variableName: 'summaries' } },
            { id: 'reason', type: NodeType.REASONING, position: { x: 950, y: 300 }, data: { label: 'Strategic Analysis', type: NodeType.REASONING, reasoningGoal: 'Analyze competitor moves and identify threats and opportunities for our business', thinkingStyle: 'tree-of-thought', variableName: 'insights' } },
            { id: 'sheet', type: NodeType.SHEETS, position: { x: 1250, y: 200 }, data: { label: 'Log to Sheet', type: NodeType.SHEETS, operation: 'append', content: '["{{insights.answer}}"]' } },
            { id: 'slack', type: NodeType.SLACK, position: { x: 1250, y: 400 }, data: { label: 'Alert Team', type: NodeType.SLACK, slackChannel: '#strategy', content: '🚨 Competitive Intel Update:\n{{insights.answer}}' } }
        ],
        edges: [
            { id: 'e1', source: 'schedule', target: 'search1', animated: true },
            { id: 'e2', source: 'schedule', target: 'search2', animated: true },
            { id: 'e3', source: 'search1', target: 'batch' },
            { id: 'e4', source: 'search2', target: 'batch' },
            { id: 'e5', source: 'batch', target: 'reason', animated: true },
            { id: 'e6', source: 'reason', target: 'sheet' },
            { id: 'e7', source: 'reason', target: 'slack' }
        ]
    },
    'customer-insights': {
        id: 'customer-insights', name: "Customer Feedback Analyzer", description: "Batch process customer feedback with reasoning, categorize issues, and update tracking sheet.", category: 'Other',
        nodes: [
            { id: 'sheet-read', type: NodeType.SHEETS, position: { x: 50, y: 300 }, data: { label: 'Read Feedback', type: NodeType.SHEETS, operation: 'read', sheetRange: 'A2:A100', variableName: 'feedback_list' } },
            { id: 'batch', type: NodeType.BATCH, position: { x: 350, y: 300 }, data: { label: 'Analyze Each', type: NodeType.BATCH, batchInputVariable: 'feedback_list', batchPrompt: 'Categorize this feedback as: Bug, Feature Request, or Praise. Feedback: {{item}}', variableName: 'categories' } },
            { id: 'reason', type: NodeType.REASONING, position: { x: 650, y: 300 }, data: { label: 'Identify Patterns', type: NodeType.REASONING, reasoningGoal: 'Analyze all categorized feedback and identify the top 3 most critical issues or feature requests', thinkingStyle: 'chain-of-thought', context: '{{categories}}', variableName: 'priorities' } },
            { id: 'router', type: NodeType.ROUTER, position: { x: 950, y: 300 }, data: { label: 'Route by Urgency', type: NodeType.ROUTER, content: '{{priorities.answer}} contains "critical" ? "URGENT" : "NORMAL"' } },
            { id: 'slack-urgent', type: NodeType.SLACK, position: { x: 1250, y: 200 }, data: { label: 'Alert Product', type: NodeType.SLACK, slackChannel: '#product-urgent', content: '🔥 Critical Issues Found:\n{{priorities.answer}}' } },
            { id: 'sheet-write', type: NodeType.SHEETS, position: { x: 1250, y: 400 }, data: { label: 'Update Tracker', type: NodeType.SHEETS, operation: 'append', content: '["{{priorities.answer}}"]' } }
        ],
        edges: [
            { id: 'e1', source: 'sheet-read', target: 'batch', animated: true },
            { id: 'e2', source: 'batch', target: 'reason', animated: true },
            { id: 'e3', source: 'reason', target: 'router', animated: true },
            { id: 'e4', source: 'router', target: 'slack-urgent', sourceHandle: 'URGENT' },
            { id: 'e5', source: 'router', target: 'sheet-write', sourceHandle: 'default' }
        ]
    },
    'market-research': {
        id: 'market-research', name: "Market Research Automation", description: "Search market data, reason about trends, generate insights, and create presentation.", category: 'Marketing',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 300 }, data: { label: 'Market/Industry', type: NodeType.INPUT, content: 'SaaS automation tools', variableName: 'market' } },
            { id: 'search-trends', type: NodeType.WEB_SEARCH, position: { x: 350, y: 200 }, data: { label: 'Search Trends', type: NodeType.WEB_SEARCH, searchQuery: '{{market}} market trends 2024', variableName: 'trends' } },
            { id: 'search-size', type: NodeType.WEB_SEARCH, position: { x: 350, y: 400 }, data: { label: 'Market Size', type: NodeType.WEB_SEARCH, searchQuery: '{{market}} market size revenue', variableName: 'size_data' } },
            { id: 'reason', type: NodeType.REASONING, position: { x: 650, y: 300 }, data: { label: 'Market Analysis', type: NodeType.REASONING, reasoningGoal: 'Analyze market trends and size data to identify: 1) Growth opportunities, 2) Key players, 3) Market gaps', thinkingStyle: 'step-by-step', context: 'Trends: {{trends}}\nSize: {{size_data}}', variableName: 'analysis' } },
            { id: 'vision', type: NodeType.AI_VISION, position: { x: 950, y: 200 }, data: { label: 'Analyze Chart', type: NodeType.AI_VISION, imageUrl: 'https://example.com/market-chart.png', content: 'Extract key data points from this market chart', variableName: 'chart_data' } },
            { id: 'report', type: NodeType.LLM, position: { x: 1250, y: 300 }, data: { label: 'Create Report', type: NodeType.LLM, provider: 'openai', model: 'gpt-4o', content: 'Create an executive market research report combining:\nAnalysis: {{analysis.answer}}\nChart Data: {{chart_data}}\n\nFormat as presentation slides.', variableName: 'presentation' } },
            { id: 'email', type: NodeType.EMAIL, position: { x: 1550, y: 300 }, data: { label: 'Send to Team', type: NodeType.EMAIL, emailTo: 'team@company.com', emailSubject: 'Market Research: {{market}}', content: '{{presentation}}' } }
        ],
        edges: [
            { id: 'e1', source: 'input', target: 'search-trends' },
            { id: 'e2', source: 'input', target: 'search-size' },
            { id: 'e3', source: 'search-trends', target: 'reason' },
            { id: 'e4', source: 'search-size', target: 'reason' },
            { id: 'e5', source: 'reason', target: 'vision', animated: true },
            { id: 'e6', source: 'vision', target: 'report' },
            { id: 'e7', source: 'reason', target: 'report', animated: true },
            { id: 'e8', source: 'report', target: 'email', animated: true }
        ]
    },
    'content-pipeline': {
        id: 'content-pipeline', name: "Content Creation Pipeline", description: "Research topic via web search, reason about angles, batch generate content, review quality.", category: 'Marketing',
        nodes: [
            { id: 'input', type: NodeType.INPUT, position: { x: 50, y: 300 }, data: { label: 'Content Topics', type: NodeType.INPUT, content: '["AI agents", "Workflow automation", "No-code tools"]', variableName: 'topics' } },
            { id: 'batch-search', type: NodeType.BATCH, position: { x: 350, y: 300 }, data: { label: 'Research Each', type: NodeType.BATCH, batchInputVariable: 'topics', batchPrompt: 'Search: {{item}} latest news', variableName: 'research' } },
            { id: 'reason', type: NodeType.REASONING, position: { x: 650, y: 300 }, data: { label: 'Content Strategy', type: NodeType.REASONING, reasoningGoal: 'For each topic, determine the best content angle that will resonate with our audience based on research', thinkingStyle: 'tree-of-thought', context: '{{research}}', variableName: 'strategy' } },
            { id: 'batch-write', type: NodeType.BATCH, position: { x: 950, y: 300 }, data: { label: 'Write Articles', type: NodeType.BATCH, batchInputVariable: 'topics', batchPrompt: 'Write a 500-word article about {{item}} using this angle: {{strategy.answer}}', variableName: 'articles' } },
            { id: 'condition', type: NodeType.CONDITION, position: { x: 1250, y: 300 }, data: { label: 'Quality Check', type: NodeType.CONDITION, condition: 'articles.length >= 3' } },
            { id: 'sheet', type: NodeType.SHEETS, position: { x: 1550, y: 200 }, data: { label: 'Save Content', type: NodeType.SHEETS, operation: 'append', content: '{{articles}}' } },
            { id: 'slack', type: NodeType.SLACK, position: { x: 1550, y: 400 }, data: { label: 'Notify Team', type: NodeType.SLACK, content: '✅ {{articles.length}} articles ready for review!' } }
        ],
        edges: [
            { id: 'e1', source: 'input', target: 'batch-search', animated: true },
            { id: 'e2', source: 'batch-search', target: 'reason', animated: true },
            { id: 'e3', source: 'reason', target: 'batch-write', animated: true },
            { id: 'e4', source: 'batch-write', target: 'condition', animated: true },
            { id: 'e5', source: 'condition', target: 'sheet', sourceHandle: 'true' },
            { id: 'e6', source: 'condition', target: 'slack', sourceHandle: 'true' }
        ]
    },
    'data-enrichment': {
        id: 'data-enrichment', name: "Lead Enrichment Engine", description: "Read leads from sheet, search web for company data, reason about fit, score and update sheet.", category: 'Sales',
        nodes: [
            { id: 'read', type: NodeType.SHEETS, position: { x: 50, y: 300 }, data: { label: 'Read Leads', type: NodeType.SHEETS, operation: 'read', sheetRange: 'A2:B100', variableName: 'leads' } },
            { id: 'batch-search', type: NodeType.BATCH, position: { x: 350, y: 300 }, data: { label: 'Enrich Data', type: NodeType.BATCH, batchInputVariable: 'leads', batchPrompt: 'Search for company info: {{item.company}}', variableName: 'company_data' } },
            { id: 'batch-reason', type: NodeType.BATCH, position: { x: 650, y: 300 }, data: { label: 'Score Fit', type: NodeType.BATCH, batchInputVariable: 'company_data', batchPrompt: 'Based on this company data, score the lead fit 0-100 and explain why: {{item}}', variableName: 'scores' } },
            { id: 'router', type: NodeType.ROUTER, position: { x: 950, y: 300 }, data: { label: 'Segment Leads', type: NodeType.ROUTER, content: '{{scores}} > 80 ? "HOT" : {{scores}} > 50 ? "WARM" : "COLD"' } },
            { id: 'sheet-hot', type: NodeType.SHEETS, position: { x: 1250, y: 100 }, data: { label: 'Hot Leads Sheet', type: NodeType.SHEETS, sheetId: 'hot_leads', operation: 'append' } },
            { id: 'slack-hot', type: NodeType.SLACK, position: { x: 1250, y: 200 }, data: { label: 'Alert Sales', type: NodeType.SLACK, slackChannel: '#sales-hot', content: '🔥 New hot leads ready!' } },
            { id: 'sheet-warm', type: NodeType.SHEETS, position: { x: 1250, y: 350 }, data: { label: 'Warm Leads Sheet', type: NodeType.SHEETS, sheetId: 'warm_leads', operation: 'append' } },
            { id: 'sheet-cold', type: NodeType.SHEETS, position: { x: 1250, y: 500 }, data: { label: 'Cold Leads Sheet', type: NodeType.SHEETS, sheetId: 'cold_leads', operation: 'append' } }
        ],
        edges: [
            { id: 'e1', source: 'read', target: 'batch-search', animated: true },
            { id: 'e2', source: 'batch-search', target: 'batch-reason', animated: true },
            { id: 'e3', source: 'batch-reason', target: 'router', animated: true },
            { id: 'e4', source: 'router', target: 'sheet-hot', sourceHandle: 'HOT' },
            { id: 'e5', source: 'router', target: 'slack-hot', sourceHandle: 'HOT' },
            { id: 'e6', source: 'router', target: 'sheet-warm', sourceHandle: 'WARM' },
            { id: 'e7', source: 'router', target: 'sheet-cold', sourceHandle: 'default' }
        ]
    },
    'whatsapp-receptionist': {
        id: 'whatsapp-receptionist', name: "WhatsApp AI Receptionist", description: "Auto-reply to customer messages on WhatsApp using AI and log inquiries to Google Sheets.", category: 'Sales',
        nodes: [
            { id: 'wa-trigger', type: NodeType.WHATSAPP_TRIGGER, position: { x: 50, y: 300 }, data: { label: 'WhatsApp Inbound', type: NodeType.WHATSAPP_TRIGGER, whatsappVerifyToken: 'bloope-verify-token', whatsappPhoneNumberId: '10928374829', variableName: 'message' } },
            { id: 'ai-reply', type: NodeType.LLM, position: { x: 350, y: 300 }, data: { label: 'Draft AI Reply', type: NodeType.LLM, provider: 'gemini', model: 'gemini-3.1-flash-lite-preview', content: 'Draft a polite customer response for: {{message.text}}. Keep it short.', variableName: 'reply' } },
            { id: 'wa-send', type: NodeType.WHATSAPP_SEND, position: { x: 650, y: 300 }, data: { label: 'WhatsApp Reply', type: NodeType.WHATSAPP_SEND, whatsappPhone: '{{message.from}}', whatsappMessageType: 'text', whatsappBodyText: '{{reply}}' } },
            { id: 'sheet-log', type: NodeType.SHEETS, position: { x: 950, y: 300 }, data: { label: 'Log Inquiry', type: NodeType.SHEETS, operation: 'append', content: '{"Customer": "{{message.sender}}", "Message": "{{message.text}}", "Reply": "{{reply}}"}' } }
        ],
        edges: [
            { id: 'e1', source: 'wa-trigger', target: 'ai-reply', animated: true },
            { id: 'e2', source: 'ai-reply', target: 'wa-send', animated: true },
            { id: 'e3', source: 'wa-send', target: 'sheet-log', animated: true }
        ]
    },
    'razorpay-captured-whatsapp': {
        id: 'razorpay-captured-whatsapp', name: "Razorpay Alert to WhatsApp", description: "Send automated WhatsApp confirmation to customer when payment is captured.", category: 'Sales',
        nodes: [
            { id: 'rp-trigger', type: NodeType.RAZORPAY_TRIGGER, position: { x: 50, y: 300 }, data: { label: 'Payment Captured', type: NodeType.RAZORPAY_TRIGGER, razorpayEvent: 'payment.captured', variableName: 'payment' } },
            { id: 'wa-send', type: NodeType.WHATSAPP_SEND, position: { x: 350, y: 300 }, data: { label: 'Send WhatsApp Nudge', type: NodeType.WHATSAPP_SEND, whatsappPhone: '{{payment.contact}}', whatsappMessageType: 'text', whatsappBodyText: 'Hi! We received your payment of Rs. {{payment.amount}} for Payment ID {{payment.paymentId}}. Thank you!' } }
        ],
        edges: [
            { id: 'e1', source: 'rp-trigger', target: 'wa-send', animated: true }
        ]
    },
    'daily-digest-whatsapp': {
        id: 'daily-digest-whatsapp', name: "Daily Sales Summary to WhatsApp", description: "Cron schedule to summarize dashboard metrics using AI and send to owner WhatsApp.", category: 'Marketing',
        nodes: [
            { id: 'cron', type: NodeType.SCHEDULE, position: { x: 50, y: 300 }, data: { label: 'Daily 9 AM', type: NodeType.SCHEDULE, cronExpression: '0 9 * * *' } },
            { id: 'ai-digest', type: NodeType.LLM, position: { x: 350, y: 300 }, data: { label: 'Summarize Sales', type: NodeType.LLM, provider: 'openai', model: 'gpt-4o-mini', content: 'Generate a brief morning digest of yesterday sales stats.', variableName: 'digest' } },
            { id: 'wa-send', type: NodeType.WHATSAPP_SEND, position: { x: 650, y: 300 }, data: { label: 'WhatsApp Owner', type: NodeType.WHATSAPP_SEND, whatsappPhone: '919876543210', whatsappMessageType: 'text', whatsappBodyText: '{{digest}}' } }
        ],
        edges: [
            { id: 'e1', source: 'cron', target: 'ai-digest', animated: true },
            { id: 'e2', source: 'ai-digest', target: 'wa-send', animated: true }
        ]
    },
    'form-lead-whatsapp': {
        id: 'form-lead-whatsapp', name: "Form Lead Nudge to WhatsApp", description: "Qualify a public form lead using reasoning and notify team on WhatsApp.", category: 'Marketing',
        nodes: [
            { id: 'form', type: NodeType.FORM_TRIGGER, position: { x: 50, y: 300 }, data: { label: 'New Lead Form', type: NodeType.FORM_TRIGGER, formTitle: 'Inbound Contact', variableName: 'lead' } },
            { id: 'reason', type: NodeType.REASONING, position: { x: 350, y: 300 }, data: { label: 'Evaluate Fit', type: NodeType.REASONING, reasoningGoal: 'Evaluate lead data: Name: {{lead.name}}, Email: {{lead.email}}. Determine if hot or cold.', variableName: 'analysis' } },
            { id: 'wa-send', type: NodeType.WHATSAPP_SEND, position: { x: 650, y: 300 }, data: { label: 'WhatsApp Team', type: NodeType.WHATSAPP_SEND, whatsappPhone: '919876543210', whatsappMessageType: 'text', whatsappBodyText: 'New lead fit analysis: {{analysis.answer}}' } }
        ],
        edges: [
            { id: 'e1', source: 'form', target: 'reason', animated: true },
            { id: 'e2', source: 'reason', target: 'wa-send', animated: true }
        ]
    },
    'abandoned-payment-whatsapp': {
        id: 'abandoned-payment-whatsapp', name: "Abandoned Cart Payment Recovery", description: "Send WhatsApp recovery nudge 1 hour after failed Razorpay payment.", category: 'Sales',
        nodes: [
            { id: 'failed-trigger', type: NodeType.RAZORPAY_TRIGGER, position: { x: 50, y: 300 }, data: { label: 'Payment Failed', type: NodeType.RAZORPAY_TRIGGER, razorpayEvent: 'payment.failed', variableName: 'failed' } },
            { id: 'wait', type: NodeType.WAIT, position: { x: 350, y: 300 }, data: { label: 'Wait 1 Hour', type: NodeType.WAIT, waitTimeMs: 3600000 } },
            { id: 'wa-send', type: NodeType.WHATSAPP_SEND, position: { x: 650, y: 300 }, data: { label: 'WhatsApp Checkout Recovery', type: NodeType.WHATSAPP_SEND, whatsappPhone: '{{failed.contact}}', whatsappMessageType: 'text', whatsappBodyText: 'Hi! We noticed your checkout transaction failed. Complete it here: https://blupe.space/checkout?pay={{failed.paymentId}}' } }
        ],
        edges: [
            { id: 'e1', source: 'failed-trigger', target: 'wait', animated: true },
            { id: 'e2', source: 'wait', target: 'wa-send', animated: true }
        ]
    },
    'telegram-feedback-sheets': {
        id: 'telegram-feedback-sheets', name: "Telegram Feedback Logging", description: "Log customer feedback sent to Telegram bot to Google Sheets and reply automatically.", category: 'Other',
        nodes: [
            { id: 'tg-trigger', type: NodeType.TELEGRAM_TRIGGER, position: { x: 50, y: 300 }, data: { label: 'Telegram Inbound', type: NodeType.TELEGRAM_TRIGGER, variableName: 'message' } },
            { id: 'ai-sentiment', type: NodeType.LLM, position: { x: 350, y: 300 }, data: { label: 'Analyze Sentiment', type: NodeType.LLM, provider: 'gemini', model: 'gemini-3.1-flash-lite-preview', content: 'Classify sentiment (Positive/Negative) of: {{message.text}}', variableName: 'sentiment' } },
            { id: 'sheet-save', type: NodeType.SHEETS, position: { x: 650, y: 300 }, data: { label: 'Save Feedback', type: NodeType.SHEETS, operation: 'append', content: '{"User": "{{message.username}}", "Feedback": "{{message.text}}", "Sentiment": "{{sentiment}}"}' } },
            { id: 'tg-send', type: NodeType.TELEGRAM_SEND, position: { x: 950, y: 300 }, data: { label: 'Telegram Reply', type: NodeType.TELEGRAM_SEND, telegramChatId: '{{message.chatId}}', telegramMessage: 'Thanks for your feedback, {{message.firstName}}!' } }
        ],
        edges: [
            { id: 'e1', source: 'tg-trigger', target: 'ai-sentiment', animated: true },
            { id: 'e2', source: 'ai-sentiment', target: 'sheet-save', animated: true },
            { id: 'e3', source: 'sheet-save', target: 'tg-send', animated: true }
        ]
    },
    'upi-captured-slack': {
        id: 'upi-captured-slack', name: "Razorpay Captured Slack Nudge", description: "Post alert message to team Slack channel immediately upon Razorpay payment capture.", category: 'Sales',
        nodes: [
            { id: 'rp-captured', type: NodeType.RAZORPAY_TRIGGER, position: { x: 50, y: 300 }, data: { label: 'Razorpay Payment Captured', type: NodeType.RAZORPAY_TRIGGER, razorpayEvent: 'payment.captured', variableName: 'payment' } },
            { id: 'slack-nudge', type: NodeType.SLACK, position: { x: 350, y: 300 }, data: { label: 'Sales Alert', type: NodeType.SLACK, slackChannel: '#sales', content: '🎉 New payment of Rs. {{payment.amount}} received from {{payment.email}} (ID: {{payment.paymentId}})!' } }
        ],
        edges: [
            { id: 'e1', source: 'rp-captured', target: 'slack-nudge', animated: true }
        ]
    },
    'form-brochure-whatsapp': {
        id: 'form-brochure-whatsapp', name: "WhatsApp Brochure Delivery", description: "Send WhatsApp document brochure when a user submits their contact form details.", category: 'Marketing',
        nodes: [
            { id: 'form', type: NodeType.FORM_TRIGGER, position: { x: 50, y: 300 }, data: { label: 'Brochure Form', type: NodeType.FORM_TRIGGER, formTitle: 'Request Brochure', variableName: 'lead' } },
            { id: 'wa-send', type: NodeType.WHATSAPP_SEND, position: { x: 350, y: 300 }, data: { label: 'Send PDF Brochure', type: NodeType.WHATSAPP_SEND, whatsappPhone: '{{lead.phone}}', whatsappMessageType: 'media', whatsappMediaUrl: 'https://blupe.space/brochure.pdf' } }
        ],
        edges: [
            { id: 'e1', source: 'form', target: 'wa-send', animated: true }
        ]
    },
    'stripe-whatsapp-alert': {
        id: 'stripe-whatsapp-alert', name: "Stripe Alert to WhatsApp", description: "Notify financial owner on WhatsApp when Stripe payment is completed.", category: 'Sales',
        nodes: [
            { id: 'stripe-trigger', type: NodeType.WEBHOOK, position: { x: 50, y: 300 }, data: { label: 'Stripe Invoice Paid', type: NodeType.WEBHOOK, variableName: 'event' } },
            { id: 'wa-send', type: NodeType.WHATSAPP_SEND, position: { x: 350, y: 300 }, data: { label: 'CFO WhatsApp Alert', type: NodeType.WHATSAPP_SEND, whatsappPhone: '919876543210', whatsappMessageType: 'text', whatsappBodyText: 'Stripe Payment alert: Customer {{event.customer_email}} paid invoice total USD {{event.amount_paid}}.' } }
        ],
        edges: [
            { id: 'e1', source: 'stripe-trigger', target: 'wa-send', animated: true }
        ]
    },
    'refund-failed-subscription': {
        id: 'refund-failed-subscription', name: "Auto-Refund Failed Subscription", description: "Triggered on Razorpay failed subscription. Process partial refund or inspect logs and notify customer.", category: 'Dev',
        nodes: [
            { id: 'failed-trigger', type: NodeType.RAZORPAY_TRIGGER, position: { x: 50, y: 300 }, data: { label: 'Subscription Charged Failed', type: NodeType.RAZORPAY_TRIGGER, razorpayEvent: 'subscription.charged', variableName: 'sub' } },
            { id: 'fetch-payment', type: NodeType.RAZORPAY_ACTION, position: { x: 350, y: 300 }, data: { label: 'Fetch Payment Details', type: NodeType.RAZORPAY_ACTION, razorpayOperation: 'Fetch Payment', razorpayPaymentId: '{{sub.paymentId}}', variableName: 'payment' } },
            { id: 'refund', type: NodeType.RAZORPAY_ACTION, position: { x: 650, y: 300 }, data: { label: 'Auto Refund Payment', type: NodeType.RAZORPAY_ACTION, razorpayOperation: 'Issue Refund', razorpayPaymentId: '{{payment.id}}', razorpayAmount: '{{payment.amount}}' } },
            { id: 'email-customer', type: NodeType.EMAIL, position: { x: 950, y: 300 }, data: { label: 'Email Receipt', type: NodeType.EMAIL, emailTo: '{{payment.email}}', emailSubject: 'Refund Issued for Failed Subscription', content: 'We issued a refund of Rs. {{payment.amount}} for your failed subscription (Payment ID: {{payment.id}}).' } }
        ],
        edges: [
            { id: 'e1', source: 'failed-trigger', target: 'fetch-payment', animated: true },
            { id: 'e2', source: 'fetch-payment', target: 'refund', animated: true },
            { id: 'e3', source: 'refund', target: 'email-customer', animated: true }
        ]
    }
};
