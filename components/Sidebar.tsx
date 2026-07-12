import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { NodeType, AdminNode, NodeCategory } from '../types';
import {
    Zap, Play, Split, Sparkles, Globe, Code, FileText, Terminal, StickyNote,
    Upload, Radio, Clock, Slack, Mail, Table, Layers, Eye, ChevronDown, ChevronRight,
    GitFork, Hourglass, Rss, Braces, Calculator, Type, FormInput, Brain, PauseCircle, Box, Search, Lightbulb,
    Database, Server, Cloud, Cpu, Star, Loader2, CreditCard, MessageSquare, MessageCircle, Bot
} from 'lucide-react';
import clsx from 'clsx';
import { Logo } from './Logo';
import { admin } from '../services/supabase';
import { CUSTOM_NODE_DRAG_MIME, isBuiltInNodeType } from '../services/nodeContract';

interface SidebarProps {
    onBack: () => void;
    onAddNode?: (nodeType: string, customNodeDefinition?: AdminNode) => void;
}

// Context for adding nodes on click
const SidebarContext = createContext<((type: string) => void) | undefined>(undefined);

// Icon mapping for dynamic nodes
const iconMap: Record<string, any> = {
    'Play': Play, 'Zap': Zap, 'Brain': Brain, 'Globe': Globe, 'Code': Code,
    'Box': Box, 'Mail': Mail, 'Table': Table, 'GitBranch': GitFork, 'GitFork': GitFork,
    'Split': Split, 'Timer': Hourglass, 'Clock': Clock, 'Eye': Eye, 'Layers': Layers,
    'Rss': Rss, 'Braces': Braces, 'Calculator': Calculator, 'Type': Type, 'FileText': FileText,
    'Terminal': Terminal, 'StickyNote': StickyNote, 'Radio': Radio, 'FormInput': FormInput,
    'Database': Database, 'Server': Server, 'Cloud': Cloud, 'Cpu': Cpu, 'Star': Star,
    'MessageSquare': MessageSquare, 'MessageCircle': MessageCircle, 'Slack': Slack, 'Search': Search, 'Lightbulb': Lightbulb,
    'UserCheck': PauseCircle, 'TextCursor': FileText
};

// Map category names to sidebar category IDs
const categoryToSidebarId: Record<string, string> = {
    'Triggers': 'triggers',
    'AI': 'ai',
    'Logic': 'logic',
    'Data': 'utils',
    'IO': 'io',
    'Integrations': 'integrations',
    'Custom': 'integrations' // Custom nodes default to Integrations
};

