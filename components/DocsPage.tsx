
import React, { useState } from 'react';
import { ArrowLeft, Book, Code, Sparkles, Layers, Shield, Zap, Globe, Table, Mail, Slack, GitFork, Calculator, FileText, Database, Lock, Hourglass, Rss, Braces, Type, Radio, Clock, Eye, Terminal, Menu, X, Coins, CreditCard, Cloud, Workflow, Play, Save, Upload, Download, Key, Users, CheckCircle2, ChevronRight, ChevronLeft, Search, Lightbulb, Wand2, Server, Cpu, BookOpen, Link2, MessageCircle, MessageSquare, Bot, History, Variable, PauseCircle, FormInput, Activity, AlertTriangle, Settings } from 'lucide-react';
import clsx from 'clsx';
import { NodeType } from '../types';

interface DocsPageProps {
    onBack: () => void;
}

type SectionKey = string;

interface DocSection {
    id: SectionKey;
    label: string;
    icon?: React.ElementType;
    isHeader?: boolean;
}

const SECTIONS: DocSection[] = [
    { id: 'start', label: "Getting Started", icon: Zap },

    { id: 'platform-header', label: "Platform", isHeader: true },
    { id: 'pricing', label: "Pricing & Plans", icon: CreditCard },
    { id: 'credits', label: "Credit System", icon: Coins },
    { id: 'secrets', label: "Secrets & Security", icon: Lock },
    { id: 'cloud-sync', label: "Cloud Sync", icon: Cloud },
    { id: 'execution', label: "How Runs Work", icon: Activity },
    { id: 'run-history', label: "Run History", icon: History },
    { id: 'variables', label: "Variables & Context", icon: Variable },

    { id: 'guides-header', label: "Guides", isHeader: true },
    { id: 'workflows', label: "Working with Workflows", icon: Workflow },
    { id: 'deployments', label: "Public Deployments", icon: Globe },

    { id: 'ai-header', label: "AI & Intelligence", isHeader: true },
    { id: 'ai-generator', label: "AI Flow Generator", icon: Wand2 },
    { id: 'node-llm', label: "LLM Node", icon: Sparkles },
    { id: 'node-reasoning', label: "Reasoning Node", icon: Lightbulb },
    { id: 'node-vision', label: "AI Vision", icon: Eye },
    { id: 'node-agent', label: "AI Agent", icon: Cpu },
    { id: 'node-batch', label: "Batch Processor", icon: Layers },

    { id: 'triggers-header', label: "Triggers", isHeader: true },
    { id: 'node-start', label: "Manual Start", icon: Play },
    { id: 'node-form', label: "Form Trigger", icon: FormInput },
    { id: 'node-webhook', label: "Webhook", icon: Radio },
    { id: 'node-schedule', label: "Schedule", icon: Clock },

    { id: 'logic-header', label: "Logic", isHeader: true },
    { id: 'node-router', label: "Router", icon: GitFork },
    { id: 'node-condition', label: "Condition", icon: GitFork },
    { id: 'node-wait', label: "Wait", icon: Hourglass },
    { id: 'node-approval', label: "Approval (HITL)", icon: PauseCircle },
    { id: 'node-code', label: "JavaScript", icon: Terminal },

    { id: 'data-header', label: "Data", isHeader: true },
    { id: 'node-json', label: "JSON", icon: Braces },
    { id: 'node-math', label: "Calculator", icon: Calculator },
    { id: 'node-text', label: "Text Tools", icon: Type },
    { id: 'node-input', label: "Input / Output", icon: Database },

    { id: 'integrations-header', label: "Integrations", isHeader: true },
    { id: 'node-api', label: "API Call", icon: Globe },
    { id: 'node-slack', label: "Slack", icon: Slack },
    { id: 'node-email', label: "Email", icon: Mail },
    { id: 'node-sheets', label: "Google Sheets", icon: Table },
    { id: 'node-web-search', label: "Web Search", icon: Search },
    { id: 'node-deep-research', label: "Deep Research", icon: BookOpen },
    { id: 'node-extract-url', label: "Extract URL", icon: FileText },
    { id: 'node-crawl-site', label: "Crawl Site", icon: Globe },
    { id: 'node-mcp', label: "MCP Tool", icon: Server },
    { id: 'node-hubspot', label: "HubSpot", icon: Users },
    { id: 'node-stripe', label: "Stripe", icon: CreditCard },
    { id: 'node-telegram', label: "Telegram Bots", icon: MessageCircle },
    { id: 'node-discord', label: "Discord Bots", icon: Bot },
    { id: 'node-whatsapp', label: "WhatsApp Cloud", icon: MessageSquare },
    { id: 'node-razorpay', label: "Razorpay Actions", icon: CreditCard },
];

