import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, Wand2, AlertCircle, CheckCircle2, Coins, LayoutTemplate, ArrowRight } from 'lucide-react';
import { NodeType, NodeStatus } from '../types';
import { templates } from '../services/templates';
import { getAuthHeaders } from '../services/supabase';
import clsx from 'clsx';
import { isBuiltInNodeType, normalizeFlowNodes } from '../services/nodeContract';

interface AIFlowGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (nodes: any[], edges: any[]) => void;
    existingNodes?: any[];
    existingEdges?: any[];
    onDeductCredits?: (amount: number) => Promise<void>;
    userCredits?: number;
}

const SYSTEM_PROMPT = `You are Blupe AI, an expert specialized in building and modifying JSON-based workflow automations.

### CRITICAL INSTRUCTIONS FOR EDITING:
1. **PRESERVE IDs**: When improving a flow, YOU MUST USE THE EXACT SAME IDs for existing nodes. DO NOT regenerate IDs for nodes that already exist. Only generate new IDs for NEW nodes you add.
2. **MERGE DATA**: For existing nodes, keep their existing "data" properties unless you are specifically changing them.
3. **VARIABLES**: Pass data between nodes using double braces: \`{{sourceNodeId.output}}\`. 
   - Example: If Node A (id: "node-1") outputs a summary, Node B should use \`{{node-1.output}}\` in its content field.
   - ALWAYS use this syntax for connecting inputs/outputs.

### AVAILABLE NODE TYPES:
- **Triggers**: "start" (manual), "schedule" (cron), "webhook", "form_trigger", "whatsapp_trigger", "razorpay_trigger", "telegram_trigger", "discord_trigger" (slash command)
- **AI**: "llm" (text gen), "reasoning", "ai_vision", "batch"
- **Logic**: "condition", "router", "javascript", "wait", "approval"
- **Integrations**: "api_call", "rss", "slack", "email", "sheets", "web_search", "whatsapp_send", "razorpay_action", "telegram_send", "discord_send"
- **Data**: "json", "math", "text", "input", "output"

### JSON OUTPUT FORMAT:
Return ONLY valid JSON. No markdown formatting.
{
  "nodes": [
    {"id": "node-1", "type": "schedule", "position": {"x": 100, "y": 200}, "data": {"label": "Daily Trigger", "type": "schedule", "cronExpression": "0 9 * * *"}}
  ],
  "edges": [
    {"id": "e1-2", "source": "node-1", "target": "node-2", "animated": true}
  ]
}

### RULES:
- **Layout**: Position nodes logically (x increases by 300px/step). If branching, use Y offsets.
- **Completeness**: Always ensure the flow is logically complete and connected.
`;