export const Sidebar: React.FC<SidebarProps> = ({ onBack, onAddNode }) => {
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
        'triggers': true,
        'ai': true,
        'logic': true,
        'utils': true,
        'integrations': true,
        'io': false
    });
    const [customNodes, setCustomNodes] = useState<AdminNode[]>([]);
    const [loadingCustom, setLoadingCustom] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch custom nodes from database
    useEffect(() => {
        const loadCustomNodes = async () => {
            try {
                const nodes = await admin.getNodes();
                const custom = nodes.filter((n: AdminNode) =>
                    n.is_active && !isBuiltInNodeType(n.node_type)
                );
                setCustomNodes(custom);
            } catch (e) {
                console.error('Failed to load custom nodes:', e);
            } finally {
                setLoadingCustom(false);
            }
        };
        loadCustomNodes();
    }, []);

    // Group custom nodes by their category for insertion into respective sections
    const customNodesByCategory = useMemo(() => {
        const grouped: Record<string, AdminNode[]> = {};
        customNodes.forEach(node => {
            const catId = categoryToSidebarId[node.category] || 'integrations';
            if (!grouped[catId]) grouped[catId] = [];
            grouped[catId].push(node);
        });
        return grouped;
    }, [customNodes]);

    const toggle = (key: string) => {
        setOpenCategories(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Filter function for search
    const matchesSearch = (label: string, description: string) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return label.toLowerCase().includes(q) || description.toLowerCase().includes(q);
    };

    // Auto-expand all categories when searching
    useEffect(() => {
        if (searchQuery) {
            setOpenCategories({
                'triggers': true,
                'ai': true,
                'logic': true,
                'utils': true,
                'integrations': true,
                'io': true
            });
        }
    }, [searchQuery]);

    return (
        <SidebarContext.Provider value={onAddNode}>
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-10 shadow-xl flex-shrink-0">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 hover:opacity-70 transition-opacity cursor-pointer"
                    title="Back to Dashboard"
                >
                    <Logo className="w-6 h-6" />
                    <div>
                        <h1 className="text-sm font-bold text-slate-900 tracking-tight">Blupe</h1>
                    </div>
                </button>
            </div>

            {/* Search Input */}
            <div className="p-2 border-b border-slate-100">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400 transition-all"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">

                <Category title="Triggers" id="triggers" isOpen={openCategories['triggers']} onToggle={() => toggle('triggers')}>
                    {matchesSearch("Manual Start", "Trigger manually") && <SidebarItem type={NodeType.START} icon={Play} label="Manual Start" color="text-pink-500" description="Trigger manually" onAddNode={onAddNode} />}
                    {matchesSearch("Form Trigger", "Public Input Form") && <SidebarItem type={NodeType.FORM_TRIGGER} icon={FormInput} label="Form Trigger" color="text-blue-600" description="Public Input Form" onAddNode={onAddNode} />}
                    {matchesSearch("Webhook", "HTTP POST trigger") && <SidebarItem type={NodeType.WEBHOOK} icon={Radio} label="Webhook" color="text-orange-500" description="HTTP POST trigger" onAddNode={onAddNode} />}
                    {matchesSearch("Schedule", "Cron job / Interval") && <SidebarItem type={NodeType.SCHEDULE} icon={Clock} label="Schedule" color="text-violet-500" description="Cron job / Interval" onAddNode={onAddNode} />}
                    {matchesSearch("WhatsApp Trigger", "Incoming WhatsApp Message") && <SidebarItem type={NodeType.WHATSAPP_TRIGGER} icon={MessageSquare} label="WhatsApp Trigger" color="text-emerald-500" description="Incoming WhatsApp Message" onAddNode={onAddNode} />}
                    {matchesSearch("Razorpay Trigger", "Razorpay Payment Events") && <SidebarItem type={NodeType.RAZORPAY_TRIGGER} icon={CreditCard} label="Razorpay Trigger" color="text-blue-500" description="Razorpay Payment Events" onAddNode={onAddNode} />}
                    {matchesSearch("Telegram Trigger", "Incoming Telegram Message") && <SidebarItem type={NodeType.TELEGRAM_TRIGGER} icon={MessageCircle} label="Telegram Trigger" color="text-sky-500" description="Incoming Telegram Message" onAddNode={onAddNode} />}
                    {matchesSearch("Discord Trigger", "Discord Slash Command") && <SidebarItem type={NodeType.DISCORD_TRIGGER} icon={Bot} label="Discord Trigger" color="text-indigo-500" description="Discord Slash Command" onAddNode={onAddNode} />}
                    {/* Custom Trigger Nodes */}
                    {(customNodesByCategory['triggers'] || [])
                        .filter(n => matchesSearch(n.display_name, n.description || ''))
                        .map(node => (
                            <DynamicSidebarItem key={node.id} node={node} iconMap={iconMap} onAddNode={onAddNode} />
                        ))}
                </Category>

                <Category title="AI & Logic" id="ai" isOpen={openCategories['ai']} onToggle={() => toggle('ai')}>
                    {matchesSearch("Unified AI", "GPT-4, Claude, Llama") && <SidebarItem type={NodeType.LLM} icon={Brain} label="Unified AI" color="text-indigo-600" description="GPT-4, Claude, Llama" onAddNode={onAddNode} />}
                    {matchesSearch("Reasoning", "Chain-of-thought agentic") && <SidebarItem type={NodeType.REASONING} icon={Lightbulb} label="Reasoning" color="text-amber-500" description="Chain-of-thought agentic" onAddNode={onAddNode} />}
                    {matchesSearch("AI Agent", "Autonomous React loop") && <SidebarItem type={NodeType.AGENT} icon={Cpu} label="AI Agent" color="text-violet-600" description="Autonomous React loop" onAddNode={onAddNode} />}
                    {matchesSearch("Vision AI", "Image Analysis") && <SidebarItem type={NodeType.AI_VISION} icon={Eye} label="Vision AI" color="text-indigo-500" description="Image Analysis" onAddNode={onAddNode} />}
                    {matchesSearch("Batch Loop", "Run AI on List") && <SidebarItem type={NodeType.BATCH} icon={Layers} label="Batch Loop" color="text-fuchsia-500" description="Run AI on List" onAddNode={onAddNode} />}
                    {/* Custom AI Nodes */}
                    {(customNodesByCategory['ai'] || [])
                        .filter(n => matchesSearch(n.display_name, n.description || ''))
                        .map(node => (
                            <DynamicSidebarItem key={node.id} node={node} iconMap={iconMap} onAddNode={onAddNode} />
                        ))}
                </Category>

                <Category title="Control Flow" id="logic" isOpen={openCategories['logic']} onToggle={() => toggle('logic')}>
                    {matchesSearch("Approval", "Human in the loop") && <SidebarItem type={NodeType.APPROVAL} icon={PauseCircle} label="Approval" color="text-rose-500" description="Human in the loop" onAddNode={onAddNode} />}
                    {matchesSearch("Condition", "If / Else Branching") && <SidebarItem type={NodeType.CONDITION} icon={Split} label="Condition" color="text-orange-500" description="If / Else Branching" onAddNode={onAddNode} />}
                    {matchesSearch("Router", "Multi-path Switch") && <SidebarItem type={NodeType.ROUTER} icon={GitFork} label="Router" color="text-cyan-600" description="Multi-path Switch" onAddNode={onAddNode} />}
                    {matchesSearch("Wait", "Delay execution") && <SidebarItem type={NodeType.WAIT} icon={Hourglass} label="Wait" color="text-blue-500" description="Delay execution" onAddNode={onAddNode} />}
                    {matchesSearch("Code", "JS Transformation") && <SidebarItem type={NodeType.JAVASCRIPT} icon={Code} label="Code" color="text-yellow-600" description="JS Transformation" onAddNode={onAddNode} />}
                    {/* Custom Logic Nodes */}
                    {(customNodesByCategory['logic'] || [])
                        .filter(n => matchesSearch(n.display_name, n.description || ''))
                        .map(node => (
                            <DynamicSidebarItem key={node.id} node={node} iconMap={iconMap} onAddNode={onAddNode} />
                        ))}
                </Category>

                <Category title="Data & Utils" id="utils" isOpen={openCategories['utils']} onToggle={() => toggle('utils')}>
                    {matchesSearch("JSON Helper", "Parse/Stringify") && <SidebarItem type={NodeType.JSON} icon={Braces} label="JSON Helper" color="text-yellow-700" description="Parse/Stringify" onAddNode={onAddNode} />}
                    {matchesSearch("Math", "Calculations") && <SidebarItem type={NodeType.MATH} icon={Calculator} label="Math" color="text-teal-500" description="Calculations" onAddNode={onAddNode} />}
                    {matchesSearch("Text Tool", "Trim/Case/Split") && <SidebarItem type={NodeType.TEXT} icon={Type} label="Text Tool" color="text-sky-500" description="Trim/Case/Split" onAddNode={onAddNode} />}
                    {/* Custom Data Nodes */}
                    {(customNodesByCategory['utils'] || [])
                        .filter(n => matchesSearch(n.display_name, n.description || ''))
                        .map(node => (
                            <DynamicSidebarItem key={node.id} node={node} iconMap={iconMap} onAddNode={onAddNode} />
                        ))}
                </Category>

                <Category title="Integrations" id="integrations" isOpen={openCategories['integrations']} onToggle={() => toggle('integrations')}>
                    {matchesSearch("MCP Tool", "Model Context Protocol") && <SidebarItem type={NodeType.MCP} icon={Box} label="MCP Tool" color="text-slate-700" description="Model Context Protocol" onAddNode={onAddNode} />}
                    {matchesSearch("HTTP Request", "REST API") && <SidebarItem type={NodeType.API_CALL} icon={Globe} label="HTTP Request" color="text-cyan-600" description="REST API" onAddNode={onAddNode} />}
                    {matchesSearch("RSS Feed", "Read XML Feeds") && <SidebarItem type={NodeType.RSS} icon={Rss} label="RSS Feed" color="text-orange-500" description="Read XML Feeds" onAddNode={onAddNode} />}
                    {matchesSearch("Slack", "Send Message") && <SidebarItem type={NodeType.SLACK} icon={Slack} label="Slack" color="text-[#E01E5A]" description="Send Message" onAddNode={onAddNode} />}
                    {matchesSearch("SMTP Email", "Send transactional email") && <SidebarItem type={NodeType.EMAIL} icon={Mail} label="SMTP Email" color="text-slate-600" description="Send transactional email" onAddNode={onAddNode} />}
                    {matchesSearch("Google Sheets", "Append Row") && <SidebarItem type={NodeType.SHEETS} icon={Table} label="Google Sheets" color="text-green-600" description="Append Row" onAddNode={onAddNode} />}
                    {matchesSearch("HubSpot", "CRM Operations") && <SidebarItem type={NodeType.HUBSPOT} icon={Globe} label="HubSpot" color="text-[#ff7a59]" description="CRM Operations" onAddNode={onAddNode} />}
                    {matchesSearch("Zapier Webhooks", "Trigger Zaps and send data") && <SidebarItem type={NodeType.ZAPIER_WEBHOOK} icon={Zap} label="Zapier Webhooks" color="text-[#FF4F00]" description="Trigger Zaps and send data" onAddNode={onAddNode} />}
                    {matchesSearch("Web Search", "Tavily Search") && <SidebarItem type={NodeType.WEB_SEARCH} icon={Search} label="Web Search" color="text-sky-600" description="Tavily Search" onAddNode={onAddNode} />}
                    {matchesSearch("Deep Research", "Comprehensive research") && <SidebarItem type={NodeType.DEEP_RESEARCH} icon={Search} label="Deep Research" color="text-amber-500" description="Comprehensive research" onAddNode={onAddNode} />}
                    {matchesSearch("Extract URL", "Parse webpage content") && <SidebarItem type={NodeType.EXTRACT_URL} icon={FileText} label="Extract URL" color="text-emerald-500" description="Parse webpage content" onAddNode={onAddNode} />}
                    {matchesSearch("Crawl Site", "Map entire website") && <SidebarItem type={NodeType.CRAWL_SITE} icon={Globe} label="Crawl Site" color="text-indigo-500" description="Map entire website" onAddNode={onAddNode} />}
                    {matchesSearch("WhatsApp Send", "Send WhatsApp Message") && <SidebarItem type={NodeType.WHATSAPP_SEND} icon={MessageSquare} label="WhatsApp Send" color="text-emerald-600" description="Send WhatsApp Message" onAddNode={onAddNode} />}
                    {matchesSearch("Razorpay Action", "Razorpay Operations") && <SidebarItem type={NodeType.RAZORPAY_ACTION} icon={CreditCard} label="Razorpay Action" color="text-blue-600" description="Razorpay Operations" onAddNode={onAddNode} />}
                    {matchesSearch("Telegram Send", "Send Telegram Message") && <SidebarItem type={NodeType.TELEGRAM_SEND} icon={MessageCircle} label="Telegram Send" color="text-sky-600" description="Send Telegram Message" onAddNode={onAddNode} />}
                    {matchesSearch("Discord Send", "Send Discord Message") && <SidebarItem type={NodeType.DISCORD_SEND} icon={Bot} label="Discord Send" color="text-indigo-500" description="Send Discord Message" onAddNode={onAddNode} />}
                    {/* Custom Integration Nodes */}
                    {(customNodesByCategory['integrations'] || [])
                        .filter(n => matchesSearch(n.display_name, n.description || ''))
                        .map(node => (
                            <DynamicSidebarItem key={node.id} node={node} iconMap={iconMap} onAddNode={onAddNode} />
                        ))}
                </Category>

                <Category title="I/O & Utils" id="io" isOpen={openCategories['io']} onToggle={() => toggle('io')}>
                    {matchesSearch("Input Data", "Static Text/JSON") && <SidebarItem type={NodeType.INPUT} icon={FileText} label="Input Data" color="text-purple-500" description="Static Text/JSON" onAddNode={onAddNode} />}
                    {matchesSearch("Final Output", "View Result") && <SidebarItem type={NodeType.OUTPUT} icon={Terminal} label="Final Output" color="text-emerald-600" description="View Result" onAddNode={onAddNode} />}
                    {matchesSearch("Note", "Documentation") && <SidebarItem type={NodeType.NOTE} icon={StickyNote} label="Note" color="text-indigo-500" description="Documentation" onAddNode={onAddNode} />}
                    {/* Custom IO Nodes */}
                    {(customNodesByCategory['io'] || [])
                        .filter(n => matchesSearch(n.display_name, n.description || ''))
                        .map(node => (
                            <DynamicSidebarItem key={node.id} node={node} iconMap={iconMap} onAddNode={onAddNode} />
                        ))}
                </Category>

                {loadingCustom && (
                    <div className="flex items-center justify-center py-3">
                        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    </div>
                )}

            </div>
        </div>
        </SidebarContext.Provider>
    );
};

