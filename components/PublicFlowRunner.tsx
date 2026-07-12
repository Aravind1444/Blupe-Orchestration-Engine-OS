
import React, { useEffect, useState } from 'react';
import ReactFlow, { ReactFlowProvider, Background, Node, Edge } from 'reactflow';
import { Play, Loader2, CheckCircle2, AlertCircle, Zap, Coins } from 'lucide-react';
import { Logo } from './Logo';
import { SavedFlow, NodeData, NodeType, NodeStatus, ExecutionLog } from '../types';
import { runWorkflow } from '../services/executor';
import { nodeTypes } from './CustomNodes';
import { getEffectiveNodeType, normalizeFlowNodes } from '../services/nodeContract';

interface PublicFlowRunnerProps {
    flowId: string;
}

const PublicFlowRunner: React.FC<PublicFlowRunnerProps> = ({ flowId }) => {
    const [flow, setFlow] = useState<SavedFlow | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Execution State
    const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<ExecutionLog[]>([]);
    const [finished, setFinished] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [formConfig, setFormConfig] = useState<any>(null); // Config from FORM_TRIGGER node

    useEffect(() => {
        const load = async () => {
            try {
                // Use public API endpoint to bypass Supabase RLS for anonymous access
                const response = await fetch(`${window.location.origin}/api/public-flow?id=${flowId}`);

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to load flow');
                }

                const found = await response.json();

                if (found) {
                    setFlow(found);
                    setNodes(normalizeFlowNodes(found.nodes || []));
                    setEdges(found.edges);

                    // Check for Form Trigger
                    const trigger = (found.nodes || []).find((n: any) => getEffectiveNodeType(n) === NodeType.FORM_TRIGGER);
                    if (trigger) {
                        setFormConfig(trigger.data);
                        const initial: Record<string, any> = {};
                        trigger.data.formFields?.forEach((f: any) => initial[f.variableName] = '');
                        setFormData(initial);
                    }
                } else {
                    setError("Flow not found or access denied.");
                }
            } catch (e: any) {
                console.error(e);
                setError(e.message || "Failed to load flow.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [flowId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsRunning(true);
        setFinished(false);
        setLogs([]);

        // Reset nodes visual state
        setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: NodeStatus.IDLE, output: undefined, error: undefined } })));

        const updateStatus = (nodeId: string, status: NodeStatus, output?: any, error?: string) => {
            setNodes((nds) => nds.map((n) => {
                if (n.id === nodeId) {
                    return { ...n, data: { ...n.data, status, output, error } };
                }
                return n;
            }));
        };

        const addLog = (log: ExecutionLog) => setLogs(prev => [...prev, log]);

        // PUBLIC RUNNER SECRETS INJECTION
        // This ensures emails work for anonymous users by injecting the Enterprise Key if backend fails (failsafe)
        // Note: The backend route ignores this client-side key anyway, using the server env var.
        const secrets: Record<string, string> = {};

        // Merge with local if available (for creator testing)
        const savedSecrets = localStorage.getItem('flow-secrets-v1');
        if (savedSecrets) {
            JSON.parse(savedSecrets).forEach((s: any) => { secrets[s.key] = s.value; });
        }

        try {
            await runWorkflow(nodes, edges, updateStatus, addLog, secrets, formData, undefined, { flowId, flowOwnerId: flow?.user_id });
            setFinished(true);
        } catch (e) {
            console.error(e);
        } finally {
            setIsRunning(false);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-600" /></div>;
    if (error) return <div className="flex h-screen items-center justify-center text-red-500">{error}</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Header */}
            <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-center shadow-sm z-10">
                <div className="flex items-center gap-2">
                    <Logo className="w-8 h-8" />
                    <span className="font-bold text-slate-900">Blupe Runner</span>
                </div>

                {/* Simulated Guest Credits */}
                <div className="absolute right-6 flex items-center gap-2 text-xs font-medium bg-slate-100 px-3 py-1.5 rounded-full text-slate-600 border border-slate-200">
                    <Coins className="w-3.5 h-3.5 text-yellow-500" />
                    <span className="font-mono font-bold text-slate-800">20</span> Credits
                </div>
            </div>

            <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-64px)] overflow-hidden">
                {/* Left Panel: Form */}
                <div className="w-full md:w-1/3 lg:w-1/4 bg-white border-r border-slate-200 p-8 overflow-y-auto shadow-xl z-20">
                    {formConfig ? (
                        <div className="max-w-md mx-auto">
                            <h1 className="text-2xl font-bold text-slate-900 mb-2">{formConfig.formTitle || 'Start Workflow'}</h1>
                            <p className="text-slate-500 text-sm mb-8">{formConfig.formDescription}</p>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                {(formConfig.formFields || []).map((field: any) => (
                                    <div key={field.id} className="space-y-1.5">
                                        <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider">
                                            {field.label} {field.required && <span className="text-red-500">*</span>}
                                        </label>
                                        {field.type === 'textarea' ? (
                                            <textarea
                                                required={field.required}
                                                value={formData[field.variableName]}
                                                onChange={e => setFormData({ ...formData, [field.variableName]: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                                                rows={4}
                                            />
                                        ) : (
                                            <input
                                                type={field.type}
                                                required={field.required}
                                                value={formData[field.variableName]}
                                                onChange={e => setFormData({ ...formData, [field.variableName]: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                                            />
                                        )}
                                    </div>
                                ))}
                                <button
                                    type="submit"
                                    disabled={isRunning}
                                    className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold shadow-lg shadow-brand-500/30 transition-all flex items-center justify-center gap-2"
                                >
                                    {isRunning ? <Loader2 className="animate-spin w-4 h-4" /> : <Play className="w-4 h-4" />}
                                    {isRunning ? 'Running...' : 'Run Workflow'}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="text-center py-10">
                            <p className="text-slate-500">This workflow does not have a public form trigger.</p>
                            <button onClick={handleSubmit} className="mt-4 px-6 py-2 bg-brand-600 text-white rounded-full text-sm font-bold">Run Manually</button>
                        </div>
                    )}

                    {finished && (
                        <div className="mt-8 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                            <div>
                                <h3 className="font-bold text-emerald-900 text-sm">Execution Complete</h3>
                                <p className="text-emerald-700 text-xs mt-1">The workflow finished successfully.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Panel: Visualization */}
                <div className="flex-1 bg-slate-50 relative">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        elementsSelectable={false}
                        nodeTypes={nodeTypes}
                        fitView
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background color="#cbd5e1" gap={20} />
                    </ReactFlow>

                    {/* Running Overlay */}
                    {isRunning && (
                        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-brand-100 flex items-center gap-2 text-brand-600 text-xs font-bold animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Live Execution
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PublicFlowRunner;