export const AIFlowGenerator: React.FC<AIFlowGeneratorProps> = ({
    isOpen,
    onClose,
    onGenerate,
    existingNodes = [],
    existingEdges = [],
    onDeductCredits,
    userCredits = 0
}) => {
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [generatedFlow, setGeneratedFlow] = useState<{ nodes: any[], edges: any[] } | null>(null);
    const [mode, setMode] = useState<'create' | 'improve'>('create');
    const [activeTab, setActiveTab] = useState<'ai' | 'templates' | 'blank'>('ai');
    const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null);

    // Detect if user has existing nodes
    useEffect(() => {
        if (isOpen && existingNodes.length > 1) {
            setMode('improve');
        } else {
            setMode('create');
        }
    }, [isOpen, existingNodes]);

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError('Please describe what you want to automate');
            return;
        }

        if (userCredits < 10) {
            setError('Insufficient credits. AI generation costs 10 credits. Upgrade to Pro for 5,000 credits/month!');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Build context from existing nodes
            let contextPrompt = '';
            const currentNodes = generatedFlow ? generatedFlow.nodes : existingNodes;
            const currentEdges = generatedFlow ? generatedFlow.edges : existingEdges;
            const currentMode = (generatedFlow || existingNodes.length > 0) ? 'improve' : mode;

            if (currentMode === 'improve' && currentNodes.length > 0) {
                // Simplified context to save tokens, but keep essential structure
                const existingContext = currentNodes.map(n => ({
                    id: n.id,
                    type: n.type || n.data?.type,
                    label: n.data?.label,
                    // Pass specific fields that AI might need to know about
                    data: n.data
                }));
                const edgesContext = currentEdges.map(e => ({ id: e.id, source: e.source, target: e.target }));

                contextPrompt = `
                
--------------------------------------------------------------------------------
PRESENT STATE (The current flow you must edit):
NODES: ${JSON.stringify(existingContext, null, 2)}
EDGES: ${JSON.stringify(edgesContext, null, 2)}
--------------------------------------------------------------------------------
INSTRUCTION: ${prompt}
RULES: 
1. PRESERVE IDs of the nodes above if you keep them.
2. MODIFY settings if requested.
3. ADD new nodes/edges if needed.
4. RETURN the FULL complete JSON of the new flow state.
`;
            }

            const genHeaders = await getAuthHeaders({ 'Content-Type': 'application/json' });

            const response = await fetch('/api/llm', {
                method: 'POST',
                headers: genHeaders,
                body: JSON.stringify({
                    provider: 'gemini',
                    model: 'gemini-3.1-pro-preview',
                    prompt: currentMode === 'create' ? `Create a workflow automation for: ${prompt}` : contextPrompt,
                    system: SYSTEM_PROMPT,
                    temperature: 0.3,
                    maxTokens: 5000 // Higher limit for full flow definition
                })
            });

            if (!response.ok) throw new Error('Failed to generate flow');

            const data = await response.json();
            let flowJson;

            try {
                let jsonStr = data.text.trim();
                // Strip markdown code blocks if present
                if (jsonStr.startsWith('```')) {
                    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
                }
                flowJson = JSON.parse(jsonStr);
            } catch (parseErr) {
                throw new Error('AI returned invalid JSON. Please check your prompt and try again.');
            }

            if (!flowJson.nodes || !flowJson.edges) {
                throw new Error('Invalid flow structure received from AI.');
            }

            // Deduct credits for successful generation
            if (onDeductCredits) {
                await onDeductCredits(10);
            }

            // Normalization & Type Fixing
            const typeAliases: Record<string, string> = {
                'cron': NodeType.SCHEDULE, 'timer': NodeType.SCHEDULE, 'scheduled': NodeType.SCHEDULE,
                'ai': NodeType.LLM, 'gpt': NodeType.LLM, 'llm': NodeType.LLM,
                'http': NodeType.API_CALL, 'rest': NodeType.API_CALL,
                'code': NodeType.JAVASCRIPT, 'delay': NodeType.WAIT, 'if': NodeType.CONDITION,
                'whatsapp': NodeType.WHATSAPP_SEND, 'whatsapp_trigger': NodeType.WHATSAPP_TRIGGER,
                'razorpay': NodeType.RAZORPAY_ACTION, 'razorpay_trigger': NodeType.RAZORPAY_TRIGGER,
                'telegram': NodeType.TELEGRAM_SEND, 'telegram_trigger': NodeType.TELEGRAM_TRIGGER,
                'discord': NodeType.DISCORD_SEND, 'discord_trigger': NodeType.DISCORD_TRIGGER
            };

            const processedNodes = flowJson.nodes.map((node: any, index: number) => {
                let nodeType = node.type || node.data?.type || NodeType.INPUT;
                if (typeAliases[nodeType.toLowerCase()]) nodeType = typeAliases[nodeType.toLowerCase()];

                return {
                    ...node,
                    id: node.id || `ai-node-${Date.now()}-${index}`, // Ensure ID
                    type: isBuiltInNodeType(nodeType) ? nodeType : 'default',
                    // If no position provided, try to layout reasonably (though AI should provide it)
                    position: node.position || { x: 100 + index * 300, y: 200 },
                    data: {
                        ...node.data,
                        type: nodeType,
                        status: NodeStatus.IDLE,
                        label: node.data?.label || node.label || `Node ${index + 1}`
                    }
                };
            });

            setGeneratedFlow({ ...flowJson, nodes: normalizeFlowNodes(processedNodes) });

        } catch (err: any) {
            setError(err.message || 'Failed to connect to AI service');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (generatedFlow) {

            if (mode === 'improve' && existingNodes.length > 0) {
                // Smart Merge Logic
                const mergedNodes = [...generatedFlow.nodes];

                // If the generated set missed any existing nodes that weren't supposed to be deleted?
                // The prompt asks for FULL flow, so we assume the AI "deleted" them if missing.
                // However, for safety, if we wanted to be non-destructive, we could check.
                // For now, trusting the "Full Flow" return model as it allows deletion.

                // BUT, to preserve local data not seen by AI (like secrets?), we merge keys.
                // We map generated nodes to existing nodes by ID.
                const finalNodes = generatedFlow.nodes.map((genNode: any) => {
                    const original = existingNodes.find(n => n.id === genNode.id);
                    if (original) {
                        return {
                            ...genNode,
                            data: {
                                ...original.data, // Keep original data first
                                ...genNode.data,  // Overwrite with any AI updates
                                ...genNode.data.output ? { output: original.data.output } : {} // Preserve output only if not explicitly overwritten? Actually let's just keep original output to be safe
                            }
                        };
                    }
                    return genNode;
                });

                onGenerate(finalNodes, generatedFlow.edges);
            } else {
                onGenerate(generatedFlow.nodes, generatedFlow.edges);
            }

            onClose();
            setPrompt('');
            setGeneratedFlow(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >

                {/* Header - Minimalist */}
                <div className="bg-white px-8 py-5 flex items-center justify-between shrink-0 border-b border-slate-100">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="w-5 h-5 text-brand-600" />
                            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Flow Creation Wizard</h2>
                        </div>
                        <p className="text-sm text-slate-500">
                            Build automations via AI, pre-configured blueprints, or from scratch
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Onboarding Tab Bar */}
                <div className="flex border-b border-slate-100 bg-slate-50/50 shrink-0 px-8">
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={clsx(
                            "px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5",
                            activeTab === 'ai'
                                ? "border-brand-600 text-brand-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Architect
                    </button>
                    <button
                        onClick={() => setActiveTab('templates')}
                        className={clsx(
                            "px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5",
                            activeTab === 'templates'
                                ? "border-brand-600 text-brand-600"
                                : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <LayoutTemplate className="w-3.5 h-3.5" />
                        Blueprints Library
                    </button>
                    <button
                        onClick={() => setActiveTab('blank')}
                        className={clsx(
                            "px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ml-auto",
                            activeTab === 'blank'
                                ? "border-red-500 text-red-500 font-extrabold"
                                : "border-transparent text-slate-400 hover:text-slate-600"
                        )}
                    >
                        <X className="w-3.5 h-3.5" />
                        Start Blank
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto custom-scrollbar flex-1 bg-white">
                    {activeTab === 'ai' && (
                        <div className="space-y-6">
                            {loadedTemplateName && (
                                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-between text-emerald-800 text-xs">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                        <span>Loaded template: <strong>{loadedTemplateName}</strong>. You can refine it with AI or import it directly.</span>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setLoadedTemplateName(null);
                                            setGeneratedFlow(null);
                                        }}
                                        className="text-emerald-500 hover:text-emerald-700"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}

                            {/* Mode Selection Tabs - Clean Pills */}
                            {existingNodes.length > 0 && !loadedTemplateName && (
                                <div className="flex gap-4 mb-6 text-sm">
                                    <button
                                        onClick={() => setMode('create')}
                                        className={clsx(
                                            "px-4 py-2 font-medium rounded-full transition-all border",
                                            mode === 'create'
                                                ? "bg-slate-900 text-white border-slate-900"
                                                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                        )}
                                    >
                                        Create New
                                    </button>
                                    <button
                                        onClick={() => setMode('improve')}
                                        className={clsx(
                                            "px-4 py-2 font-medium rounded-full transition-all border flex items-center gap-2",
                                            mode === 'improve'
                                                ? "bg-slate-900 text-white border-slate-900"
                                                : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                        )}
                                    >
                                        <Wand2 className="w-3.5 h-3.5" /> Improve Existing
                                    </button>
                                </div>
                            )}

                            <div className="space-y-6">
                                <div>
                                    <div className="relative">
                                        <textarea
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            placeholder={mode === 'improve' || loadedTemplateName
                                                ? "e.g., Add a WhatsApp message notification, change parameters..."
                                                : "e.g., Every morning at 9am, check RSS feeds and summarize them to Slack..."}
                                            className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-400 transition-all resize-none h-40 leading-relaxed placeholder:text-slate-400 font-sans"
                                        />
                                        <div className="absolute bottom-4 right-4 text-[10px] text-slate-400 font-medium bg-white px-2 py-1 rounded border border-slate-100 uppercase tracking-wide">
                                            Powered by Gemini
                                        </div>
                                    </div>
                                </div>

                                {/* Suggestions - Subtle Pills */}
                                {!generatedFlow && (
                                    <div className="space-y-3">
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Suggestions</p>
                                        <div className="flex flex-wrap gap-2">
                                            {['Cron job -> Scraper -> Email', 'Webhook -> JSON Parser -> DB', 'Analyze List -> Router'].map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => setPrompt(s)}
                                                    className="px-4 py-2 bg-white border border-slate-200 hover:border-slate-400 text-xs font-medium text-slate-600 rounded-lg transition-all"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Error Message */}
                                {error && (
                                    <div className="bg-red-50 border-l-4 border-red-500 p-4 flex gap-3 text-red-700 animate-in slide-in-from-top-1 rounded-r-lg">
                                        <AlertCircle className="w-5 h-5 shrink-0" />
                                        <span className="text-sm font-medium">{error}</span>
                                    </div>
                                )}

                                {/* Result Preview - Clean Card */}
                                {generatedFlow && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                </div>
                                                <h4 className="font-bold text-slate-900 text-sm">Blueprint Loaded/Generated</h4>
                                            </div>
                                            <div className="text-xs font-mono text-slate-400">
                                                {generatedFlow.nodes.length} nodes · {generatedFlow.edges.length} edges
                                            </div>
                                        </div>

                                        <div className="flex gap-2 flex-wrap">
                                            {generatedFlow.nodes.slice(0, 6).map((n: any, i: number) => (
                                                <div key={i} className="flex items-center">
                                                    <span className="text-[10px] px-2 py-1 bg-white border border-slate-200 rounded text-slate-600 font-mono tracking-tight truncate max-w-[120px]">
                                                        {n.type}
                                                    </span>
                                                    {i < generatedFlow.nodes.length - 1 && i < 5 && <ArrowRight className="w-3 h-3 text-slate-300 mx-1" />}
                                                </div>
                                            ))}
                                            {generatedFlow.nodes.length > 6 && <span className="text-xs text-slate-400 self-center font-bold">+{generatedFlow.nodes.length - 6} more</span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'templates' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {Object.values(templates).map((tpl) => (
                                    <div 
                                        key={tpl.id} 
                                        className="p-5 border border-slate-200 hover:border-brand-500 rounded-xl bg-white hover:shadow-md transition-all flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                <h4 className="font-bold text-slate-900 text-sm">{tpl.name}</h4>
                                                <span className="px-2 py-0.5 bg-slate-100 text-[10px] text-slate-500 rounded font-medium shrink-0">
                                                    {tpl.category}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 leading-relaxed mb-4">
                                                {tpl.description}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setGeneratedFlow({ nodes: tpl.nodes, edges: tpl.edges });
                                                setLoadedTemplateName(tpl.name);
                                                setActiveTab('ai');
                                            }}
                                            className="w-full py-2 bg-slate-950 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            <Wand2 className="w-3.5 h-3.5" />
                                            Load & Refine Blueprint
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'blank' && (
                        <div className="py-12 text-center max-w-sm mx-auto space-y-6 animate-in fade-in duration-200">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-500">
                                <X className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 text-base">Start with Blank Canvas</h3>
                                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                                    This will clear the current canvas and close the builder, letting you construct your flow manually node by node.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    onGenerate([], []);
                                    onClose();
                                    setActiveTab('ai');
                                    setPrompt('');
                                    setGeneratedFlow(null);
                                    setLoadedTemplateName(null);
                                }}
                                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/25 transition-all"
                            >
                                Confirm Clear & Start Blank
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer - Simple & Clean */}
                <div className="bg-white px-8 py-6 border-t border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                        {activeTab === 'ai' && (
                            <>
                                <Coins className="w-4 h-4" />
                                <span>10 credits</span>
                            </>
                        )}
                    </div>

                    <div className="flex gap-4">
                        {activeTab === 'ai' && generatedFlow && (
                            <button
                                onClick={() => {
                                    setGeneratedFlow(null);
                                    setPrompt('');
                                    setLoadedTemplateName(null);
                                }}
                                className="px-4 py-2.5 text-sm font-medium text-red-500 hover:text-red-700 transition-colors"
                            >
                                Start Over
                            </button>
                        )}
                        <button onClick={onClose} className="px-6 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
                            Cancel
                        </button>

                        {activeTab === 'ai' && (
                            <>
                                {loading ? (
                                    <button
                                        disabled
                                        className="px-8 py-2.5 bg-brand-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-full shadow-lg transition-all flex items-center gap-2"
                                    >
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Designing...
                                    </button>
                                ) : (
                                    <>
                                        {prompt.trim().length > 0 && (
                                            <button
                                                onClick={handleGenerate}
                                                className="px-8 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-full shadow-lg shadow-brand-600/20 transition-all flex items-center gap-2"
                                            >
                                                <Wand2 className="w-4 h-4" />
                                                {generatedFlow ? 'Refine Blueprint' : 'Generate Blueprint'}
                                            </button>
                                        )}
                                        {generatedFlow && (
                                            <button
                                                onClick={handleImport}
                                                className="px-8 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-full shadow-lg shadow-slate-900/20 transition-all flex items-center gap-2"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                {mode === 'improve' || loadedTemplateName ? 'Apply Changes' : 'Import Flow'}
                                            </button>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
