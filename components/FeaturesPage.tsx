import React, { useEffect, useRef, useState } from 'react';
import {
    ArrowRight,
    Brain,
    Zap,
    Sparkles,
    Eye,
    Lightbulb,
    Radio,
    Clock,
    Layers,
    FormInput,
    Mail,
    Slack,
    Table,
    Globe,
    Code2,
    Braces,
    Server,
    Shield,
    Lock,
    Key,
    CheckCircle2,
    Users,
    Box,
    GitFork,
    History,
    PauseCircle,
    ChevronRight,
    Rss,
    Search,
    FileJson,
    Calculator,
    Type,
    MessageSquare,
    Workflow,
    Settings,
    TrendingUp,
    Bot,
    Database
} from 'lucide-react';
import { PageView } from '../types';
import { Logo } from './Logo';

interface FeaturesPageProps {
    onNavigate: (page: PageView) => void;
    onStart: () => void;
}

// Animation hook for scroll-triggered animations
const useInView = (threshold = 0.1) => {
    const ref = useRef<HTMLDivElement>(null);
    const [isInView, setIsInView] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsInView(true);
                }
            },
            { threshold }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => observer.disconnect();
    }, [threshold]);

    return { ref, isInView };
};

// Animated counter
const AnimatedCounter: React.FC<{ value: number; suffix?: string; duration?: number }> = ({
    value,
    suffix = '',
    duration = 2000
}) => {
    const [count, setCount] = useState(0);
    const { ref, isInView } = useInView(0.5);

    useEffect(() => {
        if (!isInView) return;

        let startTime: number;
        const animate = (currentTime: number) => {
            if (!startTime) startTime = currentTime;
            const progress = Math.min((currentTime - startTime) / duration, 1);
            setCount(Math.floor(progress * value));
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }, [isInView, value, duration]);

    return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
};

// Feature card component
const FeatureCard: React.FC<{
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
    title: string;
    description: string;
    delay?: number;
    badge?: string;
}> = ({ icon: Icon, iconColor, iconBg, title, description, delay = 0, badge }) => {
    const { ref, isInView } = useInView();

    return (
        <div
            ref={ref}
            className={`bg-white rounded-3xl p-8 border border-slate-200 relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-500 ${isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            {badge && (
                <div className="absolute top-4 right-4 bg-brand-100 text-brand-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                    {badge}
                </div>
            )}
            <div className={`w-12 h-12 ${iconBg} rounded-2xl border flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
        </div>
    );
};

const FeaturesPage: React.FC<FeaturesPageProps> = ({ onNavigate, onStart }) => {
    return (
        <div className="h-screen w-full bg-white text-slate-900 font-sans overflow-y-auto overflow-x-hidden custom-scrollbar">

            {/* Navbar */}
            <nav className="fixed w-full z-50 top-0 left-0 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('landing')}>
                        <Logo className="w-10 h-10" />
                        <span className="text-xl font-bold tracking-tight text-slate-900">Blupe</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500">
                        <button onClick={() => onNavigate('landing')} className="hover:text-slate-900 transition-colors">Home</button>
                        <span className="text-brand-600 font-semibold">Features</span>
                        <button onClick={() => onNavigate('docs')} className="hover:text-slate-900 transition-colors">Documentation</button>
                        <button onClick={() => onNavigate('security')} className="hover:text-slate-900 transition-colors">Security</button>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={onStart} className="text-sm font-medium bg-slate-900 text-white px-5 py-2 rounded-full hover:bg-slate-800 transition-colors font-semibold shadow-lg shadow-slate-900/10">
                            Get Started
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <div className="relative pt-32 pb-20 overflow-hidden bg-gradient-to-b from-slate-50 to-white">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-brand-100/30 rounded-full blur-[150px] -z-10" />

                <div className="max-w-7xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-semibold mb-8 shadow-sm">
                        <Workflow className="w-4 h-4 text-brand-500" />
                        Everything you need to automate anything
                    </div>

                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 tracking-tight mb-6 leading-[1.1]">
                        Full-Stack
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600 mx-3">Workflow</span>
                        Automation
                    </h1>

                    <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-12 leading-relaxed">
                        From AI reasoning to webhooks, from batch processing to human approvals.
                        Every capability you need, built into one visual platform.
                    </p>

                    {/* Stats */}
                    <div className="flex flex-wrap justify-center gap-12 mb-16">
                        <div className="text-center">
                            <div className="text-4xl font-bold text-slate-900"><AnimatedCounter value={25} suffix="+" /></div>
                            <div className="text-sm text-slate-500 mt-1">Node Types</div>
                        </div>
                        <div className="text-center">
                            <div className="text-4xl font-bold text-slate-900"><AnimatedCounter value={5} /></div>
                            <div className="text-sm text-slate-500 mt-1">LLM Providers</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Capabilities */}
            <section className="py-24 bg-[#0B0F19] text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/20 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px]" />

                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-brand-300 text-xs font-bold mb-4">
                            <Brain className="w-3 h-3" />
                            AI-POWERED
                        </div>
                        <h2 className="text-3xl lg:text-4xl font-bold mb-4">Intelligent Automation</h2>
                        <p className="text-slate-400 max-w-2xl mx-auto">Connect to any AI model. Route dynamically. Reason step-by-step.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                        {/* Agent Node - NEW */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-brand-500/50 hover:border-brand-400 transition-all hover:-translate-y-1 relative">
                            <div className="absolute top-3 right-3 bg-brand-500/30 text-brand-300 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">New</div>
                            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-purple-500 rounded-xl flex items-center justify-center mb-4">
                                <Bot className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Autonomous Agent</h3>
                            <p className="text-slate-400 text-sm mb-4">Goal-oriented AI that plans, executes tools, and iterates until done.</p>
                            <div className="text-xs text-brand-400/80 font-medium">ReAct loop + 12 tools</div>
                        </div>

                        {/* LLM Node */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-brand-500/50 transition-all hover:-translate-y-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-indigo-500 rounded-xl flex items-center justify-center mb-4">
                                <Brain className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Unified AI Node</h3>
                            <p className="text-slate-400 text-sm mb-4">One interface for OpenAI, Anthropic, Gemini, Groq, and Ollama.</p>
                            <div className="flex flex-wrap gap-1">
                                <span className="px-2 py-1 rounded bg-white/10 text-[10px] font-mono">gpt-5.1</span>
                                <span className="px-2 py-1 rounded bg-white/10 text-[10px] font-mono">claude-4.5</span>
                                <span className="px-2 py-1 rounded bg-white/10 text-[10px] font-mono">gemini-3</span>
                            </div>
                        </div>

                        {/* Reasoning Node */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-amber-500/50 transition-all hover:-translate-y-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center mb-4">
                                <Lightbulb className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">Reasoning Engine</h3>
                            <p className="text-slate-400 text-sm mb-4">Chain-of-thought reasoning for complex problem solving.</p>
                            <div className="text-xs text-amber-400/80 font-medium">Multi-step analysis</div>
                        </div>

                        {/* Vision Node */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 transition-all hover:-translate-y-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-4">
                                <Eye className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">AI Vision</h3>
                            <p className="text-slate-400 text-sm mb-4">Analyze images and documents with multimodal AI.</p>
                            <div className="text-xs text-purple-400/80 font-medium">Image + text input</div>
                        </div>

                        {/* AI Generator */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-emerald-500/50 transition-all hover:-translate-y-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center mb-4">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-bold text-lg mb-2">AI Flow Generator</h3>
                            <p className="text-slate-400 text-sm mb-4">Describe your workflow. AI builds it automatically.</p>
                            <div className="text-xs text-emerald-400/80 font-medium">Natural language</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Automation Capabilities */}
            <section className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-600 text-xs font-bold mb-4">
                            <Zap className="w-3 h-3" />
                            AUTOMATION
                        </div>
                        <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">Trigger Anything, Anywhere</h2>
                        <p className="text-slate-500 max-w-2xl mx-auto">Webhooks, schedules, forms, and more. Run workflows on any event.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <FeatureCard
                            icon={Radio}
                            iconColor="text-orange-600"
                            iconBg="bg-orange-50 border-orange-100"
                            title="Inbound Webhooks"
                            description="Real HTTP endpoints that receive data from any external service. Zapier, GitHub, Stripe - anything."
                            delay={0}
                        />
                        <FeatureCard
                            icon={Clock}
                            iconColor="text-red-600"
                            iconBg="bg-red-50 border-red-100"
                            title="Cron Scheduler"
                            description="Run workflows on a schedule. Every minute, daily, weekly. Full cron expression support."
                            delay={100}
                        />
                        <FeatureCard
                            icon={FormInput}
                            iconColor="text-blue-600"
                            iconBg="bg-blue-50 border-blue-100"
                            title="Public Forms"
                            description="Deploy forms that trigger workflows. Collect leads, feedback, or any structured data."
                            delay={200}
                        />
                        <FeatureCard
                            icon={Layers}
                            iconColor="text-cyan-600"
                            iconBg="bg-cyan-50 border-cyan-100"
                            title="Batch Processing"
                            description="Process arrays of data. Loop through items and apply AI to each. Perfect for bulk operations."
                            delay={300}
                        />
                        <FeatureCard
                            icon={PauseCircle}
                            iconColor="text-rose-600"
                            iconBg="bg-rose-50 border-rose-100"
                            title="Human Approvals"
                            description="Pause execution for human review. Approve drafts, verify data, or authorize actions."
                            delay={400}
                        />
                        <FeatureCard
                            icon={GitFork}
                            iconColor="text-slate-700"
                            iconBg="bg-slate-50 border-slate-100"
                            title="Conditional Logic"
                            description="Branch workflows based on conditions. Route to different paths dynamically."
                            delay={500}
                        />
                    </div>
                </div>
            </section>

            {/* Integrations */}
            <section className="py-24 bg-slate-50 border-y border-slate-200">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold mb-4">
                            <Globe className="w-3 h-3" />
                            INTEGRATIONS
                        </div>
                        <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">Connect Everything</h2>
                        <p className="text-slate-500 max-w-2xl mx-auto">Native integrations with the tools your business runs on.</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {[
                            { icon: Mail, label: "Email (SMTP)", color: "text-slate-600" },
                            { icon: Slack, label: "Slack", color: "text-[#E01E5A]" },
                            { icon: Table, label: "Google Sheets", color: "text-green-600" },
                            { icon: Globe, label: "Web Search", color: "text-indigo-500" },
                            { icon: Server, label: "MCP Protocol", color: "text-slate-800" },
                            { icon: Rss, label: "RSS Feeds", color: "text-orange-500" },
                            { icon: Code2, label: "JavaScript", color: "text-yellow-600" },
                            { icon: Braces, label: "JSON Parser", color: "text-slate-500" },
                            { icon: Calculator, label: "Math Operations", color: "text-blue-500" },
                            { icon: Type, label: "Text Transform", color: "text-purple-500" },
                            { icon: FileJson, label: "API Calls", color: "text-cyan-600" },
                            { icon: MessageSquare, label: "HubSpot CRM", color: "text-orange-600" },
                        ].map((item, idx) => (
                            <div key={idx} className="flex flex-col items-center gap-3 p-6 border border-slate-200 rounded-2xl hover:border-brand-200 hover:shadow-lg transition-all bg-white group hover:-translate-y-1">
                                <div className="p-3 bg-slate-50 rounded-xl group-hover:scale-110 transition-transform">
                                    <item.icon className={`w-6 h-6 ${item.color}`} />
                                </div>
                                <span className="font-semibold text-slate-700 text-sm text-center">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Developer Features */}
            <section className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold mb-4">
                            <Code2 className="w-3 h-3" />
                            DEVELOPER TOOLS
                        </div>
                        <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">Built for Power Users</h2>
                        <p className="text-slate-500 max-w-2xl mx-auto">Full code access when you need it. Visual builder when you don't.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Code Panel */}
                        <div className="bg-[#1e1e1e] rounded-3xl p-6 border border-slate-700 overflow-hidden">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-3 h-3 rounded-full bg-red-500" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                <div className="w-3 h-3 rounded-full bg-green-500" />
                                <span className="ml-4 text-slate-400 text-xs font-mono">javascript_node.js</span>
                            </div>
                            <pre className="text-sm font-mono text-slate-300 overflow-x-auto">
                                <code>{`// Access any variable from the flow
const leads = {{sheetData}};

// Process with full JavaScript
const qualified = leads.filter(l => 
  l.score > 50 && l.company
);

// Return to next node
return qualified.map(l => ({
  email: l.email,
  priority: l.score > 80 ? 'high' : 'medium'
}));`}</code>
                            </pre>
                        </div>

                        {/* Features List */}
                        <div className="space-y-6">
                            <FeatureCard
                                icon={Code2}
                                iconColor="text-yellow-600"
                                iconBg="bg-yellow-50 border-yellow-100"
                                title="JavaScript Execution"
                                description="Write custom logic with full JavaScript. Access Math, Date, JSON, and all flow variables."
                                delay={0}
                            />
                            <FeatureCard
                                icon={History}
                                iconColor="text-emerald-600"
                                iconBg="bg-emerald-50 border-emerald-100"
                                title="Version History"
                                description="Every save creates a version. Restore any previous state with one click."
                                delay={100}
                            />
                            <FeatureCard
                                icon={Search}
                                iconColor="text-indigo-600"
                                iconBg="bg-indigo-50 border-indigo-100"
                                title="Variable Inspector"
                                description="Debug with live variable inspection. See exactly what data flows between nodes."
                                delay={200}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Security Section */}
            <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5" />

                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold mb-4">
                            <Shield className="w-3 h-3" />
                            SECURITY
                        </div>
                        <h2 className="text-3xl lg:text-4xl font-bold mb-4">Enterprise-Grade Security</h2>
                        <p className="text-slate-400 max-w-2xl mx-auto">Your data, your control. Built with security-first architecture.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
                            <Key className="w-10 h-10 text-brand-400 mb-4" />
                            <h3 className="font-bold text-xl mb-3">BYOK Secrets</h3>
                            <p className="text-slate-400 text-sm">Bring your own API keys. They stay in your browser - never touch our servers.</p>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
                            <Lock className="w-10 h-10 text-emerald-400 mb-4" />
                            <h3 className="font-bold text-xl mb-3">Row-Level Security</h3>
                            <p className="text-slate-400 text-sm">Supabase RLS ensures users can only access their own data. Zero leakage.</p>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-8 border border-white/10">
                            <Shield className="w-10 h-10 text-blue-400 mb-4" />
                            <h3 className="font-bold text-xl mb-3">Rate Limiting</h3>
                            <p className="text-slate-400 text-sm">IP-based rate limiting protects public flows from abuse and credit drain.</p>
                        </div>
                    </div>

                    <div className="mt-12 text-center">
                        <button onClick={() => onNavigate('security')} className="inline-flex items-center gap-2 text-brand-400 hover:text-brand-300 font-semibold transition-colors">
                            Read our Security Documentation
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </section>

            {/* Coming Soon */}
            <section className="py-24 bg-gradient-to-b from-white to-slate-50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-600 text-xs font-bold mb-4">
                            <TrendingUp className="w-3 h-3" />
                            COMING SOON
                        </div>
                        <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">On the Roadmap</h2>
                        <p className="text-slate-500 max-w-2xl mx-auto">Exciting features we're building next.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white rounded-3xl p-8 border border-slate-200 border-dashed relative overflow-hidden">
                            <div className="absolute top-4 right-4 bg-amber-100 text-amber-600 text-[10px] font-bold px-2 py-1 rounded-full">Q1 2026</div>
                            <Box className="w-10 h-10 text-slate-400 mb-4" />
                            <h3 className="font-bold text-xl text-slate-900 mb-3">Custom Nodes</h3>
                            <p className="text-slate-500 text-sm">Package multiple nodes into reusable custom components. Build once, use everywhere.</p>
                        </div>
                        <div className="bg-white rounded-3xl p-8 border border-slate-200 border-dashed relative overflow-hidden">
                            <div className="absolute top-4 right-4 bg-amber-100 text-amber-600 text-[10px] font-bold px-2 py-1 rounded-full">Q1 2026</div>
                            <Database className="w-10 h-10 text-slate-400 mb-4" />
                            <h3 className="font-bold text-xl text-slate-900 mb-3">Vector Memory</h3>
                            <p className="text-slate-500 text-sm">Long-term memory for agents. Store and retrieve context across workflow runs.</p>
                        </div>
                        <div className="bg-white rounded-3xl p-8 border border-slate-200 border-dashed relative overflow-hidden">
                            <div className="absolute top-4 right-4 bg-amber-100 text-amber-600 text-[10px] font-bold px-2 py-1 rounded-full">Q2 2026</div>
                            <Users className="w-10 h-10 text-slate-400 mb-4" />
                            <h3 className="font-bold text-xl text-slate-900 mb-3">Team Workspaces</h3>
                            <p className="text-slate-500 text-sm">Collaborate in real-time. Shared flows, pooled credits, and role-based access.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-24 bg-brand-600 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10" />
                <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-[100px]" />

                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <h2 className="text-3xl lg:text-5xl font-bold mb-6">Ready to automate?</h2>
                    <p className="text-brand-100 text-lg mb-10 max-w-2xl mx-auto">
                        Start building workflows in minutes. No credit card required.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            onClick={onStart}
                            className="px-8 py-4 bg-white text-brand-600 rounded-full font-bold text-sm hover:bg-brand-50 transition-all shadow-xl flex items-center gap-2"
                        >
                            Start Building Free
                            <ArrowRight className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onNavigate('docs')}
                            className="px-8 py-4 bg-brand-500 text-white rounded-full font-bold text-sm hover:bg-brand-400 transition-all border border-brand-400"
                        >
                            Read Documentation
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 border-t border-slate-200 bg-white text-slate-500 text-sm">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Logo className="w-8 h-8" />
                        <span className="text-lg font-bold text-slate-900">Blupe</span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-8">
                        <button onClick={() => onNavigate('landing')} className="hover:text-slate-900 transition-colors">Home</button>
                        <button onClick={() => onNavigate('docs')} className="hover:text-slate-900 transition-colors">Documentation</button>
                        <button onClick={() => onNavigate('security')} className="hover:text-slate-900 transition-colors">Security</button>
                        <button onClick={() => onNavigate('terms')} className="hover:text-slate-900 transition-colors">Terms</button>
                        <button onClick={() => onNavigate('privacy')} className="hover:text-slate-900 transition-colors">Privacy</button>
                    </div>
                    <div className="text-slate-500">
                        <a href="mailto:team@blupe.space" className="hover:text-brand-600">team@blupe.space</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default FeaturesPage;