const Category = ({ title, id, isOpen, onToggle, children }: any) => (
    <div className="mb-1">
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between p-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 hover:bg-slate-50 rounded transition-colors"
        >
            <span>{title}</span>
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        {isOpen && <div className="space-y-1.5 mt-1 px-1">{children}</div>}
    </div>
);

const SidebarItem = ({ type, icon: Icon, label, color, description, onAddNode }: any) => {
    const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div
            onClick={() => onAddNode?.(type)}
            onDragStart={(event) => onDragStart(event, type)}
            draggable
            className="group flex flex-col items-start p-3 bg-white border border-slate-200 rounded-lg cursor-grab hover:border-brand-500/50 hover:shadow-md hover:bg-slate-50/50 transition-all active:scale-[0.98] select-none"
        >
            <div className="flex items-center gap-2 mb-0.5">
                <Icon className={clsx("w-3.5 h-3.5", color)} />
                <span className="text-xs font-semibold text-slate-800">{label}</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight pl-0.5">{description}</p>
        </div>
    );
};

const DynamicSidebarItem = ({ node, iconMap, onAddNode }: { node: AdminNode; iconMap: Record<string, any>; onAddNode?: (nodeType: string, customNodeDefinition?: AdminNode) => void }) => {
    const Icon = iconMap[node.icon_name] || Box;

    const onDragStart = (event: React.DragEvent) => {
        event.dataTransfer.setData('application/reactflow', node.node_type);
        event.dataTransfer.setData(CUSTOM_NODE_DRAG_MIME, JSON.stringify(node));
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div
            onClick={() => onAddNode?.(node.node_type, node)}
            onDragStart={onDragStart}
            draggable
            className="group flex flex-col items-start p-3 bg-white border border-slate-200 rounded-lg cursor-grab hover:border-brand-500/50 hover:shadow-md hover:bg-slate-50/50 transition-all active:scale-[0.98] select-none"
        >
            <div className="flex items-center gap-2 mb-0.5">
                <Icon className="w-3.5 h-3.5" style={{ color: node.color }} />
                <span className="text-xs font-semibold text-slate-800">{node.display_name}</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-tight pl-0.5">{node.description || 'Custom node'}</p>
        </div>
    );
};
