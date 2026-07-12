import React, { useEffect, useState } from 'react';
import { Plus, FolderOpen, Clock, Trash2, Search, LayoutGrid, Zap, LogOut, Copy, Crown, Coins, LayoutTemplate, ArrowRight, Settings, BookOpen, Megaphone, TrendingUp, Users, Terminal, User, ClipboardList, CheckCircle2 } from 'lucide-react';
import { Logo } from './Logo';
import { dataStore } from '../services/dataStore';
import { Dialog } from './Dialog';
import { templates as staticTemplates, Template } from '../services/templates';
import clsx from 'clsx';
import { SavedFlow, UserCredits, PageView, UserProfile } from '../types';

interface DashboardProps {
    user: UserProfile;
    credits: number;
    onOpenFlow: (id: string) => void;
    onCreateFlow: () => void;
    onLogout: () => void;
    onNavigate: (page: PageView) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, credits: creditBalance, onOpenFlow, onCreateFlow, onLogout, onNavigate }) => {
    const [activeTab, setActiveTab] = useState<'workflows' | 'templates'>('workflows');
    const [flows, setFlows] = useState<SavedFlow[]>([]);
    const [activeCredits, setActiveCredits] = useState<UserCredits | null>(null);
    const [templates, setTemplates] = useState<Record<string, Template>>(staticTemplates);
    const [stats, setStats] = useState<{ totalRuns: number; successRate: number; creditsUsed: number; topFlows: { id: string; name: string; count: number }[] }>({ totalRuns: 0, successRate: 0, creditsUsed: 0, topFlows: [] });
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [dialog, setDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void }>({
        isOpen: false, title: '', message: '', onConfirm: () => { }
    });
    const [limitDialog, setLimitDialog] = useState<{ isOpen: boolean, message: string }>({ isOpen: false, message: '' });

    useEffect(() => {
        // Force refresh on mount to always show latest data
        loadData(true);
    }, []);

    const loadData = async (forceRefresh = false) => {
        setIsLoading(true);
        try {
            // Force refresh on first load, use cache for subsequent loads
            const { flowsList, credits, templates: dbTemplates, stats: userStats } = await dataStore.loadDashboardData(forceRefresh);
            setFlows(flowsList as SavedFlow[]);
            setActiveCredits(credits);
            setTemplates(dbTemplates);
            setStats(userStats);
        } catch (e) {
            console.error("Failed to load dashboard data", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        setDialog({
            isOpen: true,
            title: 'Delete Workflow',
            message: `Are you sure you want to delete "${name}" ? This action cannot be undone.`,
            onConfirm: async () => {
                await dataStore.deleteFlow(id);
                loadData(true); // Force refresh after delete
            }
        });
    };

    const handleDuplicate = async (e: React.MouseEvent, flow: SavedFlow) => {
        e.stopPropagation();
        const limit = activeCredits?.tier === 'pro' ? 30 : 10;
        if (activeCredits && flows.length >= limit) {
            setLimitDialog({ isOpen: true, message: `Your ${activeCredits.tier} plan allows up to ${limit} workflows.Please upgrade for more.` });
            return;
        }
        try {
            const newFlow = {
                ...flow,
                id: crypto.randomUUID(),
                name: `${flow.name}(Copy)`,
                updated_at: Date.now()
            };
            await dataStore.saveFlow(newFlow);
            loadData(true); // Force refresh after duplicate
        } catch (e) {
            console.error("Duplicate failed", e);
        }
    };

    const handleCreateFromTemplate = async (templateKey: string) => {
        const limit = activeCredits?.tier === 'pro' ? 30 : 10;
        if (activeCredits && flows.length >= limit) {
            setLimitDialog({ isOpen: true, message: `Your ${activeCredits.tier} plan allows up to ${limit} workflows.Please upgrade for more.` });
            return;
        }
        const t = templates[templateKey];
        if (!t) return;

        const newFlow: SavedFlow = {
            id: crypto.randomUUID(),
            name: t.name,
            nodes: t.nodes,
            edges: t.edges,
            updated_at: Date.now()
        };

        try {
            await dataStore.saveFlow(newFlow);
            onOpenFlow(newFlow.id);
        } catch (e: any) {
            setLimitDialog({ isOpen: true, message: e.message });
        }
    };

    const handleCreate = () => {
        const limit = activeCredits?.tier === 'pro' ? 30 : 10;
        if (activeCredits && flows.length >= limit) {
            setLimitDialog({ isOpen: true, message: `Your ${activeCredits.tier} plan allows up to ${limit} workflows.Please upgrade for more.` });
            return;
        }
        onCreateFlow();
    };

    const filteredFlows = flows.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans overflow-y-auto custom-scrollbar">
            <Dialog
                isOpen={dialog.isOpen}
                onClose={() => setDialog(prev => ({ ...prev, isOpen: false }))}
                type="confirm"
                title={dialog.title}
                message={dialog.message}
                variant="danger"
                confirmText="Delete Flow"
                onConfirm={dialog.onConfirm}
            />

            {/* Limit Reached Dialog */}
            <Dialog
                isOpen={limitDialog.isOpen}
                onClose={() => setLimitDialog({ isOpen: false, message: '' })}
                type="alert"
                title="Plan Limit Reached"
                message={limitDialog.message}
                variant="warning"
                confirmText="Got It"
                onConfirm={() => setLimitDialog({ isOpen: false, message: '' })}
            />

            {/* Header */}
            <div className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('dashboard')}>
                        <Logo className="w-8 h-8" />
                        <span className="text-lg font-bold tracking-tight text-slate-900">Blupe</span>
                        {activeCredits?.tier === 'pro' && (
                            <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                                <Crown className="w-3 h-3 text-brand-400" /> Pro
                            </span>
                        )}
                        {activeCredits && (
                            <div className="ml-4 flex items-center gap-2 text-xs font-medium bg-slate-100 px-3 py-1.5 rounded-full text-slate-600 border border-slate-200">
                                <Coins className="w-3.5 h-3.5 text-yellow-500" />
                                <span className="font-mono font-bold text-slate-800">{activeCredits.balance.toLocaleString()}</span> Credits
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => onNavigate('docs')}
                            className="text-slate-500 hover:text-slate-900 transition-colors p-2 rounded-full hover:bg-slate-50 flex items-center gap-2 text-sm font-medium"
                        >
                            <BookOpen className="w-4 h-4" /> Docs
                        </button>
                        <button
                            onClick={() => onNavigate('settings')}
                            className="text-slate-500 hover:text-slate-900 transition-colors p-2 rounded-full hover:bg-slate-50"
                            title="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <div className="h-6 w-px bg-slate-200" />
                        <button onClick={onLogout} className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors flex items-center gap-2">
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-8 pb-20">

                {/* Stats Widgets */}
                {/* Stats Widgets moved to Settings > Billing as per V2 cleanup */}

                {/* Tabs */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        <button
                            onClick={() => setActiveTab('workflows')}
                            className={clsx(
                                "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                                activeTab === 'workflows' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                            )}
                        >
                            <LayoutGrid className="w-4 h-4" /> My Workflows
                        </button>
                        <button
                            onClick={() => setActiveTab('templates')}
                            className={clsx(
                                "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                                activeTab === 'templates' ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                            )}
                        >
                            <LayoutTemplate className="w-4 h-4" /> Template Gallery
                        </button>
                    </div>

                    {activeTab === 'workflows' && (
                        <div className="flex gap-4">
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search flows..."
                                    className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:border-brand-500 focus:outline-none transition-colors shadow-sm"
                                />
                            </div>
                            <button
                                onClick={handleCreate}
                                className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all shadow-md shadow-brand-500/20"
                            >
                                <Plus className="w-4 h-4" /> New Flow
                            </button>
                        </div>
                    )}
                </div>

                {activeTab === 'workflows' ? (
                    isLoading ? (
                        // Skeleton loading state
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 animate-pulse">
                                    <div className="flex items-start justify-between mb-6">
                                        <div className="p-3 bg-slate-100 rounded-xl w-12 h-12"></div>
                                    </div>
                                    <div className="h-5 bg-slate-100 rounded w-3/4 mb-4"></div>
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="h-4 bg-slate-100 rounded w-20"></div>
                                        <div className="h-4 bg-slate-100 rounded w-24"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredFlows.length === 0 ? (
                        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                                <FolderOpen className="w-8 h-8 text-slate-300" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 mb-2">No workflows yet</h3>
                            <p className="text-slate-500 text-sm mb-8 max-w-sm mx-auto">Create your first autonomous agent or start from a template.</p>
                            <button
                                onClick={handleCreate}
                                className="bg-white border border-slate-300 hover:border-brand-500 hover:text-brand-600 text-slate-700 font-bold py-2.5 px-6 rounded-xl transition-all shadow-sm"
                            >
                                <Plus className="w-4 h-4 mr-2 inline-block" />
                                Create Empty Flow
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredFlows.map(flow => (
                                <div
                                    key={flow.id}
                                    onClick={() => onOpenFlow(flow.id)}
                                    className="group bg-white border border-slate-200 rounded-2xl p-6 hover:border-brand-500/30 hover:shadow-xl transition-all cursor-pointer relative overflow-hidden"
                                >
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                                    <div className="flex items-start justify-between mb-6">
                                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 group-hover:bg-brand-50 group-hover:border-brand-100 transition-colors">
                                            <Zap className="w-6 h-6 text-slate-400 group-hover:text-brand-600" />
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={(e) => handleDuplicate(e, flow)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"><Copy className="w-4 h-4" /></button>
                                            <button onClick={(e) => handleDelete(e, flow.id, flow.name)} className="p-2 hover:bg-red-50 rounded-lg text-red-500"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>

                                    <h3 className="font-bold text-slate-900 text-lg mb-2 truncate">{flow.name}</h3>

                                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-6">
                                        <span className="flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> {flow.nodes.length} nodes</span>
                                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {new Date(flow.updated_at).toLocaleDateString()}</span>
                                    </div>

                                    <div className="flex items-center text-xs font-bold text-brand-600 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                                        Open Workflow <ArrowRight className="w-3 h-3 ml-1" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Object.entries(templates).map(([key, t]) => {
                            const getCategoryColor = (cat: string) => {
                                switch (cat) {
                                    case 'Marketing': return 'bg-purple-50 text-purple-700 border-purple-200';
                                    case 'Sales': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                    case 'HR': return 'bg-blue-50 text-blue-700 border-blue-200';
                                    case 'Dev': return 'bg-orange-50 text-orange-700 border-orange-200';
                                    case 'Personal': return 'bg-pink-50 text-pink-700 border-pink-200';
                                    default: return 'bg-slate-50 text-slate-700 border-slate-200';
                                }
                            };

                            const getCategoryIcon = (cat: string) => {
                                switch (cat) {
                                    case 'Marketing': return <Megaphone className="w-3.5 h-3.5" />;
                                    case 'Sales': return <TrendingUp className="w-3.5 h-3.5" />;
                                    case 'HR': return <Users className="w-3.5 h-3.5" />;
                                    case 'Dev': return <Terminal className="w-3.5 h-3.5" />;
                                    case 'Personal': return <User className="w-3.5 h-3.5" />;
                                    default: return <ClipboardList className="w-3.5 h-3.5" />;
                                }
                            };

                            return (
                                <div
                                    key={key}
                                    className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-brand-400 hover:shadow-xl transition-all flex flex-col group relative overflow-hidden"
                                >
                                    {/* Gradient accent on hover */}
                                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />

                                    {/* Header with category badge */}
                                    <div className="flex items-start justify-between mb-4">
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getCategoryColor(t.category)} flex items-center gap-1.5`}>
                                            {getCategoryIcon(t.category)}
                                            {t.category}
                                        </span>
                                        <div className="flex items-center gap-3 text-xs text-slate-500">
                                            <span className="flex items-center gap-1 font-mono">
                                                <LayoutGrid className="w-3.5 h-3.5" />
                                                {t.nodes.length} Nodes
                                            </span>
                                            <span className="flex items-center gap-1 font-mono">
                                                <Zap className="w-3.5 h-3.5" />
                                                {t.edges.length} Connections
                                            </span>
                                        </div>
                                    </div>

                                    {/* Title and description */}
                                    <div className="mb-4 flex-1">
                                        <h3 className="font-bold text-slate-900 text-lg mb-2 group-hover:text-brand-600 transition-colors">{t.name}</h3>
                                        <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">{t.description}</p>
                                    </div>

                                    {/* Footer with CTA */}
                                    <div className="pt-4 border-t border-slate-100">
                                        <button
                                            onClick={() => handleCreateFromTemplate(key)}
                                            className="w-full text-sm font-bold text-brand-600 hover:text-brand-700 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg hover:bg-brand-50 transition-all group/btn"
                                        >
                                            Use Template
                                            <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
