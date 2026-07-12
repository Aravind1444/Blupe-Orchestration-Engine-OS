import React, { useState } from 'react';
import { ArrowRight, Zap, Shield, PlayCircle, CheckCircle2, FormInput, Mail, GitFork, Brain, PauseCircle, Box, History, Sparkles, Check, ChevronRight, Lock, Server, Key, Eye, LayoutGrid, Globe, Code2, Slack, Table, Radio, Rss, ArrowDown, Lightbulb, Braces, Clock, Layers, Bot, MessageSquare, CreditCard, MessageCircle } from 'lucide-react';
import { PageView } from '../types';
import { BillingService } from '../services/billing';
import { auth } from '../services/supabase';
import { Logo } from './Logo';

interface LandingPageProps {
    onStart: () => void;
    onNavigate: (page: PageView) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart, onNavigate }) => {
    const [loadingPayment, setLoadingPayment] = useState(false);

    const handleProUpgrade = async () => {
        const user = await auth.getUser();
        if (!user) {
            sessionStorage.setItem('pending_payment_action', 'pro_upgrade');
            onStart(); // Trigger login if not auth
            return;
        }

        setLoadingPayment(true);
        try {
            await BillingService.initiateCheckout('pro', user.email, () => {
                alert("Upgrade Successful! Welcome to Pro.");
                window.location.reload();
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingPayment(false);
        }
    };

    const scrollToPricing = () => {
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="h-screen w-full bg-[#ffffff] text-slate-900 font-sans overflow-y-auto overflow-x-hidden selection:bg-brand-100 custom-scrollbar">

            {/* Navbar */}
            <nav className="fixed w-full z-50 top-0 left-0 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        <Logo className="w-10 h-10" />
                        <span className="text-xl font-bold tracking-tight text-slate-900">Blupe</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-500">
                        <button onClick={() => onNavigate('features')} className="hover:text-slate-900 transition-colors">Features</button>
                        <button onClick={() => onNavigate('docs')} className="hover:text-slate-900 transition-colors">Documentation</button>
                        <button onClick={scrollToPricing} className="hover:text-slate-900 transition-colors">Pricing</button>
                        <button onClick={() => onNavigate('security')} className="hover:text-slate-900 transition-colors">Security</button>
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={onStart} className="text-sm font-medium bg-slate-900 text-white px-5 py-2 rounded-full hover:bg-slate-800 transition-colors font-semibold shadow-lg shadow-slate-900/10">
                            Sign In
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="relative pt-48 pb-16 lg:pt-48 lg:pb-32 overflow-hidden flex flex-col justify-center border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] md:w-[1200px] h-[600px] bg-brand-100/40 rounded-full blur-[120px] -z-10 opacity-60" />

                <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-brand-600 text-xs font-bold mb-6 lg:mb-8 animate-in slide-up duration-500 shadow-sm">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                        </span>
                        New: Autonomous AI Agents & AI Flow Generator
                    </div>

                    <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-slate-900 tracking-tight mb-6 lg:mb-8 leading-[1.1] animate-in slide-up duration-700 delay-100">
                        Orchestrate
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600 mx-2 lg:mx-3">Any Process</span>
                        <br className="hidden sm:block" />in One Workflow
                    </h1>

                    <p className="text-base sm:text-lg lg:text-xl text-slate-600 max-w-2xl mx-auto mb-8 lg:mb-10 leading-relaxed animate-in slide-up duration-700 delay-200 px-4 sm:px-0">
                        The enterprise-grade OS for AI Agents. Connect to any AI model and automate your workflows with no code.
                        Deploy public forms, run scheduled jobs, and connect securely to your own backend.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in slide-up duration-700 delay-300 w-full sm:w-auto px-4 sm:px-0">
                        <button
                            onClick={onStart}
                            className="group relative px-8 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-full font-semibold text-sm transition-all shadow-xl shadow-brand-500/30 w-full sm:w-auto"
                        >
                            Start Building Free
                            <ArrowRight className="inline-block ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <button onClick={() => onNavigate('docs')} className="px-8 py-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-full font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto">
                            <Code2 className="w-4 h-4" />
                            View Documentation
                        </button>
                    </div>
                </div>
            </div>

            {/* ENTERPRISE SECTION */}
            <div className="py-16 lg:py-24 bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-12 lg:mb-20">
                        <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">Why Choose Blupe?</h2>
                        <p className="text-slate-500 max-w-2xl mx-auto text-base lg:text-lg">Scale your operations without scaling your resources. Blupe bridges the gap between manual processes and autonomous AI execution.</p>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center">
                        <div className="flex-1 space-y-8 lg:space-y-12">
                            <div className="flex gap-5">
                                <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 shadow-sm">
                                    <FormInput className="w-6 h-6 lg:w-7 lg:h-7 text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg lg:text-xl font-bold text-slate-900 mb-2">Automate Boredom Away</h3>
                                    <p className="text-slate-600 leading-relaxed text-sm lg:text-base">Stop copy-pasting data. Turn any workflow into a self-running agent that captures leads, handles support tickets, and processes data 24/7.</p>
                                </div>
                            </div>

                            <div className="flex gap-5">
                                <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 shadow-sm">
                                    <Mail className="w-6 h-6 lg:w-7 lg:h-7 text-purple-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg lg:text-xl font-bold text-slate-900 mb-2">Enterprise-Grade Reliability</h3>
                                    <p className="text-slate-600 leading-relaxed text-sm lg:text-base">Built on a secure, vendor-agnostic architecture. Connect your own SMTP, database, and APIs without lock-in.</p>
                                </div>
                            </div>

                            <div className="flex gap-5">
                                <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 shadow-sm">
                                    <Shield className="w-6 h-6 lg:w-7 lg:h-7 text-emerald-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg lg:text-xl font-bold text-slate-900 mb-2">Top Tier Security</h3>
                                    <p className="text-slate-600 leading-relaxed text-sm lg:text-base">Your API keys never leave your control with BYOK secrets. Critical data is securely stored. Industry standard security with row level access control.</p>
                                </div>
                            </div>

                            {/* <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 text-sm font-medium text-slate-400">
                                <span>Trusted by builders at:</span>
                                <div className="flex gap-4 opacity-70 grayscale">
                                    <span className="font-bold tracking-tight">Acme Corps</span>
                                    <span className="font-bold tracking-tight">StarkInd</span>
                                    <span className="font-bold tracking-tight">Umbrella</span>
                                </div>
                            </div> */}
                        </div>

                        {/* Right Column: ROI Visual (COMPACT & SLEEK) */}
                        <div className="flex-1 w-full flex justify-center lg:justify-end">
                            <div className="relative w-full max-w-sm">
                                {/* Card Container */}
                                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] p-6 relative z-10">

                                    {/* Hanging Badge */}
                                    <div className="absolute -top-3 right-6 bg-[#4F46E5] text-white text-[10px] font-bold px-3 py-1 rounded shadow-lg z-20 tracking-wider">
                                        ROI IMPACT
                                    </div>

                                    <div className="space-y-4 mt-2">
                                        {/* Manual Row */}
                                        <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-3">
                                            <span className="text-slate-500 font-semibold text-xs">Manual Process</span>
                                            <span className="font-mono text-red-500 font-bold text-xs bg-red-50 px-2 py-1 rounded">40h/week</span>
                                        </div>

                                        {/* Arrow */}
                                        <div className="flex justify-center text-slate-300">
                                            <ArrowDown className="w-4 h-4 animate-bounce" />
                                        </div>

                                        {/* Blupe Row */}
                                        <div className="flex items-center justify-between bg-[#F0FDF4] border border-[#DCFCE7] rounded-lg p-3 shadow-sm">
                                            <span className="text-emerald-800 font-bold text-xs">Blupe Auto</span>
                                            <span className="font-mono text-emerald-600 font-bold text-xs bg-white px-2 py-1 rounded shadow-sm">5m/week</span>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="mt-5 pt-4 border-t border-slate-50 flex items-center justify-between gap-2 text-[9px] font-medium text-slate-400 uppercase tracking-wide">
                                        <div className="flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                            <span>Instant deploy</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                            <span>Zero maintenance</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Glow Effect */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-brand-100/50 rounded-full blur-3xl -z-0 opacity-50"></div>
                            </div>
                        </div>
                    </div>
                </div >
            </div >

            {/* CAPABILITIES BENTO GRID */}
            < div className="py-24 bg-slate-50 border-b border-slate-200" >
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">Enterprise Capabilities</h2>
                        <p className="text-slate-500 max-w-2xl mx-auto">Blupe isn't just a wrapper. It's a full-stack execution engine designed for complexity.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-auto md:auto-rows-[280px]">

                        {/* Model Agnostic (Featured Card) */}
                        <div className="bg-[#0B0F19] rounded-3xl p-8 border border-slate-800 relative overflow-hidden group hover:shadow-xl transition-all duration-300 md:col-span-2 md:row-span-1">
                            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10" />
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-10 -mt-10 opacity-60" />

                            <div className="relative z-10 h-full flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Brain className="w-6 h-6 text-indigo-400" />
                                        <span className="text-indigo-400 font-bold uppercase tracking-wider text-xs">Unified Intelligence Layer</span>
                                    </div>
                                    <h3 className="text-3xl font-bold text-white mb-3">One Interface. Any Model.</h3>
                                    <p className="text-slate-400 max-w-md text-sm leading-relaxed">
                                        Mix and match models in the same workflow. Route requests to the cheapest or smartest model dynamically.
                                    </p>
                                </div>

                                <div className="flex gap-3 flex-wrap mt-6">
                                    <span className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-mono border border-white/10">OpenAI</span>
                                    <span className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-mono border border-white/10">Anthropic</span>
                                    <span className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-mono border border-white/10">Gemini</span>
                                    <span className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-mono border border-white/10">Groq</span>
                                    <span className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-mono border border-white/10">Ollama</span>
                                </div>
                            </div>
                        </div>

                        {/* Logic Card */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-200 relative overflow-hidden group hover:shadow-xl transition-all duration-300 md:col-span-2">
                            <div className="relative z-10">
                                <div className="w-12 h-12 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center mb-6">
                                    <GitFork className="w-6 h-6 text-slate-700" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-3">Logic & Branching</h3>
                                <p className="text-slate-600 text-sm mb-6">Build real software visually. Use conditions, loops, and switch routers.</p>
                            </div>
                            <div className="absolute bottom-6 right-6 flex gap-2">
                                <span className="px-2 py-1 rounded-full bg-slate-100 text-[10px] font-mono text-slate-500 border border-slate-200">if (x &gt; 0)</span>
                            </div>
                        </div>

                        {/* Human Approvals */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-200 relative overflow-hidden group hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 bg-rose-50 rounded-2xl border border-rose-100 flex items-center justify-center mb-6">
                                <PauseCircle className="w-6 h-6 text-rose-600" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Human Approvals</h3>
                            <p className="text-slate-600 text-sm">Pause execution for human review. Approve drafts via email or dashboard.</p>
                        </div>

                        {/* Native MCP Support */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-200 relative overflow-hidden group hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center mb-6">
                                <Box className="w-6 h-6 text-slate-700" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Native MCP Support</h3>
                            <p className="text-slate-600 text-sm">Connect to standard <strong>Model Context Protocol</strong> servers. Execute sandboxed local tools and external APIs securely.</p>
                        </div>

                        {/* Observability */}
                        <div className="bg-white rounded-3xl p-8 border border-slate-200 relative overflow-hidden group hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-center mb-6">
                                <History className="w-6 h-6 text-emerald-600" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">Full Observability</h3>
                            <p className="text-slate-600 text-sm">Replay runs step-by-step. Track token usage and costs per execution.</p>
                        </div>

                        {/* AI Flow Generator - NEW */}
                        <div className="bg-gradient-to-br from-brand-50 to-purple-50 rounded-3xl p-8 border border-brand-200 relative overflow-hidden group hover:shadow-xl transition-all duration-300">
                            <div className="w-12 h-12 bg-white rounded-2xl border border-brand-200 flex items-center justify-center mb-6 shadow-sm">
                                <Sparkles className="w-6 h-6 text-brand-600" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">AI Onboarding Wizard</h3>
                            <p className="text-slate-600 text-sm">Draft flows with plain prompts, select category blueprints, and run sequential AI refinement loops before importing.</p>
                        </div>
                    </div>
                </div>
            </div >

            {/* EXAMPLES SECTION */}
            < div className="py-24 bg-white border-b border-slate-200" >
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">What you can build</h2>
                        <p className="text-slate-500">From simple automations to complex AI agents. Here are a few examples.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Example 1 */}
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 hover:border-brand-200 transition-colors">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><Rss className="w-5 h-5" /></div>
                                <ArrowRight className="w-4 h-4 text-slate-300" />
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Brain className="w-5 h-5" /></div>
                                <ArrowRight className="w-4 h-4 text-slate-300" />
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Mail className="w-5 h-5" /></div>
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg mb-2">AI News Digest</h3>
                            <p className="text-sm text-slate-600 mb-4">
                                Every morning, fetch top news from RSS feeds, use AI to summarize them into a briefing, and email it to your team.
                            </p>
                            <div className="text-xs font-mono text-slate-500 bg-white p-3 rounded border border-slate-200">
                                0 9 * * * (Daily at 9 AM)
                            </div>
                        </div>

                        {/* Example 2 */}
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 hover:border-brand-200 transition-colors">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><FormInput className="w-5 h-5" /></div>
                                <ArrowRight className="w-4 h-4 text-slate-300" />
                                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Lightbulb className="w-5 h-5" /></div>
                                <ArrowRight className="w-4 h-4 text-slate-300" />
                                <div className="p-2 bg-[#E01E5A]/10 text-[#E01E5A] rounded-lg"><Slack className="w-5 h-5" /></div>
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg mb-2">Smart Lead Qualification</h3>
                            <p className="text-sm text-slate-600 mb-4">
                                When a form is submitted, use Reasoning AI to research the company and score the lead. Alert high-value leads in Slack.
                            </p>
                            <div className="text-xs font-mono text-slate-500 bg-white p-3 rounded border border-slate-200">
                                webhook_trigger: /api/leads
                            </div>
                        </div>

                        {/* Example 3 */}
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 hover:border-brand-200 transition-colors">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><Table className="w-5 h-5" /></div>
                                <ArrowRight className="w-4 h-4 text-slate-300" />
                                <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><Code2 className="w-5 h-5" /></div>
                                <ArrowRight className="w-4 h-4 text-slate-300" />
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Brain className="w-5 h-5" /></div>
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg mb-2">Data Enrichment Agent</h3>
                            <p className="text-sm text-slate-600 mb-4">
                                Watch Google Sheets for new rows. Clean data with Python script, then fetch missing info via Web Search + AI.
                            </p>
                            <div className="text-xs font-mono text-slate-500 bg-white p-3 rounded border border-slate-200">
                                Batch Process: New Rows Only
                            </div>
                        </div>
                    </div>
                </div>
            </div >

            {/* Integrations Grid */}
            < div className="py-24 bg-white" >
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">Powerful Integrations</h2>
                        <p className="text-slate-500">Connect to the tools your business runs on.</p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { icon: FormInput, label: "Public Forms", color: "text-blue-600" },
                            { icon: Mail, label: "SMTP Server", color: "text-slate-600" },
                            { icon: Slack, label: "Slack Block Kit", color: "text-[#E01E5A]" },
                            { icon: Table, label: "Google Sheets", color: "text-green-600" },
                            { icon: GitFork, label: "Logic Router", color: "text-cyan-600" },
                            { icon: Radio, label: "Webhooks", color: "text-orange-500" },
                            { icon: Rss, label: "RSS Feeds", color: "text-orange-500" },
                            { icon: Sparkles, label: "AI Generator", color: "text-brand-600" },
                            // New Integrations
                            { icon: Globe, label: "Web Search", color: "text-indigo-500" },
                            { icon: Code2, label: "JavaScript / Code", color: "text-yellow-600" },
                            { icon: Lightbulb, label: "Reasoning AI", color: "text-amber-500" },
                            { icon: Eye, label: "AI Vision", color: "text-purple-500" },
                            { icon: Braces, label: "JSON Utils", color: "text-slate-500" },
                            { icon: Clock, label: "Cron Scheduler", color: "text-red-500" },
                            { icon: Server, label: "MCP Protocol", color: "text-slate-800" },
                            { icon: Layers, label: "Batch Process", color: "text-blue-400" },
                            { icon: Bot, label: "AI Agent", color: "text-brand-600" },
                            { icon: MessageSquare, label: "WhatsApp Cloud", color: "text-emerald-500" },
                            { icon: CreditCard, label: "Razorpay Actions", color: "text-blue-500" },
                            { icon: MessageCircle, label: "Telegram Bots", color: "text-sky-500" },
                        ].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-brand-200 hover:shadow-md transition-all bg-white group hover:-translate-y-1">
                                <div className={`p-2 bg-slate-50 rounded-lg group-hover:scale-110 transition-transform`}>
                                    <item.icon className={`w-5 h-5 ${item.color}`} />
                                </div>
                                <span className="font-bold text-slate-700 text-sm">{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div >

            {/* Pricing Section (Polished) */}
            < div id="pricing" className="py-24 bg-slate-50 border-t border-slate-200" >
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl lg:text-4xl font-bold text-slate-900 mb-4">Pricing & Credits</h2>
                        <p className="text-slate-500">Simple, transparent pricing for teams of all sizes.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {/* Starter */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col hover:border-slate-300 transition-colors">
                            <h3 className="text-lg font-bold text-slate-900">Starter</h3>
                            <div className="text-4xl font-bold mt-4 mb-2 text-slate-900">$0 <span className="text-base font-normal text-slate-500">/mo</span></div>
                            <p className="text-sm text-slate-500 mb-8">For hobbyists and testing.</p>
                            <ul className="space-y-4 mb-8 text-sm text-slate-600 flex-1">
                                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" /> 500 Credits / mo</li>
                                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" /> Local Secrets (BYOK)</li>
                                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" /> 10 Active Flows</li>
                            </ul>
                            <button onClick={onStart} className="w-full py-3.5 border-2 border-slate-100 rounded-xl hover:border-slate-900 text-slate-900 font-bold transition-all bg-white">Start Free</button>
                        </div>

                        {/* Pro (Dark Highlighted) */}
                        <div className="bg-[#0f172a] text-white p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden transform md:-translate-y-4 flex flex-col">
                            <div className="absolute top-0 right-0 bg-brand-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">Popular</div>
                            <h3 className="text-lg font-bold">Pro</h3>
                            <div className="text-4xl font-bold mt-4 mb-2">INR 1799 <span className="text-base font-normal text-slate-400">/mo ($20)</span></div>
                            <p className="text-sm text-slate-400 mb-8">For scaling automations.</p>
                            <ul className="space-y-4 mb-8 text-sm text-slate-300 flex-1">
                                <li className="flex gap-3"><Check className="w-5 h-5 text-brand-400 shrink-0" /> 5,000 Credits / mo</li>
                                <li className="flex gap-3"><Check className="w-5 h-5 text-brand-400 shrink-0" /> Cloud Secret Sync</li>
                                <li className="flex gap-3"><Check className="w-5 h-5 text-brand-400 shrink-0" /> 50 Flows Limit</li>
                                <li className="flex gap-3"><Check className="w-5 h-5 text-brand-400 shrink-0" /> Public Flow Deployment</li>
                            </ul>

                            {/* Custom Razorpay Trigger Button */}
                            <button
                                onClick={handleProUpgrade}
                                disabled={loadingPayment}
                                className="w-full py-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-900/50 flex items-center justify-center gap-2"
                            >
                                {loadingPayment ? (
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Zap className="w-4 h-4 fill-current" />
                                )}
                                Get Pro
                            </button>
                        </div>

                        {/* Contact */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col hover:border-slate-300 transition-colors">
                            <h3 className="text-lg font-bold text-slate-900">Custom</h3>
                            <div className="text-4xl font-bold mt-4 mb-2 text-slate-900">Contact</div>
                            <p className="text-sm text-slate-500 mb-8">For teams and high volume.</p>
                            <ul className="space-y-4 mb-8 text-sm text-slate-600 flex-1">
                                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" /> 15,000+ Credits / mo</li>
                                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" /> Priority Support</li>
                                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" /> Custom SMTP Relay</li>
                                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" /> On-demand Feature Addition</li>
                            </ul>
                            <button onClick={() => window.location.href = 'mailto:team@blupe.space'} className="w-full py-3.5 border-2 border-slate-100 rounded-xl hover:border-slate-900 text-slate-900 font-bold transition-all bg-white">Contact Sales</button>
                        </div>
                    </div>
                </div>
            </div >

            {/* Footer */}
            < footer className="py-12 border-t border-slate-200 bg-white text-slate-500 text-sm" >
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-2 mb-6">
                        <Logo className="w-8 h-8" />
                        <span className="text-lg font-bold text-slate-900">Blupe</span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-8">
                        <button onClick={() => onNavigate('features')} className="hover:text-slate-900 transition-colors">Features</button>
                        <button onClick={() => onNavigate('security')} className="hover:text-slate-900 transition-colors">Security</button>
                        <button onClick={() => onNavigate('terms')} className="hover:text-slate-900 transition-colors">Terms of Service</button>
                        <button onClick={() => onNavigate('privacy')} className="hover:text-slate-900 transition-colors">Privacy Policy</button>
                        <button onClick={() => onNavigate('refund')} className="hover:text-slate-900 transition-colors">Refund Policy</button>
                    </div>
                    <div className="text-slate-500">
                        <a href="mailto:team@blupe.space" className="hover:text-brand-600">team@blupe.space</a>
                    </div>
                </div>
            </footer >
        </div >
    );
};

export default LandingPage;