export const DocsPage: React.FC<DocsPageProps> = ({ onBack }) => {
    const [activeSection, setActiveSection] = useState<SectionKey>('start');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Filter out headers for navigation calculations
    const navItems = SECTIONS.filter(s => !s.isHeader);
    const currentIndex = navItems.findIndex(s => s.id === activeSection);
    const prevItem = currentIndex > 0 ? navItems[currentIndex - 1] : null;
    const nextItem = currentIndex < navItems.length - 1 ? navItems[currentIndex + 1] : null;

    const handleNav = (id: string) => {
        setActiveSection(id);
        setMobileMenuOpen(false);
        const element = document.getElementById('docs-content-top');
        if (element) element.scrollIntoView({ behavior: 'smooth' });
    };

    const renderContent = () => {
        switch (activeSection) {
            case 'start':
                return (
                    <div className="space-y-8 animate-in fade-in duration-300">
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Introduction to Blupe</h1>
                            <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                                Blupe is a visual orchestration platform for AI workflows and autonomous agents.
                                Build pipelines on a canvas, run them securely in the cloud, and deploy them as public endpoints.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-brand-50 rounded-lg"><Workflow className="w-5 h-5 text-brand-600" /></div>
                                    <h3 className="font-bold text-slate-900">Visual Workflow Builder</h3>
                                </div>
                                <p className="text-sm text-slate-600">Drag and drop nodes to create AI pipelines. Connect LLMs, agents, APIs, logic, and messaging tools.</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-emerald-50 rounded-lg"><Server className="w-5 h-5 text-emerald-600" /></div>
                                    <h3 className="font-bold text-slate-900">Cloud Execution</h3>
                                </div>
                                <p className="text-sm text-slate-600">Every run executes on Blupe&apos;s Cloud Run engine — canvas tests, webhooks, schedules, and public flows use the same production runtime.</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-violet-50 rounded-lg"><Cpu className="w-5 h-5 text-violet-600" /></div>
                                    <h3 className="font-bold text-slate-900">Autonomous Agents</h3>
                                </div>
                                <p className="text-sm text-slate-600">AI Agent nodes plan, choose tools, and iterate (ReACT loop) until the goal is done — research, synthesis, email, and more.</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-amber-50 rounded-lg"><Shield className="w-5 h-5 text-amber-600" /></div>
                                    <h3 className="font-bold text-slate-900">Secrets &amp; Platform Keys</h3>
                                </div>
                                <p className="text-sm text-slate-600">Store encrypted user secrets, or use platform-provided keys (with standard credit rates). BYOK is always supported.</p>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-900 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Play className="w-5 h-5" /> Quick Start</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-slate-300 text-sm">
                                <li>Create a new workflow from the Dashboard</li>
                                <li>Drag nodes from the sidebar onto the canvas</li>
                                <li>Connect nodes by dragging from an output handle to an input handle</li>
                                <li>Configure each node in the property panel (goal, prompts, variables)</li>
                                <li>Optionally add your own API keys in <strong className="text-white">Secrets</strong> (or use platform keys)</li>
                                <li>Click <strong className="text-white">Run</strong> — status and logs update live as the cloud engine executes</li>
                                <li>Open <strong className="text-white">Run History</strong> to review past runs, credits, and node outputs</li>
                            </ol>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-brand-600" /> What to Read Next</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                                <li><strong>How Runs Work</strong> — cloud execution, live logs, and timeouts</li>
                                <li><strong>AI Agent</strong> — autonomous ReACT orchestration and tools</li>
                                <li><strong>Secrets &amp; Security</strong> — platform keys vs BYOK</li>
                                <li><strong>Variables &amp; Context</strong> — using <code className="bg-slate-100 px-1 rounded">{'{{variable}}'}</code> between nodes</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'pricing':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Pricing & Plans</h1>
                        <p className="text-slate-600">Choose the plan that fits your needs. All plans include full access to all nodes and integrations.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-6 bg-white border border-slate-200 rounded-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-bold text-slate-900">Starter</h3>
                                    <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">Free</span>
                                </div>
                                <ul className="space-y-3 text-sm text-slate-600 mb-6">
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> 500 Credits / month</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> 10 Active Workflows</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> All Node Types</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Local Secrets Storage</li>
                                    <li className="flex items-center gap-2 text-slate-400"><X className="w-4 h-4" /> Cloud Secret Sync</li>
                                    <li className="flex items-center gap-2 text-slate-400"><X className="w-4 h-4" /> Public Deployments</li>
                                </ul>
                                <p className="text-xs text-slate-500">Perfect for personal projects and experimentation.</p>
                            </div>

                            <div className="p-6 bg-slate-900 text-white border border-slate-800 rounded-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-2 text-[10px] font-bold bg-brand-500 text-white rounded-bl-lg">RECOMMENDED</div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-bold text-white">Pro</h3>
                                    <span className="text-lg font-bold">$20<span className="text-sm text-slate-400">/mo</span></span>
                                </div>
                                <ul className="space-y-3 text-sm text-slate-300 mb-6">
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 5,000+ Credits / month</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 50 Active Workflows</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> All Node Types</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Cloud Secret Sync</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Public Deployments</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Version History</li>
                                    <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Priority Support</li>
                                </ul>
                                <p className="text-xs text-slate-400">Best for professionals and teams building production workflows.</p>
                            </div>
                        </div>
                    </div>
                );

            case 'credits':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Credit System</h1>
                        <p className="text-slate-600">Credits meter usage. They are deducted when a workflow runs on the cloud engine (canvas, webhook, schedule, or public).</p>

                        <div className="p-5 bg-brand-50 border border-brand-200 rounded-xl">
                            <h3 className="font-bold text-brand-800 mb-2 flex items-center gap-2"><Coins className="w-4 h-4" /> How Credits Work</h3>
                            <p className="text-sm text-brand-700 mb-2">
                                Each production run starts with a <strong>base fee of 10 credits</strong>. Node-specific costs are added on top.
                            </p>
                            <div className="bg-white/50 p-3 rounded-lg text-xs space-y-2">
                                <p><strong>Platform Mode (default):</strong> Blupe provides model/API keys for supported providers. You pay the model-specific rates below.</p>
                                <p><strong>BYOK Mode:</strong> You store your own keys in Secrets. Most AI nodes cost a flat <strong>3 credits</strong> (email remains 5).</p>
                            </div>
                        </div>

                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left font-bold text-slate-700">Action / Model</th>
                                        <th className="px-6 py-3 text-left font-bold text-slate-700">Credit Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    <tr className="bg-slate-50/50"><td className="px-6 py-3 font-medium">Base workflow run</td><td className="px-6 py-3 font-mono font-bold text-slate-900">10</td></tr>
                                    <tr><td className="px-6 py-3">OpenAI GPT-5.1</td><td className="px-6 py-3 font-mono font-bold text-slate-900">20</td></tr>
                                    <tr><td className="px-6 py-3">OpenAI GPT-5 Mini</td><td className="px-6 py-3 font-mono font-bold text-slate-900">8</td></tr>
                                    <tr><td className="px-6 py-3">OpenAI GPT-5 Nano</td><td className="px-6 py-3 font-mono font-bold text-slate-900">4</td></tr>
                                    <tr><td className="px-6 py-3">Claude Opus 4.5</td><td className="px-6 py-3 font-mono font-bold text-slate-900">35</td></tr>
                                    <tr><td className="px-6 py-3">Claude Sonnet 4.5</td><td className="px-6 py-3 font-mono font-bold text-slate-900">8</td></tr>
                                    <tr><td className="px-6 py-3">Claude Haiku 4.5</td><td className="px-6 py-3 font-mono font-bold text-slate-900">4</td></tr>
                                    <tr><td className="px-6 py-3">Gemini 3.1 Pro Preview</td><td className="px-6 py-3 font-mono font-bold text-slate-900">12</td></tr>
                                    <tr><td className="px-6 py-3">Gemini Flash Lite</td><td className="px-6 py-3 font-mono font-bold text-slate-900">4</td></tr>
                                    <tr><td className="px-6 py-3">Llama 3.3 70B (Groq)</td><td className="px-6 py-3 font-mono font-bold text-slate-900">5</td></tr>
                                    <tr><td className="px-6 py-3">Llama 3.1 8B Instant</td><td className="px-6 py-3 font-mono font-bold text-slate-900">3</td></tr>
                                    <tr className="bg-slate-50/50"><td className="px-6 py-3 font-medium">AI Agent (orchestration base)</td><td className="px-6 py-3 font-mono font-bold text-slate-900">15</td></tr>
                                    <tr><td className="px-6 py-3">Agent tool call (any tool, agent pricing)</td><td className="px-6 py-3 font-mono font-bold text-slate-900">5 flat</td></tr>
                                    <tr><td className="px-6 py-3">Agent plan / decide LLM steps</td><td className="px-6 py-3 font-mono font-bold text-slate-900">~4 / ~6</td></tr>
                                    <tr><td className="px-6 py-3">Reasoning node</td><td className="px-6 py-3 font-mono font-bold text-slate-900">20 (3 BYOK)</td></tr>
                                    <tr><td className="px-6 py-3">Vision node</td><td className="px-6 py-3 font-mono font-bold text-slate-900">15</td></tr>
                                    <tr><td className="px-6 py-3">Deep Research (standalone node)</td><td className="px-6 py-3 font-mono font-bold text-slate-900">35</td></tr>
                                    <tr><td className="px-6 py-3">Crawl Site / Extract URL</td><td className="px-6 py-3 font-mono font-bold text-slate-900">25 / 10</td></tr>
                                    <tr><td className="px-6 py-3">Web Search</td><td className="px-6 py-3 font-mono font-bold text-slate-900">3</td></tr>
                                    <tr><td className="px-6 py-3">Email / WhatsApp send</td><td className="px-6 py-3 font-mono font-bold text-slate-900">5</td></tr>
                                    <tr><td className="px-6 py-3">API Call</td><td className="px-6 py-3 font-mono font-bold text-slate-900">2</td></tr>
                                    <tr><td className="px-6 py-3">Logic (JS, condition, router)</td><td className="px-6 py-3 font-mono font-bold text-slate-900">1</td></tr>
                                    <tr><td className="px-6 py-3">Triggers / Wait / Input / Output</td><td className="px-6 py-3 font-mono font-bold text-slate-900">0</td></tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="p-5 bg-violet-50 border border-violet-200 rounded-xl">
                            <h3 className="font-bold text-violet-800 mb-2 flex items-center gap-2"><Cpu className="w-4 h-4" /> Agent pricing note</h3>
                            <p className="text-sm text-violet-700">
                                Tools invoked <em>inside</em> an Agent use a flat <strong>5 credits per tool call</strong>, not the standalone node price
                                (for example deep research is 35 as a canvas node, but 5 when the agent calls it). Plan and decide steps add a small LLM fee each iteration.
                            </p>
                        </div>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2"><Lightbulb className="w-4 h-4" /> Tip</h3>
                            <p className="text-sm text-amber-700">
                                Prefer Flash / Haiku / Lite models for high-volume tasks. Use Pro / Opus only when the task needs deeper reasoning.
                            </p>
                        </div>
                    </div>
                );

            case 'secrets':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Secrets &amp; Security</h1>
                        <p className="text-slate-600">
                            Secrets power LLM providers, search, email, and integrations. Runs execute in the cloud, so keys must be available to the runner — either as your encrypted user secrets or as platform keys.
                        </p>

                        <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                                <Server className="w-5 h-5 text-emerald-700" />
                                <h3 className="font-bold text-emerald-800">Platform keys (no setup)</h3>
                            </div>
                            <p className="text-sm text-emerald-700 mb-3">
                                When you do not store a key for a provider, Blupe can use managed platform credentials for Gemini, OpenAI, Anthropic, Groq, Tavily, and related services.
                                Platform usage is metered at standard credit rates.
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-emerald-700">
                                <li>Works on canvas runs, webhooks, schedules, and public deployments</li>
                                <li>Keys are never shown in the UI or run logs</li>
                                <li>Ideal for getting started without configuring providers</li>
                            </ul>
                        </div>

                        <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                                <Key className="w-5 h-5 text-slate-700" />
                                <h3 className="font-bold text-slate-800">Your secrets (BYOK)</h3>
                            </div>
                            <p className="text-sm text-slate-600 mb-3">
                                Open <strong>Secrets</strong> from the editor and add keys. Values are stored encrypted server-side for your account and decrypted only during execution.
                                User secrets always take priority over platform keys when both exist.
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                                <li>Required for custom SMTP, private Slack tokens, HubSpot/Stripe/OAuth-linked credentials, and custom APIs</li>
                                <li>Lower AI credit rates in BYOK mode for many LLM nodes</li>
                                <li>Referenced in nodes as <code className="bg-white px-1 rounded border">{'{{env.KEY_NAME}}'}</code> where supported</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Common secret names</h3>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2 bg-slate-50 rounded font-mono">GEMINI_API_KEY / API_KEY</div>
                                <div className="p-2 bg-slate-50 rounded font-mono">OPENAI_API_KEY</div>
                                <div className="p-2 bg-slate-50 rounded font-mono">ANTHROPIC_API_KEY</div>
                                <div className="p-2 bg-slate-50 rounded font-mono">GROQ_API_KEY</div>
                                <div className="p-2 bg-slate-50 rounded font-mono">TAVILY_API_KEY</div>
                                <div className="p-2 bg-slate-50 rounded font-mono">SMTP_HOST / SMTP_USER / SMTP_PASS</div>
                                <div className="p-2 bg-slate-50 rounded font-mono">SLACK_WEBHOOK / SLACK_ACCESS_TOKEN</div>
                                <div className="p-2 bg-slate-50 rounded font-mono">TELEGRAM_BOT_TOKEN</div>
                            </div>
                        </div>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Security notes</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-amber-700">
                                <li>Do not paste secrets into node prompts or public deploy URLs</li>
                                <li>JavaScript nodes run in an isolated sandbox; only secrets your code references are forwarded when possible</li>
                                <li>OAuth integrations (Slack, Microsoft, etc.) store tokens separately under Settings when connected</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'cloud-sync':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Cloud Sync</h1>
                        <p className="text-slate-600">Sync your workflows, secrets, and run history across devices with Blupe Cloud.</p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-5 bg-white border border-slate-200 rounded-xl text-center">
                                <Save className="w-8 h-8 text-brand-600 mx-auto mb-3" />
                                <h3 className="font-bold text-slate-900 mb-1">Auto-Save</h3>
                                <p className="text-xs text-slate-500">Workflows save automatically to cloud when you hit Save</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl text-center">
                                <Users className="w-8 h-8 text-brand-600 mx-auto mb-3" />
                                <h3 className="font-bold text-slate-900 mb-1">Multi-Device</h3>
                                <p className="text-xs text-slate-500">Access your workflows from any browser, anywhere</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl text-center">
                                <GitFork className="w-8 h-8 text-brand-600 mx-auto mb-3" />
                                <h3 className="font-bold text-slate-900 mb-1">Version History</h3>
                                <p className="text-xs text-slate-500">Snapshots let you restore previous versions</p>
                            </div>
                        </div>

                        <div className="p-6 bg-slate-900 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-4">How Cloud Sync Works</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-slate-300 text-sm">
                                <li><strong className="text-white">Sign in with Google</strong> — Your account is created automatically</li>
                                <li><strong className="text-white">Create & Save Workflows</strong> — Click Save to sync to cloud</li>
                                <li><strong className="text-white">Take Snapshots</strong> — Use Menu → Save Snapshot to create restore points</li>
                                <li><strong className="text-white">Enable Secret Sync</strong> — Pro users can toggle Cloud Sync in Secrets modal</li>
                                <li><strong className="text-white">Deploy & Share</strong> — Generate public URLs for your workflows</li>
                            </ol>
                        </div>

                        <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl">
                            <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2"><Cloud className="w-4 h-4" /> Data stored in cloud</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-blue-700">
                                <li><strong>Workflows:</strong> Node configurations, connections, canvas layout</li>
                                <li><strong>Run History:</strong> Execution logs, timestamps, credit usage from cloud runs</li>
                                <li><strong>Secrets:</strong> Encrypted API keys for your account (used by the cloud runner)</li>
                                <li><strong>Versions:</strong> Named snapshots for rollback</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'workflows':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Working with Workflows</h1>
                        <p className="text-slate-600">Create, save, run, and manage AI workflows on the Blupe canvas.</p>

                        <div className="space-y-4">
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2"><Play className="w-4 h-4 text-brand-600" /> Running workflows</h3>
                                <p className="text-sm text-slate-600">
                                    Click <strong>Run</strong> in the toolbar. Execution is sent to Blupe&apos;s cloud workflow runner.
                                    Nodes light up as they run; agent nodes stream plan steps and tool observations live via Run History / node status.
                                    Canvas runs use production mode (full timeouts and credit metering), same as webhooks and schedules.
                                </p>
                            </div>

                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2"><Save className="w-4 h-4 text-brand-600" /> Saving &amp; snapshots</h3>
                                <p className="text-sm text-slate-600 mb-2">
                                    Click <strong>Save</strong> to persist the workflow to the cloud. Use <strong>Save Snapshot</strong> from the
                                    menu to create a named version you can restore later.
                                </p>
                                <p className="text-xs text-slate-500">Snapshots are stored with the workflow and visible in Version History.</p>
                            </div>

                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2"><Upload className="w-4 h-4 text-brand-600" /> Import &amp; export</h3>
                                <p className="text-sm text-slate-600">
                                    Export workflows as JSON to share or back up. Import JSON to restore or adopt workflows from others.
                                </p>
                            </div>

                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2"><Globe className="w-4 h-4 text-brand-600" /> Deploying public flows</h3>
                                <p className="text-sm text-slate-600">
                                    Click <strong>Deploy</strong> to publish a shareable URL. Guests can run the flow; credits are billed to the owner.
                                    Owner secrets and platform keys are applied server-side — visitors do not need your private keys.
                                </p>
                            </div>

                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2"><Settings className="w-4 h-4 text-brand-600" /> Triggers beyond Run</h3>
                                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                                    <li><strong>Webhook</strong> — HTTP POST/GET into a saved flow</li>
                                    <li><strong>Schedule</strong> — cron-based server runs</li>
                                    <li><strong>Form trigger</strong> — public form submissions</li>
                                    <li><strong>Messaging triggers</strong> — Telegram, WhatsApp, Discord, Razorpay events</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                );

            case 'deployments':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Public Deployments</h1>
                        <p className="text-slate-600">Share your workflows with anyone via a public URL.</p>

                        <div className="p-6 bg-gradient-to-r from-brand-500 to-indigo-500 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Globe className="w-5 h-5" /> One-click deploy</h3>
                            <p className="text-sm text-white/90">
                                Hit Deploy in the editor to publish a shareable URL. Guests open the page and run the flow on the same cloud engine as your canvas.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <h3 className="font-bold text-slate-900 mb-2">What guests experience</h3>
                                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                                    <li>Open the public link and submit / run</li>
                                    <li>No access to your private secrets or editor</li>
                                    <li>Results shown for that run only</li>
                                </ul>
                            </div>
                            <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <h3 className="font-bold text-emerald-900 mb-2">Owner billing &amp; keys</h3>
                                <ul className="list-disc pl-5 space-y-1 text-sm text-emerald-700">
                                    <li>Credits are deducted from the flow owner</li>
                                    <li>Owner secrets + platform keys are applied server-side</li>
                                    <li>BYOK keys still get the lower AI credit rates when present</li>
                                    <li>Daily public-run limits may apply on free plans</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                );

            // AI & Intelligence Nodes
            case 'ai-generator':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">AI Flow Generator</h1>
                        <p className="text-slate-600">Let AI build your workflows from natural language descriptions. Available via the floating button on the canvas.</p>

                        <div className="p-6 bg-gradient-to-r from-brand-500 to-purple-600 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2">How It Works</h3>
                            <p className="text-sm text-white/90">
                                Click the <Sparkles className="w-3.5 h-3.5 inline-block -mt-0.5 text-purple-400" /> button on the bottom-left of the canvas. Describe what you want to automate,
                                and AI will generate the nodes and connections for you.
                            </p>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Features</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>Context Aware:</strong> If you have existing nodes, AI can improve or extend them</li>
                                <li><strong>Smart Node Types:</strong> Correctly uses schedule nodes for cron jobs, LLM for AI, etc.</li>
                                <li><strong>Uses Gemini 2.5 Flash:</strong> Fast and intelligent flow generation</li>
                                <li><strong>10 Credits per generation:</strong> Includes validation and import</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Example Prompts</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">"Cron job every hour to fetch RSS and email summary"</div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">"API to Slack notification workflow"</div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">"Form trigger that sends data to Google Sheets"</div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">"Analyze customer feedback with AI reasoning"</div>
                            </div>
                        </div>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2">Pro Tip</h3>
                            <p className="text-sm text-amber-700">
                                Be specific about trigger types: say "cron" or "scheduled" for time-based triggers,
                                "webhook" for HTTP triggers, or "form" for input collection.
                            </p>
                        </div>
                    </div>
                );

            case 'node-reasoning':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Reasoning Node</h1>
                        <p className="text-slate-600">Advanced chain-of-thought reasoning for complex problem solving and agentic workflows.</p>

                        <div className="p-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2">Chain-of-Thought AI</h3>
                            <p className="text-sm text-white/90">
                                Unlike standard LLM nodes, the Reasoning node uses structured thinking to analyze problems step-by-step,
                                producing both a <strong>thinking trace</strong> and a <strong>final answer</strong>.
                            </p>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <ul className="space-y-2 text-sm text-slate-600">
                                <li><strong>Reasoning Goal:</strong> What you want the AI to figure out or analyze</li>
                                <li><strong>Thinking Style:</strong>
                                    <ul className="list-disc pl-5 mt-1 text-xs">
                                        <li><code className="bg-slate-100 px-1 rounded">chain-of-thought</code> — Step-by-step reasoning</li>
                                        <li><code className="bg-slate-100 px-1 rounded">tree-of-thought</code> — Explores multiple alternatives</li>
                                        <li><code className="bg-slate-100 px-1 rounded">step-by-step</code> — Structured approach</li>
                                    </ul>
                                </li>
                                <li><strong>Additional Context:</strong> Background info, constraints, or guidelines</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Output Structure</h3>
                            <div className="font-mono text-xs bg-slate-100 p-3 rounded">
                                <div className="text-slate-500">{'{'}</div>
                                <div className="ml-4"><span className="text-purple-600">"thinking"</span>: <span className="text-emerald-600">"Step 1: Analyzed input... Step 2: Evaluated options..."</span>,</div>
                                <div className="ml-4"><span className="text-purple-600">"answer"</span>: <span className="text-emerald-600">"Final conclusion based on reasoning"</span>,</div>
                                <div className="ml-4"><span className="text-purple-600">"goal"</span>: <span className="text-emerald-600">"Original goal"</span></div>
                                <div className="text-slate-500">{'}'}</div>
                            </div>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Use Cases</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>Complex Analysis:</strong> Analyze customer feedback, identify patterns</li>
                                <li><strong>Decision Making:</strong> Evaluate options with pros/cons reasoning</li>
                                <li><strong>Problem Solving:</strong> Debug issues, find root causes</li>
                                <li><strong>Planning:</strong> Create step-by-step action plans</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'node-llm':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">LLM Node</h1>
                        <p className="text-slate-600">Generate text using large language models from multiple providers.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Supported Providers & Models</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <strong className="text-slate-900 block mb-2">OpenAI</strong>
                                    <div className="text-slate-600 text-xs">GPT-5.1, GPT-5 Mini, GPT-5 Nano, GPT-4o</div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <strong className="text-slate-900 block mb-2">Anthropic</strong>
                                    <div className="text-slate-600 text-xs">Claude Opus 4.5, Sonnet 4.5, Haiku 4.5</div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <strong className="text-slate-900 block mb-2">Google Gemini</strong>
                                    <div className="text-slate-600 text-xs">Gemini 3 Pro Preview, Gemini 2.5 Flash, Gemini Flash Lite</div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <strong className="text-slate-900 block mb-2">Groq (Llama)</strong>
                                    <div className="text-slate-600 text-xs">Llama 3.3 70B, Llama 3.1 8B, OpenAI OSS Models</div>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <ul className="space-y-2 text-sm text-slate-600">
                                <li><strong>Provider:</strong> Select the AI provider to use</li>
                                <li><strong>Model:</strong> Choose the specific model</li>
                                <li><strong>Prompt:</strong> The text to send to the model. Use {"{{variable}}"} for dynamic values</li>
                                <li><strong>System Instruction:</strong> Optional context/persona for the model</li>
                                <li><strong>Temperature:</strong> Creativity level (0-1)</li>
                                <li><strong>Variable Name:</strong> Store output in a variable for later use</li>
                            </ul>
                        </div>

                        <div className="p-4 bg-slate-900 text-white rounded-xl font-mono text-sm">
                            <div className="text-slate-400 mb-2">// Example prompt with variables</div>
                            <div>Summarize this article: {"{{article_content}}"}</div>
                        </div>
                    </div>
                );

            case 'node-vision':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">AI Vision Node</h1>
                        <p className="text-slate-600">Analyze images using vision-capable AI models.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Use Cases</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li>Extract text from images (OCR)</li>
                                <li>Analyze invoices, receipts, documents</li>
                                <li>Describe image contents</li>
                                <li>Identify objects, faces, scenes</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <ul className="space-y-2 text-sm text-slate-600">
                                <li><strong>Image URL:</strong> Direct link to the image to analyze</li>
                                <li><strong>Prompt:</strong> What to extract or analyze from the image</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'node-batch':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Batch Processor Node</h1>
                        <p className="text-slate-600">Process arrays of items through an AI prompt.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">How It Works</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">
                                <li>Takes an array variable as input</li>
                                <li>Runs the prompt for each item in parallel</li>
                                <li>Returns an array of results</li>
                            </ol>
                        </div>

                        <div className="p-4 bg-slate-900 text-white rounded-xl font-mono text-sm">
                            <div className="text-slate-400 mb-2">// Use {"{{item}}"} to reference each array element</div>
                            <div>Summarize: {"{{item.title}}"}</div>
                        </div>
                    </div>
                );

            // Trigger Nodes
            case 'node-webhook':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Webhook Trigger</h1>
                        <p className="text-slate-600">Start workflows from external HTTP requests. Perfect for integrating with Stripe, GitHub, Typeform, Zapier, and any service that sends webhooks.</p>

                        <div className="p-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2">Two Components Work Together</h3>
                            <p className="text-sm text-white/90">
                                <strong>1. Webhook Node</strong> (from Sidebar → Triggers): The visual trigger that marks where your flow starts.<br />
                                <strong>2. Webhook Settings</strong> (<Link2 className="w-3.5 h-3.5 inline-block -mt-0.5" /> button in toolbar): Enables the endpoint and generates your unique URL.
                            </p>
                        </div>

                        {/* Setup Steps */}
                        <div className="p-6 bg-slate-900 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-4">Quick Setup</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-slate-300 text-sm">
                                <li><strong className="text-white">Add Webhook Node</strong> — Drag from Sidebar → Triggers onto canvas</li>
                                <li><strong className="text-white">Set Variable Name</strong> — e.g., <code className="bg-white/20 px-1 rounded">payload</code> (click node to configure)</li>
                                <li><strong className="text-white">Save the Flow</strong> — Required before enabling webhook</li>
                                <li><strong className="text-white">Enable Webhook</strong> — Click <Link2 className="w-3.5 h-3.5 inline-block -mt-0.5" /> in toolbar &rarr; Toggle Enable &rarr; Copy URL</li>
                                <li><strong className="text-white">Send Request</strong> — POST data to your webhook URL</li>
                                <li><strong className="text-white">Access Data</strong> — Use <code className="bg-white/20 px-1 rounded">{"{{payload.field}}"}</code> in downstream nodes</li>
                            </ol>
                        </div>

                        {/* Payload Access */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Accessing Payload Data</h3>
                            <p className="text-sm text-slate-600 mb-4">Data sent to your webhook is available via the variable name you set on the Webhook node:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                                    <div className="text-slate-500 mb-1">// Access root field</div>
                                    <div>{"{{payload.email}}"}</div>
                                </div>
                                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                                    <div className="text-slate-500 mb-1">// Nested data</div>
                                    <div>{"{{payload.user.name}}"}</div>
                                </div>
                                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                                    <div className="text-slate-500 mb-1">// Array access</div>
                                    <div>{"{{payload.items[0].id}}"}</div>
                                </div>
                                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                                    <div className="text-slate-500 mb-1">// Full JSON</div>
                                    <div>{"{{JSON.stringify(payload)}}"}</div>
                                </div>
                            </div>
                        </div>

                        {/* Webhook Metadata */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Webhook Metadata</h3>
                            <p className="text-sm text-slate-600 mb-4">Access request metadata via the <code className="bg-slate-100 px-1 rounded">_webhook</code> context object:</p>
                            <div className="space-y-2 text-xs font-mono">
                                <div className="p-2 bg-slate-50 rounded flex justify-between"><span>{"{{_webhook.method}}"}</span><span className="text-slate-400">GET, POST, PUT, DELETE</span></div>
                                <div className="p-2 bg-slate-50 rounded flex justify-between"><span>{"{{_webhook.timestamp}}"}</span><span className="text-slate-400">ISO timestamp of request</span></div>
                                <div className="p-2 bg-slate-50 rounded flex justify-between"><span>{"{{_webhook.query.param}}"}</span><span className="text-slate-400">Query string params</span></div>
                                <div className="p-2 bg-slate-50 rounded flex justify-between"><span>{"{{_webhook.headers['content-type']}}"}</span><span className="text-slate-400">Request headers</span></div>
                                <div className="p-2 bg-slate-50 rounded flex justify-between"><span>{"{{_webhook.ip}}"}</span><span className="text-slate-400">Client IP address</span></div>
                            </div>
                        </div>

                        {/* Authentication */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-amber-500" /> Authentication (Optional)</h3>
                            <p className="text-sm text-slate-600 mb-4">Protect your webhook with an API key. When set, requests must include the <code className="bg-slate-100 px-1 rounded">X-API-Key</code> header.</p>
                            <div className="p-4 bg-slate-900 text-white rounded-lg font-mono text-xs">
                                <div className="text-slate-400 mb-2"># cURL with API key</div>
                                <div>curl -X POST \</div>
                                <div className="ml-4">-H "Content-Type: application/json" \</div>
                                <div className="ml-4 text-emerald-400">-H "X-API-Key: your-secret-key" \</div>
                                <div className="ml-4">-d '{"{"}\"email\": \"user@example.com\"{"}"}' \</div>
                                <div className="ml-4">https://blupe.space/api/webhook/YOUR_FLOW_ID</div>
                            </div>
                        </div>

                        {/* Rate Limiting */}
                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2">Rate Limiting</h3>
                            <p className="text-sm text-amber-700 mb-2">
                                Webhooks are rate-limited to <strong>100 requests per hour</strong> per flow per IP address.
                            </p>
                            <p className="text-xs text-amber-600">
                                If you exceed this limit, you'll receive a <code className="bg-amber-100 px-1 rounded">429 Too Many Requests</code> response.
                            </p>
                        </div>

                        {/* Supported Methods */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Supported HTTP Methods</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                                    <div className="font-bold text-emerald-700">GET</div>
                                    <div className="text-xs text-emerald-600">Query params</div>
                                </div>
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                                    <div className="font-bold text-blue-700">POST</div>
                                    <div className="text-xs text-blue-600">JSON body</div>
                                </div>
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                                    <div className="font-bold text-amber-700">PUT</div>
                                    <div className="text-xs text-amber-600">Updates</div>
                                </div>
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                                    <div className="font-bold text-red-700">DELETE</div>
                                    <div className="text-xs text-red-600">Removals</div>
                                </div>
                            </div>
                        </div>

                        {/* Integration Examples */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-4">Integration Examples</h3>
                            <div className="space-y-4">
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <h4 className="font-bold text-slate-800 mb-2">Stripe Payments</h4>
                                    <p className="text-xs text-slate-600 mb-2">Access Stripe event data:</p>
                                    <div className="font-mono text-xs space-y-1">
                                        <div className="p-1.5 bg-white rounded">{"{{payload.type}}"} → <span className="text-slate-400">"payment_intent.succeeded"</span></div>
                                        <div className="p-1.5 bg-white rounded">{"{{payload.data.object.amount}}"} → <span className="text-slate-400">Amount in cents</span></div>
                                        <div className="p-1.5 bg-white rounded">{"{{payload.data.object.receipt_email}}"} → <span className="text-slate-400">Customer email</span></div>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <h4 className="font-bold text-slate-800 mb-2">GitHub Events</h4>
                                    <p className="text-xs text-slate-600 mb-2">Handle pull request and push events:</p>
                                    <div className="font-mono text-xs space-y-1">
                                        <div className="p-1.5 bg-white rounded">{"{{payload.action}}"} → <span className="text-slate-400">"opened", "closed", "merged"</span></div>
                                        <div className="p-1.5 bg-white rounded">{"{{payload.pull_request.title}}"} → <span className="text-slate-400">PR title</span></div>
                                        <div className="p-1.5 bg-white rounded">{"{{payload.sender.login}}"} → <span className="text-slate-400">GitHub username</span></div>
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                    <h4 className="font-bold text-slate-800 mb-2">Form Submissions (Typeform, Tally, etc.)</h4>
                                    <p className="text-xs text-slate-600 mb-2">Process form data:</p>
                                    <div className="font-mono text-xs space-y-1">
                                        <div className="p-1.5 bg-white rounded">{"{{payload.email}}"} → <span className="text-slate-400">Submitted email</span></div>
                                        <div className="p-1.5 bg-white rounded">{"{{payload.answers[0].text}}"} → <span className="text-slate-400">First answer</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Troubleshooting */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Troubleshooting</h3>
                            <div className="space-y-3 text-sm">
                                <div className="p-3 bg-red-50 border border-red-100 rounded-lg">
                                    <strong className="text-red-800">404 Not Found</strong>
                                    <p className="text-xs text-red-700 mt-1">Flow doesn't exist or webhook not enabled. Check Webhook Settings.</p>
                                </div>
                                <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg">
                                    <strong className="text-orange-800">401 Unauthorized</strong>
                                    <p className="text-xs text-orange-700 mt-1">API key is set but missing or incorrect in request header.</p>
                                </div>
                                <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                    <strong className="text-amber-800">429 Rate Limited</strong>
                                    <p className="text-xs text-amber-700 mt-1">Too many requests. Wait an hour or contact support.</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <h3 className="font-bold text-emerald-800 mb-2">Pro Tip</h3>
                            <p className="text-sm text-emerald-700">
                                Use <a href="https://webhook.site" target="_blank" rel="noopener noreferrer" className="underline font-medium">webhook.site</a> to test and inspect payloads before building your flow.
                                Then replicate the same structure in a Router or Condition node to handle different event types.
                            </p>
                        </div>
                    </div>
                );

            case 'node-schedule':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Schedule Trigger</h1>
                        <p className="text-slate-600">Run workflows automatically on a schedule using cron expressions.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Cron Format</h3>
                            <div className="font-mono text-sm bg-slate-100 p-3 rounded">minute hour day month weekday</div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2 bg-slate-50 rounded"><code>0 9 * * *</code> — Daily at 9 AM</div>
                                <div className="p-2 bg-slate-50 rounded"><code>0 * * * *</code> — Every hour</div>
                                <div className="p-2 bg-slate-50 rounded"><code>*/15 * * * *</code> — Every 15 min</div>
                                <div className="p-2 bg-slate-50 rounded"><code>0 9 * * 1</code> — Mondays at 9 AM</div>
                            </div>
                        </div>
                    </div>
                );

            // Logic Nodes
            case 'node-router':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Router Node</h1>
                        <p className="text-slate-600">Route flow to different branches based on a dynamic value. Perfect for building multi-path workflows.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">How It Works</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">
                                <li>Evaluates the content/variable to get a route value (e.g., "A", "B", or any string)</li>
                                <li>Connects to multiple output handles labeled A, B, and default</li>
                                <li>Only the branch matching the route value continues execution</li>
                                <li>If no match, the "default" branch is used</li>
                            </ol>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Use Cases</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>A/B Testing:</strong> Route users to different experiences</li>
                                <li><strong>Content Classification:</strong> Route based on AI-detected content type</li>
                                <li><strong>Language Detection:</strong> Different processing for different languages</li>
                                <li><strong>Priority Routing:</strong> VIP vs standard customer handling</li>
                            </ul>
                        </div>

                        <div className="p-4 bg-slate-900 text-white rounded-xl font-mono text-sm">
                            <div className="text-slate-400 mb-2">// Example: Route based on sentiment</div>
                            <div>{"{{sentiment}}"} <span className="text-emerald-400">→ outputs: "positive", "negative", "neutral"</span></div>
                        </div>
                    </div>
                );

            case 'node-condition':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Condition Node</h1>
                        <p className="text-slate-600">Branch your workflow based on true/false conditions. Essential for decision-making logic.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Condition Syntax</h3>
                            <p className="text-sm text-slate-600 mb-3">Write JavaScript expressions that evaluate to true or false:</p>
                            <div className="space-y-2 font-mono text-xs">
                                <div className="p-2 bg-slate-100 rounded">context.score {">"}= 80</div>
                                <div className="p-2 bg-slate-100 rounded">context.status === "approved"</div>
                                <div className="p-2 bg-slate-100 rounded">context.items.length {">"}  0</div>
                                <div className="p-2 bg-slate-100 rounded">context.user.role === "admin" || context.user.isPremium</div>
                            </div>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Output Handles</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>True Handle:</strong> Flow continues here when condition is true</li>
                                <li><strong>False Handle:</strong> Flow continues here when condition is false</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2">Pro Tip</h3>
                            <p className="text-sm text-amber-700">You can access any previous node's output using <code className="bg-amber-100 px-1 rounded">context.nodeId</code> or <code className="bg-amber-100 px-1 rounded">context.variableName</code>.</p>
                        </div>
                    </div>
                );

            case 'node-wait':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Wait Node</h1>
                        <p className="text-slate-600">Pause workflow execution for a specified duration. Useful for rate limiting, delays, and scheduling.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <p className="text-sm text-slate-600 mb-4">Enter duration in milliseconds (1000ms = 1 second)</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2 bg-slate-50 rounded"><code>1000</code> = 1 second</div>
                                <div className="p-2 bg-slate-50 rounded"><code>5000</code> = 5 seconds</div>
                                <div className="p-2 bg-slate-50 rounded"><code>60000</code> = 1 minute</div>
                                <div className="p-2 bg-slate-50 rounded"><code>300000</code> = 5 minutes</div>
                            </div>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Common Use Cases</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>API Rate Limiting:</strong> Add delay between API calls to avoid rate limits</li>
                                <li><strong>Cooldown Periods:</strong> Pause before sending follow-up emails</li>
                                <li><strong>Retry Logic:</strong> Wait before retrying a failed operation</li>
                                <li><strong>Animation Timing:</strong> Coordinate timed sequences</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'node-code':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">JavaScript Node</h1>
                        <p className="text-slate-600">
                            Run custom JavaScript for data transforms. Code executes in Blupe&apos;s isolated cloud sandbox (not in the browser),
                            with a timeout and restricted capabilities.
                        </p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Available variables</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><code className="bg-slate-100 px-1 rounded">context</code> — previous node outputs keyed by node id or variable name</li>
                                <li><code className="bg-slate-100 px-1 rounded">secrets</code> — secrets your code references (e.g. <code className="bg-slate-100 px-1 rounded">secrets.OPENAI_API_KEY</code>)</li>
                            </ul>
                        </div>

                        <div className="p-4 bg-slate-900 text-white rounded-xl font-mono text-sm space-y-4">
                            <div>
                                <div className="text-slate-400 mb-1">// Transform array data</div>
                                <div>const doubled = context.data.map(x ={">"}  x * 2);</div>
                                <div>return doubled;</div>
                            </div>
                            <div className="border-t border-slate-700 pt-4">
                                <div className="text-slate-400 mb-1">// Parse and extract nested JSON</div>
                                <div>const response = JSON.parse(context.apiResult);</div>
                                <div>return response.data.users.filter(u ={">"}  u.active);</div>
                            </div>
                            <div className="border-t border-slate-700 pt-4">
                                <div className="text-slate-400 mb-1">// Make async API calls</div>
                                <div>const res = await fetch('https://api.example.com/data');</div>
                                <div>return await res.json();</div>
                            </div>
                        </div>

                        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <h3 className="font-bold text-emerald-800 mb-2">Async/Await Supported</h3>
                            <p className="text-sm text-emerald-700">Your code runs inside an async function, so you can use <code className="bg-emerald-100 px-1 rounded">await</code> for promises and async operations.</p>
                        </div>
                    </div>
                );

            // Data Nodes
            case 'node-json':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">JSON Node</h1>
                        <p className="text-slate-600">Parse, stringify, or extract data from JSON structures. Essential for working with API responses.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Operations</h3>
                            <ul className="list-disc pl-5 space-y-3 text-sm text-slate-600">
                                <li><strong>Parse:</strong> Convert a JSON string to a JavaScript object<br /><code className="text-xs bg-slate-100 px-1 rounded">'{`{"name": "John"}`}' → {`{name: "John"}`}</code></li>
                                <li><strong>Stringify:</strong> Convert an object back to a JSON string<br /><code className="text-xs bg-slate-100 px-1 rounded">{`{name: "John"}`} → '{`{"name": "John"}`}'</code></li>
                                <li><strong>Extract:</strong> Get specific fields using dot notation<br /><code className="text-xs bg-slate-100 px-1 rounded">response.data.users[0].name</code></li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Common Patterns</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li>Extract data from API responses</li>
                                <li>Prepare payloads for POST requests</li>
                                <li>Transform nested data structures</li>
                                <li>Combine multiple data sources</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'node-math':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Calculator Node</h1>
                        <p className="text-slate-600">Perform mathematical calculations and transformations on numeric data.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Supported Operations</h3>
                            <p className="text-sm text-slate-600 mb-3">Write JavaScript math expressions using variables:</p>
                            <div className="space-y-2 font-mono text-xs">
                                <div className="p-2 bg-slate-100 rounded flex justify-between"><span>{"{{a}}"} + {"{{b}}"} * 2</span><span className="text-slate-500">// Basic math</span></div>
                                <div className="p-2 bg-slate-100 rounded flex justify-between"><span>Math.round({"{{price}}"} * 1.18)</span><span className="text-slate-500">// Tax calc</span></div>
                                <div className="p-2 bg-slate-100 rounded flex justify-between"><span>Math.max({"{{scores}}"}.split(','))</span><span className="text-slate-500">// Max value</span></div>
                                <div className="p-2 bg-slate-100 rounded flex justify-between"><span>({"{{total}}"} / {"{{count}}"}).toFixed(2)</span><span className="text-slate-500">// Average</span></div>
                            </div>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Built-in Math Functions</h3>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2 bg-slate-50 rounded"><code>Math.round()</code> - Round to nearest</div>
                                <div className="p-2 bg-slate-50 rounded"><code>Math.floor()</code> - Round down</div>
                                <div className="p-2 bg-slate-50 rounded"><code>Math.ceil()</code> - Round up</div>
                                <div className="p-2 bg-slate-50 rounded"><code>Math.abs()</code> - Absolute value</div>
                                <div className="p-2 bg-slate-50 rounded"><code>Math.min()</code> - Minimum value</div>
                                <div className="p-2 bg-slate-50 rounded"><code>Math.max()</code> - Maximum value</div>
                            </div>
                        </div>
                    </div>
                );

            // Integration Nodes
            case 'node-api':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">API Call Node</h1>
                        <p className="text-slate-600">Make HTTP requests to external APIs.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <ul className="space-y-2 text-sm text-slate-600">
                                <li><strong>URL:</strong> The API endpoint. Use {"{{env.API_KEY}}"} for secrets</li>
                                <li><strong>Method:</strong> GET, POST, PUT, DELETE</li>
                                <li><strong>Headers:</strong> JSON object with request headers</li>
                                <li><strong>Body:</strong> JSON payload for POST/PUT requests</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'node-slack':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Slack Node</h1>
                        <p className="text-slate-600">Send messages to Slack channels. Supports OAuth integration for easy setup or webhook URLs for quick configuration.</p>

                        <div className="p-6 bg-gradient-to-r from-[#4A154B] to-[#611E64] text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2">Two Integration Methods</h3>
                            <p className="text-sm text-white/90">
                                <strong>1. OAuth (Recommended):</strong> Connect your Slack workspace via Settings → Integrations. Automatically lists your channels.<br />
                                <strong>2. Webhook URL:</strong> Create an Incoming Webhook in Slack and paste the URL manually.
                            </p>
                        </div>

                        {/* OAuth Setup */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-[#4A154B]" /> OAuth Setup (Recommended)</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">
                                <li>Go to <strong>Settings → Integrations</strong></li>
                                <li>Click <strong>Connect Slack</strong></li>
                                <li>Authorize Blupe to access your workspace</li>
                                <li>In the Slack node, select a channel from the dropdown</li>
                            </ol>
                            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                <p className="text-xs text-emerald-700"><strong>Benefits:</strong> No webhook URL needed, channel picker, post to any public channel.</p>
                            </div>
                        </div>

                        {/* Webhook Setup */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Webhook URL Setup (Alternative)</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">
                                <li>Go to <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">Slack Incoming Webhooks</a></li>
                                <li>Create a webhook URL for your channel</li>
                                <li>Add to Secrets as <code className="bg-slate-100 px-1 rounded">SLACK_WEBHOOK</code></li>
                                <li>Configure channel and message in the node</li>
                            </ol>
                        </div>

                        {/* Message Formatting */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Message Formatting</h3>
                            <p className="text-sm text-slate-600 mb-4">Use Slack's markdown-like formatting in your messages:</p>
                            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                <div className="p-2 bg-slate-50 rounded"><code>*bold*</code> → <strong>bold</strong></div>
                                <div className="p-2 bg-slate-50 rounded"><code>_italic_</code> → <em>italic</em></div>
                                <div className="p-2 bg-slate-50 rounded"><code>`code`</code> → <code className="bg-slate-200 px-0.5 rounded">code</code></div>
                                <div className="p-2 bg-slate-50 rounded"><code>~strike~</code> → <s>strike</s></div>
                            </div>
                        </div>

                        {/* Variables */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Using Variables</h3>
                            <p className="text-sm text-slate-600 mb-3">Insert dynamic content from previous nodes:</p>
                            <div className="p-4 bg-slate-900 text-white rounded-lg font-mono text-xs">
                                <div className="text-slate-400 mb-2"># Example message template</div>
                                <div>*New Lead!*</div>
                                <div>Name: {"{{lead.name}}"}</div>
                                <div>Email: {"{{lead.email}}"}</div>
                                <div>Score: {"{{score}}"}/100</div>
                            </div>
                        </div>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2">Pro Tip</h3>
                            <p className="text-sm text-amber-700">
                                Use Slack's Block Kit (via Custom JSON Schema) for rich messages with buttons, images, and sections.
                            </p>
                        </div>
                    </div>
                );

            case 'node-email':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Email Node</h1>
                        <p className="text-slate-600">Send emails via SMTP using any email provider including Gmail, SendGrid, Resend, Mailgun, and more.</p>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Required Secrets</h3>
                            <p className="text-sm text-slate-600 mb-3">Add these to your Secrets in Settings:</p>
                            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                <div className="p-2 bg-slate-100 rounded">SMTP_HOST</div>
                                <div className="p-2 bg-slate-100 rounded">SMTP_HOST</div>
                                <div className="p-2 bg-slate-100 rounded">SMTP_USER</div>
                                <div className="p-2 bg-slate-100 rounded">SMTP_PASS</div>
                            </div>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Supported Providers</h3>
                            <div className="space-y-3 text-sm">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="font-bold text-slate-800 mb-1">SendGrid</div>
                                    <div className="text-xs text-slate-600 font-mono space-y-1">
                                        <div>SMTP_HOST: smtp.sendgrid.net</div>
                                        <div>SMTP_PORT: 587</div>
                                        <div>SMTP_USER: apikey</div>
                                        <div>SMTP_PASS: your_api_key</div>
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="font-bold text-slate-800 mb-1">Resend</div>
                                    <div className="text-xs text-slate-600 font-mono space-y-1">
                                        <div>SMTP_HOST: smtp.resend.com</div>
                                        <div>SMTP_PORT: 465</div>
                                        <div>SMTP_USER: resend</div>
                                        <div>SMTP_PASS: your_api_key</div>
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="font-bold text-slate-800 mb-1">Mailgun</div>
                                    <div className="text-xs text-slate-600 font-mono space-y-1">
                                        <div>SMTP_HOST: smtp.mailgun.org</div>
                                        <div>SMTP_PORT: 587</div>
                                        <div>SMTP_USER: your_mailgun_username</div>
                                        <div>SMTP_PASS: your_mailgun_password</div>
                                    </div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <div className="font-bold text-slate-800 mb-1">Gmail (App Password)</div>
                                    <div className="text-xs text-slate-600 font-mono space-y-1">
                                        <div>SMTP_HOST: smtp.gmail.com</div>
                                        <div>SMTP_PORT: 587</div>
                                        <div>SMTP_USER: your@gmail.com</div>
                                        <div>SMTP_PASS: your_app_password</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2">Important</h3>
                            <ul className="text-sm text-amber-700 space-y-1">
                                <li>Gmail requires an App Password (not your regular password). Generate one at <span className="font-mono bg-amber-100 px-1 rounded">myaccount.google.com/apppasswords</span></li>
                                <li>For production, we recommend SendGrid or Resend for reliable delivery.</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'node-sheets':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Google Sheets Node</h1>
                        <p className="text-slate-600">Read data from and append rows to Google Sheets. Supports OAuth for private sheets or public access for shared sheets.</p>

                        <div className="p-6 bg-gradient-to-r from-[#0F9D58] to-[#34A853] text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2">Two Operations</h3>
                            <p className="text-sm text-white/90">
                                <strong>Append Row:</strong> Add a new row of data to your sheet.<br />
                                <strong>Read Data:</strong> Fetch data from a specified range (e.g., A1:D10).
                            </p>
                        </div>

                        {/* OAuth Setup */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2"><Cloud className="w-4 h-4 text-[#4285F4]" /> OAuth Setup (For Private Sheets)</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">
                                <li>Go to <strong>Settings → Integrations</strong></li>
                                <li>Click <strong>Connect Google</strong></li>
                                <li>Grant access to Google Sheets</li>
                                <li>Your token is stored as <code className="bg-slate-100 px-1 rounded">GOOGLE_ACCESS_TOKEN</code></li>
                            </ol>
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-xs text-blue-700"><strong>Benefits:</strong> Access private sheets, fetch column headers dynamically.</p>
                            </div>
                        </div>

                        {/* Public Sheets */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Public Sheets (No Auth Required)</h3>
                            <p className="text-sm text-slate-600 mb-3">For publicly shared sheets, just paste the Sheet ID. No token needed.</p>
                            <div className="p-3 bg-slate-50 rounded-lg font-mono text-xs">
                                <div className="text-slate-400 mb-1"># Extract Sheet ID from URL:</div>
                                <div>https://docs.google.com/spreadsheets/d/<span className="text-emerald-600">1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs</span>/edit</div>
                            </div>
                        </div>

                        {/* Append Operation */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Append Row Operation</h3>
                            <p className="text-sm text-slate-600 mb-3">Add data as a new row. Format data as a JSON array:</p>
                            <div className="p-4 bg-slate-900 text-white rounded-lg font-mono text-xs">
                                <div className="text-slate-400 mb-2"># Row data format</div>
                                <div>["{`{{name}}`}", "{`{{email}}`}", "{`{{score}}`}"]</div>
                            </div>
                            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                <p className="text-xs text-emerald-700"><strong>Tip:</strong> Use "Fetch Headers" button to dynamically generate input fields based on your sheet's columns!</p>
                            </div>
                        </div>

                        {/* Read Operation */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Read Data Operation</h3>
                            <p className="text-sm text-slate-600 mb-3">Fetch data from a range. Returns a 2D array of values.</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2 bg-slate-50 rounded"><code>A1:D10</code> — First 10 rows</div>
                                <div className="p-2 bg-slate-50 rounded"><code>Sheet2!A:C</code> — All of cols A-C</div>
                            </div>
                        </div>
                    </div>
                );

            case 'node-web-search':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Web Search Node</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Search the web and get AI-summarized results using the Tavily API. Perfect for real-time information retrieval and research automation.
                        </p>

                        <div className="p-6 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2">AI-Powered Web Search</h3>
                            <p className="text-sm text-white/90">
                                The Web Search node uses Tavily&apos;s search engine to find relevant information from across the web,
                                then automatically summarizes the results for you. Get answers without manually browsing multiple sites.
                            </p>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <ul className="space-y-2 text-sm text-slate-600">
                                <li><strong>Search Query:</strong> The question or topic to search for. Supports variables like {'{{topic}}'}</li>
                                <li><strong>API Key:</strong> Add <code className="bg-slate-100 px-1 rounded font-mono text-xs">TAVILY_API_KEY</code> to Secrets (get one free at <a href="https://tavily.com" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">tavily.com</a>)</li>
                                <li><strong>Variable Name:</strong> Store the search result for use in subsequent nodes</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Use Cases</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>Research Automation:</strong> Gather information on specific topics automatically</li>
                                <li><strong>News Monitoring:</strong> Search for latest news about companies or events</li>
                                <li><strong>Competitor Analysis:</strong> Find information about competitors or market trends</li>
                                <li><strong>Content Enhancement:</strong> Add real-time data to AI-generated content</li>
                                <li><strong>Fact Checking:</strong> Verify information by searching the web</li>
                            </ul>
                        </div>

                        <div className="p-4 bg-slate-900 text-white rounded-xl font-mono text-sm">
                            <div className="text-slate-400 mb-2">// Example query with variables</div>
                            <div>Latest developments in {'{{technology}}'} for {'{{year}}'}</div>
                        </div>

                        <div className="p-5 bg-sky-50 border border-sky-200 rounded-xl">
                            <h3 className="font-bold text-sky-800 mb-2">Output Format</h3>
                            <p className="text-sm text-sky-700 mb-2">
                                The node returns an AI-generated summary of the search results, perfect for chaining into other AI nodes or displaying directly.
                            </p>
                            <p className="text-xs text-sky-600">
                                Combine with LLM nodes to further process or format the search results.
                            </p>
                        </div>
                    </div>
                );

            case 'node-deep-research':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Deep Research Node</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Perform advanced multi-source research on any topic using Tavily&apos;s deep search capabilities. Returns comprehensive summaries with source citations.
                        </p>

                        <div className="p-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2">Advanced Research Engine</h3>
                            <p className="text-sm text-white/90">
                                Unlike basic web search, Deep Research analyzes multiple sources in depth, cross-references information, and produces research-grade summaries with proper citations.
                            </p>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <ul className="space-y-2 text-sm text-slate-600">
                                <li><strong>Research Topic:</strong> The subject or question to research. Supports variables like {'{{topic}}'}</li>
                                <li><strong>Max Results:</strong> Number of sources to analyze (1-20, default: 10)</li>
                                <li><strong>API Key:</strong> Requires <code className="bg-slate-100 px-1 rounded font-mono text-xs">TAVILY_API_KEY</code> in Secrets</li>
                                <li><strong>Variable Name:</strong> Store the research output for use in subsequent nodes</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Output Structure</h3>
                            <div className="font-mono text-xs bg-slate-100 p-3 rounded">
                                <div className="text-slate-500">{'{'}</div>
                                <div className="ml-4"><span className="text-purple-600">"summary"</span>: <span className="text-emerald-600">"Comprehensive analysis of..."</span>,</div>
                                <div className="ml-4"><span className="text-purple-600">"sources"</span>: <span className="text-slate-500">[</span></div>
                                <div className="ml-8">{'{ "title": "Source 1", "url": "https://...", "snippet": "..." }'}</div>
                                <div className="ml-4"><span className="text-slate-500">]</span>,</div>
                                <div className="ml-4"><span className="text-purple-600">"topic"</span>: <span className="text-emerald-600">"Original query"</span></div>
                                <div className="text-slate-500">{'}'}</div>
                            </div>
                        </div>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2">Credit Cost</h3>
                            <p className="text-sm text-amber-700">
                                Deep Research costs <strong>35 credits</strong> per execution due to advanced multi-source analysis.
                            </p>
                        </div>
                    </div>
                );

            case 'node-extract-url':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Extract URL Node</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Extract and parse content from any web URL. Returns structured data including title, main content, and metadata.
                        </p>

                        <div className="p-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2">Smart Content Extraction</h3>
                            <p className="text-sm text-white/90">
                                Automatically extracts the main content from web pages, removing navigation, ads, and boilerplate. Perfect for feeding clean content into AI processing pipelines.
                            </p>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <ul className="space-y-2 text-sm text-slate-600">
                                <li><strong>URL:</strong> The web page URL to extract content from. Supports variables like {'{{url}}'}</li>
                                <li><strong>API Key:</strong> Requires <code className="bg-slate-100 px-1 rounded font-mono text-xs">TAVILY_API_KEY</code> in Secrets</li>
                                <li><strong>Variable Name:</strong> Store the extracted content for use in subsequent nodes</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Use Cases</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>Content Summarization:</strong> Extract article content for AI summarization</li>
                                <li><strong>Data Collection:</strong> Pull structured data from web pages</li>
                                <li><strong>Competitor Monitoring:</strong> Track changes on competitor websites</li>
                                <li><strong>Documentation Parsing:</strong> Extract content from documentation sites</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <h3 className="font-bold text-emerald-800 mb-2">Credit Cost</h3>
                            <p className="text-sm text-emerald-700">
                                Extract URL costs <strong>10 credits</strong> per execution.
                            </p>
                        </div>
                    </div>
                );

            case 'node-crawl-site':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Crawl Site Node</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Crawl an entire website and extract content from multiple pages. Useful for comprehensive site analysis and content aggregation.
                        </p>

                        <div className="p-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2">Multi-Page Extraction</h3>
                            <p className="text-sm text-white/90">
                                Starting from a base URL, the crawler discovers and extracts content from related pages, building a comprehensive dataset of site content.
                            </p>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <ul className="space-y-2 text-sm text-slate-600">
                                <li><strong>Site URL:</strong> The starting URL to crawl. Supports variables like {'{{siteUrl}}'}</li>
                                <li><strong>Max Pages:</strong> Maximum number of pages to crawl (currently limited)</li>
                                <li><strong>API Key:</strong> Requires <code className="bg-slate-100 px-1 rounded font-mono text-xs">TAVILY_API_KEY</code> in Secrets</li>
                                <li><strong>Variable Name:</strong> Store the crawl results for use in subsequent nodes</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Use Cases</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>Site Audits:</strong> Analyze content across an entire website</li>
                                <li><strong>Knowledge Base Creation:</strong> Build searchable content from documentation sites</li>
                                <li><strong>Content Migration:</strong> Extract content for migration to new platforms</li>
                                <li><strong>Competitive Analysis:</strong> Gather comprehensive competitor information</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-xl">
                            <h3 className="font-bold text-indigo-800 mb-2">Credit Cost</h3>
                            <p className="text-sm text-indigo-700">
                                Crawl Site costs <strong>25 credits</strong> per execution due to multi-page processing.
                            </p>
                        </div>
                    </div>
                );

            case 'node-agent':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">AI Agent Node</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Self-sustaining ReACT agent that plans, selects tools, executes, and iterates until the goal is complete.
                            Runs entirely on Blupe&apos;s cloud engine with progressive live status on the canvas.
                        </p>

                        <div className="p-6 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2 flex items-center gap-2"><Cpu className="w-5 h-5" /> Three-stage loop</h3>
                            <p className="text-sm text-white/90">
                                Plan once, then loop Decider → Executor with native function calling (Gemini / Anthropic).
                                Failures become observations so the agent can recover; FINISH is guarded so delivery steps (email/Slack) are not skipped.
                            </p>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Stages</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>Planner:</strong> Builds an atomic step plan from the goal and available tools</li>
                                <li><strong>Decider:</strong> Picks one tool (or FINISH) for the current step</li>
                                <li><strong>Executor:</strong> Runs the tool, stores observations / artifacts, advances the plan when the tool matches the step</li>
                                <li><strong>Repeat</strong> until completed, max iterations, or timeout</li>
                            </ol>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Built-in tools (15)</h3>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                {[
                                    ['web_search', 'Quick web facts'],
                                    ['deep_research', 'Multi-source research'],
                                    ['extract_url', 'Single page extract'],
                                    ['crawl_site', 'Multi-page site map'],
                                    ['llm_call', 'General text generation'],
                                    ['synthesize_report', 'Validated report JSON artifact'],
                                    ['declare_artifact', 'Name primary deliverable'],
                                    ['send_email', 'Email from artifact / SMTP'],
                                    ['send_slack', 'Slack message'],
                                    ['api_call', 'HTTP request'],
                                    ['javascript', 'Sandboxed JS transform'],
                                    ['calculate', 'Safe math expression'],
                                    ['store_memory', 'Save intermediate values'],
                                    ['read_context', 'Read prior node / memory'],
                                    ['append_to_sheet', 'Google Sheets append'],
                                ].map(([name, desc]) => (
                                    <div key={name} className="p-2 bg-slate-50 rounded border border-slate-100">
                                        <div className="font-bold text-slate-700 font-mono">{name}</div>
                                        <div className="text-slate-500">{desc}</div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-slate-500 mt-3">
                                Attach <strong>MCP servers</strong> on the agent node to expose extra tools automatically.
                            </p>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Configuration</h3>
                            <ul className="space-y-2 text-sm text-slate-600">
                                <li><strong>Goal:</strong> Desired outcome (supports <code className="bg-slate-100 px-1 rounded">{'{{variables}}'}</code>)</li>
                                <li><strong>Max iterations:</strong> Default 30</li>
                                <li><strong>Timeout:</strong> Default 600 seconds (10 minutes) — multi-tool goals need room to finish</li>
                                <li><strong>Variable name:</strong> Expose results to downstream nodes</li>
                                <li><strong>MCP servers:</strong> Optional extra tools discovered from your MCP endpoints</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Output structure</h3>
                            <div className="font-mono text-xs bg-slate-100 p-3 rounded">
                                <div className="text-slate-500">{'{'}</div>
                                <div className="ml-4"><span className="text-purple-600">&quot;answer&quot;</span>: <span className="text-emerald-600">&quot;Final answer text&quot;</span>,</div>
                                <div className="ml-4"><span className="text-purple-600">&quot;success&quot;</span>: <span className="text-blue-600">true</span>,</div>
                                <div className="ml-4"><span className="text-purple-600">&quot;iterations&quot;</span>: <span className="text-amber-600">5</span>,</div>
                                <div className="ml-4"><span className="text-purple-600">&quot;plan&quot;</span>: <span className="text-slate-500">[&quot;...&quot;]</span>,</div>
                                <div className="ml-4"><span className="text-purple-600">&quot;thoughts&quot;</span>: <span className="text-slate-500">[...]</span>,</div>
                                <div className="ml-4"><span className="text-purple-600">&quot;status&quot;</span>: <span className="text-emerald-600">&quot;completed&quot;</span></div>
                                <div className="text-slate-500">{'}'}</div>
                            </div>
                            <div className="mt-3 text-xs text-slate-500">
                                Examples: <code className="bg-slate-100 px-1 rounded">{'{{myAgent.answer}}'}</code>, <code className="bg-slate-100 px-1 rounded">{'{{myAgent.success}}'}</code>, <code className="bg-slate-100 px-1 rounded">{'{{myAgent.plan}}'}</code>
                            </div>
                        </div>

                        <div className="p-5 bg-violet-50 border border-violet-200 rounded-xl">
                            <h3 className="font-bold text-violet-800 mb-2">Credits</h3>
                            <ul className="text-sm text-violet-700 space-y-1">
                                <li><strong>Base:</strong> 15 credits once</li>
                                <li><strong>Plan:</strong> ~4 credits</li>
                                <li><strong>Each decide step:</strong> ~6 credits</li>
                                <li><strong>Each tool:</strong> flat 5 credits (agent wholesale pricing)</li>
                            </ul>
                            <p className="text-xs text-violet-600 mt-2">
                                Standalone canvas nodes still use their own prices (e.g. Deep Research 35). Only agent-invoked tools use the flat rate.
                            </p>
                        </div>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2"><Lightbulb className="w-4 h-4" /> Tips for reliable goals</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-amber-700">
                                <li>Be explicit about delivery (&quot;email hello@example.com a report&quot;)</li>
                                <li>For reports, expect plan steps: research → synthesize_report → declare_artifact → send_email</li>
                                <li>Ensure SMTP / Slack secrets exist when the goal requires them</li>
                                <li>Raise timeout for multi-step research goals</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'node-mcp':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">MCP Tool Node</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Connect to any external <strong>Model Context Protocol (MCP)</strong> server to access powerful tools.
                            MCP is an open standard for integrating AI systems with external data and tools.
                        </p>

                        <div className="p-6 bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                                <Server className="w-5 h-5" /> What is MCP?
                            </h3>
                            <p className="text-sm text-white/90">
                                Model Context Protocol is an open standard that allows AI applications to connect to external tools,
                                data sources, and services. Think of it as a universal adapter for AI integrations.
                            </p>
                        </div>

                        {/* Key Features */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-emerald-50 rounded-lg"><Search className="w-5 h-5 text-emerald-600" /></div>
                                    <h3 className="font-bold text-slate-900">Tool Discovery</h3>
                                </div>
                                <p className="text-sm text-slate-600">Click "Discover" to automatically fetch available tools from any MCP server.</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-brand-50 rounded-lg"><Zap className="w-5 h-5 text-brand-600" /></div>
                                    <h3 className="font-bold text-slate-900">Dynamic Schema</h3>
                                </div>
                                <p className="text-sm text-slate-600">Input fields are auto-generated based on the tool's parameter schema.</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-amber-50 rounded-lg"><Key className="w-5 h-5 text-amber-600" /></div>
                                    <h3 className="font-bold text-slate-900">Authentication</h3>
                                </div>
                                <p className="text-sm text-slate-600">Supports API Key, Bearer Token, or custom headers for secured servers.</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-indigo-50 rounded-lg"><Globe className="w-5 h-5 text-indigo-600" /></div>
                                    <h3 className="font-bold text-slate-900">Any MCP Server</h3>
                                </div>
                                <p className="text-sm text-slate-600">Works with any HTTP-accessible MCP server using the Streamable HTTP transport.</p>
                            </div>
                        </div>

                        {/* Setup Steps */}
                        <div className="p-6 bg-slate-900 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-4">Quick Setup</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-slate-300 text-sm">
                                <li><strong className="text-white">Enter Server URL</strong> — The HTTP endpoint of your MCP server</li>
                                <li><strong className="text-white">Configure Auth (if needed)</strong> — Add API key or Bearer token</li>
                                <li><strong className="text-white">Click "Discover"</strong> — Fetch available tools from the server</li>
                                <li><strong className="text-white">Select a Tool</strong> — Choose from the discovered tools dropdown</li>
                                <li><strong className="text-white">Fill Arguments</strong> — Use auto-generated fields or manual JSON</li>
                                <li><strong className="text-white">Run</strong> — Execute the tool and access results via variable</li>
                            </ol>
                        </div>

                        {/* Authentication Options */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Authentication Options</h3>
                            <div className="space-y-3 text-sm">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <strong className="text-slate-900">None</strong>
                                    <p className="text-xs text-slate-600 mt-1">For public MCP servers without authentication</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <strong className="text-slate-900">API Key Header</strong>
                                    <p className="text-xs text-slate-600 mt-1">Custom header (default: <code className="bg-slate-200 px-1 rounded">X-API-Key</code>). Reference a secret like <code className="bg-slate-200 px-1 rounded">MCP_API_KEY</code>.</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <strong className="text-slate-900">Bearer Token</strong>
                                    <p className="text-xs text-slate-600 mt-1">Standard <code className="bg-slate-200 px-1 rounded">Authorization: Bearer &lt;token&gt;</code> header</p>
                                </div>
                            </div>
                        </div>

                        {/* Variable Interpolation */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Variable Support</h3>
                            <p className="text-sm text-slate-600 mb-4">Use dynamic values in tool arguments:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                                    <div className="text-slate-500 mb-1">// Previous node output</div>
                                    <div>{"{{previousNodeResult}}"}</div>
                                </div>
                                <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
                                    <div className="text-slate-500 mb-1">// Webhook payload field</div>
                                    <div>{"{{payload.data.id}}"}</div>
                                </div>
                            </div>
                        </div>

                        {/* Limitations */}
                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2">Important Limitation</h3>
                            <p className="text-sm text-amber-700">
                                <strong>HTTP Only:</strong> This node only works with HTTP-accessible MCP servers (Streamable HTTP transport).
                                Local stdio-based servers (like Claude Desktop's built-in servers) cannot be accessed from web apps.
                            </p>
                        </div>

                        {/* Use Cases */}
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Use Cases</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li><strong>Database Access:</strong> Connect to MCP servers that query databases</li>
                                <li><strong>File Operations:</strong> Read, write, or manage files via MCP</li>
                                <li><strong>External APIs:</strong> Access APIs wrapped as MCP tools</li>
                                <li><strong>Custom Tools:</strong> Connect to your own MCP server with custom business logic</li>
                                <li><strong>Third-Party Services:</strong> Use pre-built MCP servers for popular services</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <h3 className="font-bold text-emerald-800 mb-2">Pro Tip</h3>
                            <p className="text-sm text-emerald-700">
                                The "Advanced: Manual JSON Arguments" section allows you to bypass the auto-generated form
                                and send raw JSON arguments — useful for complex nested objects or debugging.
                            </p>
                        </div>
                    </div>
                );

            case 'node-telegram':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Telegram Bot Integration</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Automate interactions via Telegram. Use the <strong>Telegram Trigger</strong> node to listen to incoming chat messages and the <strong>Telegram Send</strong> node to post replies dynamically.
                        </p>

                        <div className="p-5 bg-sky-50 border border-sky-200 rounded-xl">
                            <h3 className="font-bold text-sky-800 mb-2 flex items-center gap-2">
                                <MessageCircle className="w-5 h-5" /> Inbound Trigger vs. Outbound Send
                            </h3>
                            <ul className="list-disc pl-5 space-y-1.5 text-sm text-sky-700">
                                <li><strong>Telegram Trigger:</strong> Registers a webhook with the Telegram Bot API. It fires every time a user sends a message to your bot.</li>
                                <li><strong>Telegram Send:</strong> Sends a custom message payload to any target Chat ID via your bot token.</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Available Trigger Outputs</h3>
                            <p className="text-sm text-slate-600 mb-3">The trigger node outputs structured data that downstream nodes can reference using standard variables:</p>
                            <table className="w-full text-xs font-mono text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500 uppercase">
                                        <th className="py-2 pr-4">Variable</th>
                                        <th className="py-2">Description</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-sky-600">{"{{nodeId.text}}"}</td>
                                        <td className="py-2">The message body text sent by the user (e.g. "/start" or custom queries)</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-sky-600">{"{{nodeId.chatId}}"}</td>
                                        <td className="py-2">The unique identifier for the target chat session (needed to reply)</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-sky-600">{"{{nodeId.username}}"}</td>
                                        <td className="py-2">The Telegram username of the sender (excluding `@`)</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-sky-600">{"{{nodeId.firstName}}"}</td>
                                        <td className="py-2">The first name of the sender</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-sky-600">{"{{nodeId.messageId}}"}</td>
                                        <td className="py-2">The unique message index inside Telegram</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="p-6 bg-slate-900 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-4">How to Setup</h3>
                            <ol className="list-decimal pl-5 space-y-2.5 text-slate-300 text-sm">
                                <li><strong className="text-white">Create Bot:</strong> Message <a href="https://t.me/botfather" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">@BotFather</a> on Telegram, run <code className="bg-slate-800 text-slate-300 px-1 rounded">/newbot</code>, and copy the Bot Token.</li>
                                <li><strong className="text-white">Save Globally:</strong> Paste the Bot Token into the <strong className="text-white">Secrets</strong> modal as <code className="bg-slate-800 text-slate-300 px-1.5 rounded font-mono">TELEGRAM_BOT_TOKEN</code>.</li>
                                <li><strong className="text-white">Local Tunneling (if Dev):</strong> If developing locally, run a tunnel (e.g. <code className="bg-slate-800 text-slate-300 px-1 rounded">ngrok http 8888</code>) and input the HTTPS URL in the node's properties.</li>
                                <li><strong className="text-white">Register Webhook:</strong> Click <strong className="text-white">Register Webhook</strong> on the trigger node to verify connection.</li>
                                <li><strong className="text-white">Chat ID Lookup:</strong> Message <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">@userinfobot</a> to find your own Chat ID for manual alerts.</li>
                            </ol>
                        </div>
                    </div>
                );

            case 'node-discord':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Discord Bot Integration</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Trigger flows from Discord and post updates back. Use the <strong>Discord Trigger</strong> node to run a flow when someone uses your bot's slash command, and the <strong>Discord Send</strong> node to post messages to any channel.
                        </p>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                                <Bot className="w-5 h-5" /> Slash Commands, Not Chat Messages
                            </h3>
                            <p className="text-sm text-amber-700 leading-relaxed">
                                Unlike Telegram, Discord does <strong>not</strong> deliver ordinary chat or DM messages over webhooks — that requires a permanently connected Gateway bot. Discord's official push mechanism for automations is the <strong>Interactions Endpoint</strong>: your flow runs when a user types a slash command like <code className="bg-amber-100 px-1 rounded font-mono">/run message: summarize today's leads</code>. The optional <code className="bg-amber-100 px-1 rounded font-mono">message</code> option carries free text into the flow.
                            </p>
                        </div>

                        <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-xl">
                            <h3 className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
                                <Bot className="w-5 h-5" /> Inbound Trigger vs. Outbound Send
                            </h3>
                            <ul className="list-disc pl-5 space-y-1.5 text-sm text-indigo-700">
                                <li><strong>Discord Trigger:</strong> Receives signed slash-command interactions from Discord (Ed25519 signature verification) and starts the flow. Requires the flow's webhook to be enabled.</li>
                                <li><strong>Discord Send:</strong> Posts a message either via a channel's <strong>Incoming Webhook URL</strong> (simplest — no bot needed) or via <strong>Bot + Channel ID</strong> using your bot token.</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Available Trigger Outputs</h3>
                            <p className="text-sm text-slate-600 mb-3">The trigger node outputs structured data that downstream nodes can reference using standard variables:</p>
                            <table className="w-full text-xs font-mono text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500 uppercase">
                                        <th className="py-2 pr-4">Variable</th>
                                        <th className="py-2">Description</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.text}}"}</td>
                                        <td className="py-2">The text passed via the command's `message` option</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.command}}"}</td>
                                        <td className="py-2">The slash command name that fired the flow</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.options}}"}</td>
                                        <td className="py-2">All command options as a name → value object</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.userId}}"}</td>
                                        <td className="py-2">The Discord user ID of whoever ran the command</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.username}}"}</td>
                                        <td className="py-2">The sender's Discord username</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.channelId}}"}</td>
                                        <td className="py-2">The channel the command was used in (useful for replies via Discord Send)</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.guildId}}"}</td>
                                        <td className="py-2">The server (guild) ID where the command was used</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="p-6 bg-slate-900 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-4">How to Setup</h3>
                            <ol className="list-decimal pl-5 space-y-2.5 text-slate-300 text-sm">
                                <li><strong className="text-white">Create Application:</strong> Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Discord Developer Portal</a>, create an application, and add a Bot to it.</li>
                                <li><strong className="text-white">Copy Credentials:</strong> From <em>General Information</em>, copy the <strong className="text-white">Application ID</strong> and <strong className="text-white">Public Key</strong> into the Discord Trigger node. From <em>Bot</em>, copy the <strong className="text-white">Bot Token</strong>.</li>
                                <li><strong className="text-white">Save &amp; Enable:</strong> Save the flow and enable its webhook, so Discord's endpoint verification can find it.</li>
                                <li><strong className="text-white">Set Interactions Endpoint:</strong> Copy the <strong className="text-white">Interactions Endpoint URL</strong> shown on the trigger node and paste it into your application's <em>General Information → Interactions Endpoint URL</em>. Discord verifies it instantly.</li>
                                <li><strong className="text-white">Register Command:</strong> Click <strong className="text-white">Register Slash Command</strong> on the trigger node. Global commands can take up to an hour to appear.</li>
                                <li><strong className="text-white">Invite the Bot:</strong> Under <em>OAuth2 → URL Generator</em>, pick the <code className="bg-slate-800 text-slate-300 px-1 rounded">bot</code> and <code className="bg-slate-800 text-slate-300 px-1 rounded">applications.commands</code> scopes, open the generated URL, and add the bot to your server.</li>
                            </ol>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Secret Fallbacks</h3>
                            <p className="text-sm text-slate-600 mb-3">Instead of storing credentials on each node, you can save them once in the <strong>Secrets</strong> modal — nodes fall back to these automatically when their fields are empty:</p>
                            <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-600">
                                <li><code className="bg-slate-100 px-1.5 rounded font-mono text-indigo-600">DISCORD_WEBHOOK_URL</code> — default Incoming Webhook for Discord Send (webhook mode) and HITL approval notifications</li>
                                <li><code className="bg-slate-100 px-1.5 rounded font-mono text-indigo-600">DISCORD_BOT_TOKEN</code> — default bot token for Discord Send (bot mode)</li>
                                <li><code className="bg-slate-100 px-1.5 rounded font-mono text-indigo-600">DISCORD_CHANNEL_ID</code> — default target channel for Discord Send (bot mode)</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-rose-50 border border-rose-200 rounded-xl">
                            <h3 className="font-bold text-rose-800 mb-2">Human-in-the-Loop Approvals</h3>
                            <p className="text-sm text-rose-700 leading-relaxed">
                                The <strong>Approval</strong> node can deliver its request to a Discord channel (via Incoming Webhook). The message contains single-use <strong>Approve</strong> / <strong>Reject</strong> links valid for 7 days — the approver clicks a link to decide; typing a reply in the channel is not monitored. The flow then continues with <code className="bg-rose-100 px-1 rounded font-mono">{"{{nodeId.approved}}"}</code> set to <code className="bg-rose-100 px-1 rounded font-mono">true</code> or <code className="bg-rose-100 px-1 rounded font-mono">false</code>.
                            </p>
                        </div>
                    </div>
                );

            case 'node-whatsapp':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">WhatsApp Cloud Integration</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Integrate with Meta's official <strong>WhatsApp Business Cloud API</strong>. Receive incoming message notifications via webhooks and automate text, template, or media replies.
                        </p>

                        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl">
                            <h3 className="font-bold text-emerald-800 mb-2 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5" /> Supported Message Types
                            </h3>
                            <ul className="list-disc pl-5 space-y-1.5 text-sm text-emerald-700">
                                <li><strong>Text Messages:</strong> Send simple dynamic markdown messages using templates and parameters.</li>
                                <li><strong>Template Messages:</strong> Send pre-approved business templates containing dynamic arguments (required for user-initiated conversations outside 24h windows).</li>
                                <li><strong>Media Messages:</strong> Send documents, images, and audio links directly to users.</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Available Trigger Outputs</h3>
                            <p className="text-sm text-slate-600 mb-3">Incoming WhatsApp webhooks expose the following parameters:</p>
                            <table className="w-full text-xs font-mono text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500 uppercase">
                                        <th className="py-2 pr-4">Variable</th>
                                        <th className="py-2">Description</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-emerald-600">{"{{nodeId.text}}"}</td>
                                        <td className="py-2">The text content of the user's incoming message</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-emerald-600">{"{{nodeId.from}}"}</td>
                                        <td className="py-2">The sender's WhatsApp phone number (with country code)</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-emerald-600">{"{{nodeId.sender}}"}</td>
                                        <td className="py-2">The sender's WhatsApp profile name</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-emerald-600">{"{{nodeId.messageId}}"}</td>
                                        <td className="py-2">The unique identifier for the incoming message</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="p-6 bg-slate-900 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-4">Setup Guide</h3>
                            <ol className="list-decimal pl-5 space-y-2.5 text-slate-300 text-sm">
                                <li><strong className="text-white">Meta Developer App:</strong> Register at <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Meta Developers</a> and create a Business App.</li>
                                <li><strong className="text-white">Add WhatsApp:</strong> Add the WhatsApp product to your App, copy the temporary/permanent Access Token, Phone Number ID, and WABA ID.</li>
                                <li><strong className="text-white">Configure Secrets:</strong> Save the access token as <code className="bg-slate-800 text-slate-300 px-1 rounded">WHATSAPP_ACCESS_TOKEN</code> in your Secrets panel.</li>
                                <li><strong className="text-white">Register Webhook:</strong> In your Meta app settings under Webhooks, set the Webhook URL to:
                                  <br /><code className="bg-slate-800 text-slate-300 px-1.5 rounded block my-1 font-mono">https://blupe.space/api/webhook/whatsapp</code>
                                  Set the verify token to: <code className="bg-slate-800 text-slate-300 px-1 rounded font-mono">bloope-verify-token</code>.
                                </li>
                                <li><strong className="text-white">Subscribe:</strong> Subscribe to the <code className="bg-slate-800 text-slate-300 px-1 rounded">messages</code> field in your Meta dashboard to start receiving triggers.</li>
                            </ol>
                        </div>
                    </div>
                );

            case 'node-razorpay':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Razorpay Payment Integration</h1>
                        <p className="text-base md:text-lg text-slate-600 leading-relaxed">
                            Connect your billing/payment workflows directly to the <strong>Razorpay API</strong>. Collect payments, listen to invoice/subscription notifications, or automatically generate payment links.
                        </p>

                        <div className="p-5 bg-indigo-50 border border-indigo-200 rounded-xl">
                            <h3 className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
                                <CreditCard className="w-5 h-5" /> Supported Actions
                            </h3>
                            <ul className="list-disc pl-5 space-y-1.5 text-sm text-indigo-700">
                                <li><strong>Create Payment Link:</strong> Generate payment URLs dynamically with custom amounts, descriptions, and user notification options.</li>
                                <li><strong>Verify Payment:</strong> Confirm transaction signature authenticity before marking orders as paid in your DB.</li>
                            </ul>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Available Trigger Outputs</h3>
                            <p className="text-sm text-slate-600 mb-3">When capturing events like `payment.captured` or `payment.failed`, the Razorpay trigger outputs:</p>
                            <table className="w-full text-xs font-mono text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 text-slate-500 uppercase">
                                        <th className="py-2 pr-4">Variable</th>
                                        <th className="py-2">Description</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.payment_id}}"}</td>
                                        <td className="py-2">The unique identifier for the transaction</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.amount}}"}</td>
                                        <td className="py-2">The transaction amount in paise (e.g. 50000 = ₹500.00)</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.email}}"}</td>
                                        <td className="py-2">The customer email associated with the invoice/charge</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 pr-4 font-bold text-indigo-600">{"{{nodeId.status}}"}</td>
                                        <td className="py-2">The current state (e.g. `captured`, `failed`)</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="p-6 bg-slate-900 text-white rounded-xl">
                            <h3 className="font-bold text-lg mb-4">Quick Setup</h3>
                            <ol className="list-decimal pl-5 space-y-2.5 text-slate-300 text-sm">
                                <li><strong className="text-white">API Keys:</strong> Generate API credentials in your Razorpay Dashboard under Settings &gt; API Keys.</li>
                                <li><strong className="text-white">Add to Secrets:</strong> Set <code className="bg-slate-800 text-slate-300 px-1 rounded">RAZORPAY_KEY_ID</code> and <code className="bg-slate-800 text-slate-300 px-1 rounded">RAZORPAY_KEY_SECRET</code> in the Secrets menu.</li>
                                <li><strong className="text-white">Webhook Integration:</strong> Add a new webhook in Razorpay settings pointing to your public flow webhook URL to capture real-time payment notifications.</li>
                            </ol>
                        </div>
                    </div>
                );

            case 'execution':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">How Runs Work</h1>
                        <p className="text-slate-600">
                            All workflow execution happens on Blupe&apos;s unified cloud runtime — not in your browser.
                            Canvas, webhooks, schedules, and public links share the same engine.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <Activity className="w-7 h-7 text-brand-600 mb-3" />
                                <h3 className="font-bold text-slate-900 mb-1">Live status</h3>
                                <p className="text-xs text-slate-500">Node states update over Supabase realtime as the runner writes execution logs.</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <Server className="w-7 h-7 text-brand-600 mb-3" />
                                <h3 className="font-bold text-slate-900 mb-1">Server secrets</h3>
                                <p className="text-xs text-slate-500">Platform and user secrets are applied in the runner; raw keys never appear in the UI.</p>
                            </div>
                            <div className="p-5 bg-white border border-slate-200 rounded-xl">
                                <History className="w-7 h-7 text-brand-600 mb-3" />
                                <h3 className="font-bold text-slate-900 mb-1">Durable history</h3>
                                <p className="text-xs text-slate-500">Completed runs persist with duration, credits, and per-node logs.</p>
                            </div>
                        </div>

                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Execution model</h3>
                            <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">
                                <li>Trigger starts the run (manual, webhook, schedule, form, messaging, payment event).</li>
                                <li>Cloud runner loads the flow graph, decrypts secrets, and walks nodes topologically.</li>
                                <li>Branching (condition / router) prunes inactive edges; only active paths continue.</li>
                                <li>Approval nodes can pause the run until a human approves or rejects via link.</li>
                                <li>When finished, run history is saved and credits are recorded.</li>
                            </ol>
                        </div>

                        <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
                            <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2"><Clock className="w-4 h-4" /> Timeouts</h3>
                            <p className="text-sm text-amber-700">
                                The cloud runner allows long-running production jobs (up to ~15 minutes wall clock).
                                Individual Agent nodes default to 10 minutes and are configurable. Raise agent timeout for multi-step research goals.
                            </p>
                        </div>
                    </div>
                );

            case 'run-history':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Run History</h1>
                        <p className="text-slate-600">
                            Every cloud run is stored with status, duration, credits used, and node-level logs so you can audit and debug.
                        </p>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2"><History className="w-4 h-4 text-brand-600" /> What you can see</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li>Success / failed / paused status</li>
                                <li>Total credits and wall-clock duration</li>
                                <li>Per-node inputs, outputs, and errors</li>
                                <li>Agent thoughts: plan, tools, and observations (when an agent ran)</li>
                            </ul>
                        </div>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Where to open it</h3>
                            <p className="text-sm text-slate-600">
                                Use <strong>Run History</strong> from the dashboard or editor chrome. Filter by flow and page through past runs.
                                Live runs also paint the canvas via the same log stream.
                            </p>
                        </div>
                    </div>
                );

            case 'variables':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Variables &amp; Context</h1>
                        <p className="text-slate-600">
                            Nodes pass data through a shared context. Reference earlier outputs with double curly braces.
                        </p>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Syntax</h3>
                            <div className="space-y-2 font-mono text-xs">
                                <div className="p-2 bg-slate-100 rounded">{'{{variableName}}'} — full value of a node variable</div>
                                <div className="p-2 bg-slate-100 rounded">{'{{variableName.field}}'} — nested field (e.g. agent answer)</div>
                                <div className="p-2 bg-slate-100 rounded">{'{{nodeId}}'} — raw node id also works</div>
                                <div className="p-2 bg-slate-100 rounded">{'{{env.SECRET_NAME}}'} — inject a secret</div>
                                <div className="p-2 bg-slate-100 rounded">{'{{payload.email}}'} — webhook / form payload</div>
                            </div>
                        </div>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Agent &amp; LLM shapes</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                                <li><code className="bg-slate-100 px-1 rounded">{'{{agent.answer}}'}</code> — final agent answer</li>
                                <li><code className="bg-slate-100 px-1 rounded">{'{{llmNode}}'}</code> — LLM text output</li>
                                <li><code className="bg-slate-100 px-1 rounded">{'{{reason.thinking}}'}</code> / <code className="bg-slate-100 px-1 rounded">{'{{reason.answer}}'}</code></li>
                            </ul>
                        </div>
                        <div className="p-5 bg-brand-50 border border-brand-200 rounded-xl">
                            <h3 className="font-bold text-brand-800 mb-2 flex items-center gap-2"><Variable className="w-4 h-4" /> Tip</h3>
                            <p className="text-sm text-brand-700">
                                Set a clear <strong>Variable Name</strong> on each node in the property panel. Prefer readable names
                                (<code className="bg-white px-1 rounded mx-1">summary</code>, <code className="bg-white px-1 rounded">lead</code>) over raw node ids.
                            </p>
                        </div>
                    </div>
                );

            case 'node-start':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Manual Start</h1>
                        <p className="text-slate-600">Entry node for canvas runs. When you click Run, execution begins at Start (or any other trigger with no incoming edges).</p>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
                            No configuration required. Free (0 credits). Use Webhook / Schedule / Form when the flow should start from outside the editor.
                        </div>
                    </div>
                );

            case 'node-form':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Form Trigger</h1>
                        <p className="text-slate-600">Collect structured input via a public form and start the workflow when someone submits.</p>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">Usage</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
                                <li>Define fields in the form trigger configuration</li>
                                <li>Deploy / open the form URL for end users</li>
                                <li>Access answers as <code className="bg-slate-100 px-1 rounded">{'{{form.fieldName}}'}</code> (or your variable name)</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'node-approval':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Approval (Human-in-the-Loop)</h1>
                        <p className="text-slate-600">
                            Pause a run until a human approves or rejects. Notifications can go to Telegram, Discord, Slack, email-style webhooks, or the in-app dialog when running from the canvas.
                        </p>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-3">After the decision</h3>
                            <p className="text-sm text-slate-600">
                                Downstream nodes can read <code className="bg-slate-100 px-1 rounded">{'{{approval.approved}}'}</code> (true/false).
                                Approve / reject links remain valid for 7 days or until used.
                            </p>
                        </div>
                    </div>
                );

            case 'node-text':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Text Tools</h1>
                        <p className="text-slate-600">Transform strings without writing code: uppercase, lowercase, trim, split, join, replace.</p>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
                            Point the content field at a previous node with <code className="bg-slate-100 px-1 rounded">{'{{variable}}'}</code>, pick an operation, and store the result under a variable name.
                        </div>
                    </div>
                );

            case 'node-input':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Input &amp; Output Nodes</h1>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-2">Input</h3>
                            <p className="text-sm text-slate-600">Static text or JSON constants available to the rest of the flow.</p>
                        </div>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-2">Output</h3>
                            <p className="text-sm text-slate-600">
                                Select a variable to surface as the run&apos;s primary result, or leave blank to emit the full context snapshot for debugging.
                            </p>
                        </div>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl">
                            <h3 className="font-bold text-slate-900 mb-2">Note</h3>
                            <p className="text-sm text-slate-600">Sticky notes on the canvas only — not executed.</p>
                        </div>
                    </div>
                );

            case 'node-hubspot':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">HubSpot</h1>
                        <p className="text-slate-600">Create and update CRM contacts and deals via HubSpot operations configured on the node.</p>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
                            Connect HubSpot under Settings / OAuth, then choose the operation (create contact, search, create deal, etc.) and map fields with variables from earlier nodes.
                        </div>
                    </div>
                );

            case 'node-stripe':
                return (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <h1 className="text-3xl font-bold text-slate-900">Stripe</h1>
                        <p className="text-slate-600">Payment actions such as charges, customers, subscriptions, payment intents, refunds, and cancellations.</p>
                        <div className="p-5 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
                            Provide a Stripe secret key via Secrets or node config. Prefer webhooks (Stripe → Blupe webhook trigger) for async payment events.
                        </div>
                    </div>
                );

            default:
                return (
                    <div className="text-center py-20 text-slate-400">
                        <Book className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Select a topic from the sidebar to view documentation.</p>
                    </div>
                );
        }
    };

    return (
        <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans flex flex-col md:flex-row overflow-hidden">
            {/* Mobile Menu Toggle */}
            <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden fixed top-4 left-4 z-30 p-2 bg-white border border-slate-200 rounded-lg shadow-lg"
                style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
            >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Sidebar */}
            <div className={clsx(
                "w-72 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col h-full shadow-lg z-20 absolute md:relative transition-transform duration-300",
                mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            )}>
                <div className="p-4 md:p-6 border-b border-slate-100 bg-white sticky top-0 z-10" style={{ paddingTop: 'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))' }}>
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors text-xs font-bold uppercase tracking-wider mb-2">
                        <ArrowLeft className="w-3 h-3" /> Back to Dashboard
                    </button>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Book className="w-5 h-5 text-brand-500" /> Documentation
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-0.5 custom-scrollbar" style={{ paddingBottom: 'max(5rem, calc(env(safe-area-inset-bottom) + 5rem))' }}>
                    {SECTIONS.map((section, idx) => {
                        if (section.isHeader) {
                            return (
                                <div key={idx} className="mt-6 mb-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    {section.label}
                                </div>
                            );
                        }
                        const Icon = section.icon;
                        const isActive = activeSection === section.id;
                        return (
                            <button
                                key={section.id}
                                onClick={() => handleNav(section.id)}
                                className={clsx(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                    isActive
                                        ? "bg-brand-50 text-brand-600 shadow-sm border-l-2 border-brand-500 rounded-l-none"
                                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                )}
                            >
                                {Icon && <Icon className={clsx("w-4 h-4", isActive ? "text-brand-500" : "text-slate-400")} />}
                                {section.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content */}
            <div id="docs-content-top" className="flex-1 h-full overflow-y-auto bg-[#f8fafc] w-full scroll-smooth">
                <div className="max-w-4xl mx-auto p-4 md:p-12 min-h-screen flex flex-col" style={{ paddingTop: 'max(4rem, calc(env(safe-area-inset-top) + 3rem))', paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 1rem))' }}>
                    <div className="flex-1">
                        {renderContent()}
                    </div>

                    {/* Navigation Footer */}
                    <div className="mt-12 md:mt-16 pt-6 md:pt-8 border-t border-slate-200 grid grid-cols-2 gap-3 md:gap-4" style={{ marginBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                        {prevItem ? (
                            <button
                                onClick={() => handleNav(prevItem.id)}
                                className="flex flex-col items-start p-4 bg-white border border-slate-200 rounded-xl hover:border-brand-300 hover:shadow-md transition-all group"
                            >
                                <span className="text-xs text-slate-400 font-medium mb-1 flex items-center gap-1 group-hover:text-brand-600 transition-colors">
                                    <ChevronLeft className="w-3 h-3" /> Previous
                                </span>
                                <span className="font-bold text-slate-800">{prevItem.label}</span>
                            </button>
                        ) : <div />}

                        {nextItem ? (
                            <button
                                onClick={() => handleNav(nextItem.id)}
                                className="flex flex-col items-end p-4 bg-white border border-slate-200 rounded-xl hover:border-brand-300 hover:shadow-md transition-all group"
                            >
                                <span className="text-xs text-slate-400 font-medium mb-1 flex items-center gap-1 group-hover:text-brand-600 transition-colors">
                                    Next <ChevronRight className="w-3 h-3" />
                                </span>
                                <span className="font-bold text-slate-800">{nextItem.label}</span>
                            </button>
                        ) : <div />}
                    </div>
                </div>
            </div>
        </div>
    );
};
