import React, { useEffect, useState } from 'react';
import ReactFlow, { Background, Node, Edge, Controls, MiniMap } from 'reactflow';
import { Loader2, Copy, LogIn, ArrowLeft, Share2 } from 'lucide-react';
import { Logo } from './Logo';
import { SavedFlow, NodeData, NodeStatus, NodeType } from '../types';
import { nodeTypes } from './CustomNodes';
import { storage, auth } from '../services/supabase';
import { AuthModal } from './AuthModal';
import { normalizeFlowNodes } from '../services/nodeContract';

interface PublishedFlowViewerProps {
    flowId: string;
    onNavigate: (view: string, flowId?: string) => void;
}

const PublishedFlowViewer: React.FC<PublishedFlowViewerProps> = ({ flowId, onNavigate }) => {
    const [flow, setFlow] = useState<SavedFlow | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copying, setCopying] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [user, setUser] = useState<any>(null);

    const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);

    useEffect(() => {
        const init = async () => {
            // Check auth
            const u = await auth.getUser();
            setUser(u);

            // Load flow
            try {
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
                } else {
                    setError("Flow not found.");
                }
            } catch (e: any) {
                console.error(e);
                setError(e.message || "Failed to load flow.");
            } finally {
                setLoading(false);
            }
        };
        init();

        // Auth state listener
        const { data: listener } = auth.onAuthStateChange((u) => {
            setUser(u);
        });

        return () => {
            listener.subscription.unsubscribe();
        };
    }, [flowId]);

    const handleCopyToWorkflows = async () => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }

        setCopying(true);
        try {
            // Create a copy of the flow for the current user
            const newId = crypto.randomUUID();
            const newFlow: SavedFlow = {
                id: newId,
                name: `${flow?.name || 'Untitled'} (Copy)`,
                nodes: flow?.nodes || [],
                edges: flow?.edges || [],
                updated_at: Date.now()
            };

            await storage.saveFlow(newFlow);

            // Navigate to the new flow in editor
            onNavigate('editor', newId);
        } catch (e: any) {
            console.error('Failed to copy flow:', e);
            alert(`Failed to copy: ${e.message}`);
        } finally {
            setCopying(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <Loader2 className="animate-spin text-brand-600 w-8 h-8" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-slate-50 gap-4">
                <div className="text-red-500 text-lg">{error}</div>
                <button
                    onClick={() => onNavigate('landing')}
                    className="text-brand-600 hover:underline flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" /> Go Home
                </button>
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-slate-50 flex flex-col">
            {showAuthModal && (
                <AuthModal
                    onLogin={() => setShowAuthModal(false)}
                    onSkip={() => setShowAuthModal(false)}
                    onBack={() => setShowAuthModal(false)}
                />
            )}

            {/* Header */}
            <div className="h-16 bg-white border-b border-slate-200 flex items-center px-6 justify-between shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => onNavigate('landing')}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors"
                    >
                        <Logo className="w-8 h-8" />
                        <span className="font-bold text-slate-900">Blupe</span>
                    </button>
                    <div className="h-6 w-px bg-slate-200" />
                    <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-700">{flow?.name || 'Published Flow'}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!user ? (
                        <button
                            onClick={() => setShowAuthModal(true)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                            <LogIn className="w-4 h-4" />
                            Sign In
                        </button>
                    ) : null}
                    <button
                        onClick={handleCopyToWorkflows}
                        disabled={copying}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                    >
                        {copying ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Copy className="w-4 h-4" />
                        )}
                        Copy to My Workflows
                    </button>
                </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 relative">
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
                    <Controls position="bottom-right" />
                    <MiniMap
                        position="bottom-left"
                        nodeColor="#6366f1"
                        maskColor="rgba(0,0,0,0.1)"
                    />
                </ReactFlow>

                {/* Info Card */}
                <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-xl p-4 shadow-lg border border-slate-200 max-w-xs">
                    <h3 className="font-bold text-slate-900 mb-1">{flow?.name}</h3>
                    <p className="text-xs text-slate-500 mb-3">
                        This is a read-only view of a published workflow. Copy it to your account to edit and run.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{nodes.length} nodes</span>
                        <span>•</span>
                        <span>{edges.length} connections</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublishedFlowViewer;
