
import React, { useEffect, useState } from 'react';
import { ArrowLeft, User, CreditCard, Lock, Activity, Zap, CheckCircle2, Clock, Terminal, Coins, Edit2, Save, X, Download, ChevronLeft, ChevronRight, Link, Unlink, ExternalLink, Grid, LayoutGrid, TrendingUp, BarChart } from 'lucide-react';
import { getConnectedAccounts, initiateOAuth, disconnectProvider, OAuthConnection } from '../services/oauth';
import { UserCredits, RunRecord, Secret, UserProfile } from '../types';
import { storage } from '../services/supabase';
import { dataStore } from '../services/dataStore';
import { BillingService } from '../services/billing';
import { SecretsModal } from './SecretsModal';
import { LogDetailsModal } from './RunHistory';
import clsx from 'clsx';

interface SettingsPageProps {
    onBack: () => void;
}

type Tab = 'profile' | 'billing' | 'integrations' | 'secrets' | 'logs';

const OAUTH_PROVIDERS: Array<{
    id: 'google' | 'slack' | 'hubspot' | 'stripe';
    name: string;
    description: string;
    icon: React.ReactNode;
}> = [
    {
        id: 'google',
        name: 'Google',
        description: 'Sheets, Gmail, Drive',
        icon: (
            <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
        ),
    },
    {
        id: 'slack',
        name: 'Slack',
        description: 'Send messages to channels',
        icon: (
            <svg className="w-5 h-5 text-purple-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
            </svg>
        ),
    },
    {
        id: 'hubspot',
        name: 'HubSpot',
        description: 'Contacts, companies, deals',
        icon: (
            <svg className="w-5 h-5 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.164 7.93V5.084a2.198 2.198 0 0 0 1.267-1.984v-.066A2.2 2.2 0 0 0 17.231.834h-.066a2.2 2.2 0 0 0-2.2 2.2v.066c0 .891.532 1.659 1.297 2.006V7.93a5.927 5.927 0 0 0-2.529 1.118l-6.679-5.196a2.773 2.773 0 1 0-.825 1.058l6.537 5.086a5.917 5.917 0 0 0-.585 2.587c0 .947.224 1.842.618 2.636l-1.94 1.94a2.397 2.397 0 0 0-.699-.106 2.414 2.414 0 1 0 2.414 2.414 2.4 2.4 0 0 0-.106-.7l1.894-1.893a5.957 5.957 0 1 0 3.752-9.943v-.001zm0 9.382a3.423 3.423 0 1 1 0-6.846 3.423 3.423 0 0 1 0 6.846z" />
            </svg>
        ),
    },
    {
        id: 'stripe',
        name: 'Stripe',
        description: 'Payments and customers',
        icon: (
            <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z" />
            </svg>
        ),
    },
];

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const [user, setUser] = useState<UserProfile | null>(null);
    const [credits, setCredits] = useState<UserCredits | null>(null);
    const [history, setHistory] = useState<RunRecord[]>([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyPage, setHistoryPage] = useState(0);
    const pageSize = 20;
    const [secrets, setSecrets] = useState<Secret[]>([]);
    const [showSecretsModal, setShowSecretsModal] = useState(false);
    const [selectedLog, setSelectedLog] = useState<RunRecord | null>(null);
    const [oauthConnections, setOauthConnections] = useState<OAuthConnection[]>([]);
    const [oauthLoading, setOauthLoading] = useState<string | null>(null);
    // Which providers have server-side credentials configured (null = still loading)
    const [oauthStatus, setOauthStatus] = useState<Record<string, boolean> | null>(null);
    const [stats, setStats] = useState<{ totalRuns: number; successRate: number; creditsUsed: number; topFlows: { id: string; name: string; count: number }[] }>({ totalRuns: 0, successRate: 0, creditsUsed: 0, topFlows: [] });

    // Profile Edit State
    const [editingProfile, setEditingProfile] = useState(false);
    const [newHandle, setNewHandle] = useState('');
    const [newAvatarUrl, setNewAvatarUrl] = useState('');

    useEffect(() => {
        loadData();
        loadOAuthConnections();
    }, []);

    const loadOAuthConnections = async () => {
        try {
            const connections = await getConnectedAccounts();
            setOauthConnections(connections);
        } catch (e) {
            console.error('[Settings] Failed to load OAuth connections:', e);
        }
        try {
            const res = await fetch('/api/oauth-status');
            if (res.ok) {
                setOauthStatus(await res.json());
            } else {
                setOauthStatus({});
            }
        } catch (e) {
            console.error('[Settings] Failed to load OAuth provider status:', e);
            setOauthStatus({});
        }
    };

    const handleConnect = async (provider: 'google' | 'slack' | 'hubspot' | 'stripe') => {
        setOauthLoading(provider);
        try {
            await initiateOAuth(provider); // Redirects away on success
        } catch (e) {
            console.error(`[Settings] Failed to start ${provider} OAuth:`, e);
        } finally {
            setOauthLoading(null);
        }
    };

    const handleDisconnect = async (provider: 'google' | 'slack' | 'hubspot' | 'stripe') => {
        setOauthLoading(provider);
        try {
            await disconnectProvider(provider);
            await loadOAuthConnections();
        } finally {
            setOauthLoading(null);
        }
    };

    // Reload history when page changes
    useEffect(() => {
        if (credits) {
            loadHistory();
        }
    }, [historyPage]);

    const loadData = async () => {
        try {
            // Use centralized dataStore - data is cached across navigation
            const { user: u, credits: c, history: h, historyTotal: total, secrets: s, stats: st } = await dataStore.loadSettingsData();

            setUser(u);
            setCredits(c);
            setHistory(h);
            setHistoryTotal(total);
            setStats(st || { totalRuns: 0, successRate: 0, creditsUsed: 0, topFlows: [] });
            setNewHandle(c.handle || u?.email?.split('@')[0] || '');
            setNewAvatarUrl(c.avatar_url || u?.avatar_url || '');

            const local = JSON.parse(localStorage.getItem('flow-secrets-v1') || '[]');
            if (c.tier === 'pro' && s.length > 0) {
                setSecrets(s);
            } else {
                setSecrets(local);
            }
        } catch (error) {
            console.error("Error loading settings:", error);
        }
    };

    const loadHistory = async () => {
        if (!credits) return;
        const result = await dataStore.getGlobalRunHistory({
            tier: credits.tier,
            page: historyPage,
            pageSize
        });
        setHistory(result.records);
        setHistoryTotal(result.total);
    };

    const handleSecretsSave = (newSecrets: Secret[]) => {
        setSecrets(newSecrets);
        localStorage.setItem('flow-secrets-v1', JSON.stringify(newSecrets));
        loadData();
    };

    const [saveError, setSaveError] = useState<string | null>(null);

    const handleSaveProfile = async () => {
        if (!newHandle.trim()) return;
        try {
            await storage.updateProfile({
                handle: newHandle,
                avatar_url: newAvatarUrl
            });
            setEditingProfile(false);
            setSaveError(null);
            loadData();
        } catch (e: any) {
            setSaveError(e.message || "Failed to update profile.");
        }
    };

    const SidebarLink = ({ id, label, icon: Icon }: { id: Tab, label: string, icon: any }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={clsx(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                activeTab === id
                    ? "bg-brand-50 text-brand-600 shadow-sm border border-brand-100"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
            )}
        >
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );

    return (
        <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans flex flex-col md:flex-row overflow-hidden">
            <SecretsModal isOpen={showSecretsModal} onClose={() => setShowSecretsModal(false)} secrets={secrets} onSave={handleSecretsSave} />
            <LogDetailsModal isOpen={!!selectedLog} run={selectedLog} onClose={() => setSelectedLog(null)} />

            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-slate-200 flex flex-col h-full shadow-lg z-10 flex-shrink-0">
                <div className="p-6 border-b border-slate-200 bg-slate-50/50">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-xs font-bold uppercase tracking-wider mb-4">
                        <ArrowLeft className="w-3 h-3" /> Back to Dashboard
                    </button>
                    <h2 className="text-xl font-bold text-slate-900">Settings</h2>
                </div>
                <div className="p-4 space-y-1">
                    <SidebarLink id="profile" label="Profile" icon={User} />
                    <SidebarLink id="billing" label="Billing & Usage" icon={CreditCard} />
                    <SidebarLink id="integrations" label="Integrations" icon={Link} />
                    <SidebarLink id="secrets" label="Secrets Vault" icon={Lock} />
                    <SidebarLink id="logs" label="Global Activity" icon={Activity} />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar">
                <div className="max-w-4xl mx-auto">
                    {activeTab === 'profile' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <h1 className="text-3xl font-bold text-slate-900">Profile</h1>
                            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-6">
                                        <div className="relative">
                                            {credits?.avatar_url || (!editingProfile && user?.avatar_url) ? (
                                                <img src={editingProfile ? newAvatarUrl : (credits?.avatar_url || user?.avatar_url)} alt="Profile" className="w-20 h-20 rounded-full border-4 border-slate-50 shadow-md object-cover" onError={(e) => (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${user?.email}`} />
                                            ) : (
                                                <div className="w-20 h-20 bg-brand-100 rounded-full flex items-center justify-center text-brand-500 border-4 border-slate-50 shadow-md">
                                                    <User className="w-10 h-10" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-bold text-slate-900">{credits?.full_name || user?.full_name || 'Blupe User'}</h3>
                                            <p className="text-slate-500">{user?.email}</p>
                                        </div>
                                    </div>
                                    {!editingProfile ? (
                                        <button onClick={() => setEditingProfile(true)} className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-4 py-2 rounded-lg transition-colors">
                                            <Edit2 className="w-4 h-4" /> Edit Profile
                                        </button>
                                    ) : (
                                        <div className="flex gap-3">
                                            <button onClick={() => setEditingProfile(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 hover:bg-slate-50 rounded-lg transition-colors">Cancel</button>
                                            <button onClick={handleSaveProfile} className="flex items-center gap-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg transition-colors shadow-sm">
                                                <Save className="w-4 h-4" /> Save
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-3">User Handle</div>
                                        {editingProfile ? (
                                            <div className="space-y-1">
                                                <input
                                                    value={newHandle}
                                                    onChange={(e) => setNewHandle(e.target.value)}
                                                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-brand-500 outline-none"
                                                    placeholder="@username"
                                                />
                                            </div>
                                        ) : (
                                            <div className="text-sm font-mono text-slate-700 break-all bg-white px-3 py-2 rounded-lg border border-slate-200">@{credits?.handle || user?.email?.split('@')[0] || 'user'}</div>
                                        )}
                                    </div>

                                    <div className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Current Plan</div>
                                        <div className="flex items-center justify-between">
                                            <div className="text-lg font-bold text-slate-900 capitalize flex items-center gap-2">
                                                {credits?.tier === 'pro' && <Zap className="w-4 h-4 text-brand-500 fill-current" />}
                                                {credits?.tier || 'Free'}
                                            </div>
                                            {credits?.tier !== 'pro' && (
                                                <button
                                                    onClick={() => {
                                                        if (user?.email) {
                                                            BillingService.initiateCheckout('pro', user.email, () => {
                                                                loadData();
                                                                window.location.reload();
                                                            });
                                                        }
                                                    }}
                                                    className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-full font-bold hover:bg-slate-800 transition-colors"
                                                >
                                                    Upgrade
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'billing' && (
                        <div className="space-y-8 animate-in fade-in duration-300">
                            <div>
                                <h1 className="text-2xl font-semibold text-slate-900 mb-1">Billing & Usage</h1>
                                <p className="text-sm text-slate-500">Manage your subscription and monitor credit usage.</p>
                            </div>

                            {/* Current Plan Banner */}
                            <div className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-5 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={clsx(
                                        "w-10 h-10 rounded-lg flex items-center justify-center",
                                        credits?.tier === 'pro' ? "bg-brand-100" : "bg-slate-200"
                                    )}>
                                        <Zap className={clsx("w-5 h-5", credits?.tier === 'pro' ? "text-brand-600" : "text-slate-500")} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-slate-500">Current Plan</div>
                                        <div className="text-lg font-bold text-slate-900 capitalize">{credits?.tier || 'Starter'}</div>
                                    </div>
                                </div>
                                {credits?.tier !== 'pro' && (
                                    <button
                                        onClick={() => {
                                            if (user?.email) {
                                                BillingService.initiateCheckout('pro', user.email, () => {
                                                    loadData();
                                                    window.location.reload();
                                                });
                                            }
                                        }}
                                        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                                    >
                                        Upgrade to Pro
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                                {/* Credit Balance Card */}
                                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-medium text-slate-500">Credits Available</h3>
                                        <Coins className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div className="text-3xl font-bold text-slate-900 mb-3">{credits?.balance.toLocaleString()}</div>
                                    <div className="space-y-2">
                                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className="bg-brand-500 h-1.5 rounded-full transition-all duration-700 ease-out"
                                                style={{ width: `${Math.min(100, ((credits?.balance || 0) / (credits?.tier === 'pro' ? 5000 : 500)) * 100)}%` }}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-400">
                                            {credits?.balance.toLocaleString()} of {credits?.tier === 'pro' ? '5,000' : '500'} monthly credits
                                        </p>
                                    </div>
                                </div>

                                {/* Active Flows Card */}
                                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-medium text-slate-500">Active Flows</h3>
                                        <Activity className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div className="text-3xl font-bold text-slate-900 mb-3">{credits?.flow_limit || 10}</div>
                                    <p className="text-xs text-slate-400">Maximum workflows allowed on your plan</p>
                                </div>

                                {/* Cloud Secrets Card */}
                                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-medium text-slate-500">Cloud Secrets</h3>
                                        <Lock className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div className={clsx(
                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium",
                                        credits?.tier === 'pro'
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                            : "bg-slate-100 text-slate-500 border border-slate-200"
                                    )}>
                                        {credits?.tier === 'pro' ? (
                                            <><CheckCircle2 className="w-3.5 h-3.5" /> Enabled</>
                                        ) : (
                                            <><X className="w-3.5 h-3.5" /> Pro Only</>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-3">Securely sync API keys to cloud</p>
                                </div>
                            </div>

                            {/* Plan Comparison (for non-pro users) */}
                            {credits?.tier !== 'pro' && (
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Upgrade to Pro for more</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <CheckCircle2 className="w-4 h-4 text-brand-500" />
                                            <span>5,000 credits/mo</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <CheckCircle2 className="w-4 h-4 text-brand-500" />
                                            <span>50 Active Flows</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <CheckCircle2 className="w-4 h-4 text-brand-500" />
                                            <span>Cloud Secrets</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <CheckCircle2 className="w-4 h-4 text-brand-500" />
                                            <span>Published Flows</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'integrations' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div>
                                <h1 className="text-2xl font-semibold text-slate-900 mb-1">OAuth Integrations</h1>
                                <p className="text-sm text-slate-500">Connect accounts for Google Sheets, Slack, HubSpot, Stripe, and Microsoft 365 workflows.</p>
                            </div>

                            {oauthStatus === null ? (
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-12 text-center text-sm text-slate-500">
                                    Checking available integrations…
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { id: 'google' as const, name: 'Google', description: 'Sheets, Gmail, Drive' },
                                        { id: 'microsoft' as const, name: 'Microsoft 365', description: 'Excel via Microsoft Graph' },
                                        { id: 'slack' as const, name: 'Slack', description: 'Send messages to channels' },
                                        { id: 'hubspot' as const, name: 'HubSpot', description: 'Contacts, companies, deals' },
                                        { id: 'stripe' as const, name: 'Stripe', description: 'Payments and customers' },
                                    ].map((provider) => {
                                        const configured = oauthStatus ? (!!oauthStatus[provider.id] || provider.id === 'microsoft') : false;
                                        const connection = oauthConnections.find(c => c.provider === provider.id);
                                        const busy = oauthLoading === provider.id;
                                        return (
                                            <div key={provider.id} className={clsx(
                                                'bg-white border rounded-xl p-5 shadow-sm flex flex-col gap-3',
                                                configured ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50'
                                            )}>
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-900">{provider.name}</div>
                                                        <div className="text-xs text-slate-500">{provider.description}</div>
                                                        {connection?.account_name && (
                                                            <p className="text-[11px] text-slate-500 mt-1">
                                                                Connected as <span className="font-medium text-slate-700">{connection.account_name}</span>
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span className={clsx(
                                                        'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border flex-shrink-0',
                                                        connection
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            : 'bg-slate-50 text-slate-500 border-slate-200'
                                                    )}>
                                                        {connection ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                        {connection ? 'Connected' : 'Not Connected'}
                                                    </span>
                                                </div>

                                                {configured ? (
                                                    connection ? (
                                                        <button
                                                            onClick={() => handleDisconnect(provider.id as any)}
                                                            disabled={busy}
                                                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 self-start"
                                                        >
                                                            <Unlink className="w-3.5 h-3.5" /> Disconnect
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleConnect(provider.id as any)}
                                                            disabled={busy}
                                                            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 self-start"
                                                        >
                                                            <Link className="w-3.5 h-3.5" />
                                                            {busy ? 'Redirecting…' : `Connect ${provider.name}`}
                                                        </button>
                                                    )
                                                ) : (
                                                    <div className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
                                                        Not configured on this deployment. See <code className="bg-slate-100 px-1 rounded">docs/OAUTH_SETUP.md</code> to enable.
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                <p className="text-sm text-amber-800">
                                    <strong>Tip:</strong> Services without OAuth can still be used via the <strong>API Call</strong> node with manual authentication headers,
                                    or by storing tokens in your <strong>Secrets Vault</strong>. For Microsoft Excel, connect <strong>Microsoft 365</strong> and select it in the Sheets node configuration.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'secrets' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="flex justify-between items-center">
                                <h1 className="text-3xl font-bold text-slate-900">Secrets Vault</h1>
                                <button onClick={() => setShowSecretsModal(true)} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-all">Manage Vault</button>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-3 font-bold uppercase text-xs tracking-wider">Key Name</th>
                                            <th className="px-6 py-3 font-bold uppercase text-xs tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {secrets.length === 0 ? (
                                            <tr>
                                                <td colSpan={2} className="px-6 py-12 text-center text-slate-400 italic">No secrets configured in vault.</td>
                                            </tr>
                                        ) : (
                                            secrets.map((s, i) => (
                                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4 font-mono text-slate-700 font-medium">{s.key}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                            Active
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}



                    {activeTab === 'logs' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h1 className="text-3xl font-bold text-slate-900">Global Activity</h1>
                                    <p className="text-sm text-slate-500 mt-1">
                                        {credits?.tier === 'pro' ? 'Last 30 days' : 'Last 3 days'}
                                        {historyTotal > 0 && ` - ${historyTotal} total runs`}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {credits?.tier === 'pro' && history.length > 0 && (
                                        <button
                                            onClick={() => {
                                                // Export logs to CSV
                                                const csvRows = [
                                                    ['Flow Name', 'Status', 'Date', 'Duration (ms)', 'Credits Used'].join(','),
                                                    ...history.map(h => [
                                                        `"${(h as any).flowName || 'Workflow'}"`,
                                                        h.status,
                                                        new Date(h.startTime).toISOString(),
                                                        h.duration,
                                                        h.creditsUsed || 0
                                                    ].join(','))
                                                ].join('\n');
                                                const blob = new Blob([csvRows], { type: 'text/csv' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `blupe-logs-${new Date().toISOString().split('T')[0]}.csv`;
                                                a.click();
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
                                        >
                                            <Download className="w-4 h-4" />
                                            Export CSV
                                        </button>
                                    )}
                                    <button
                                        onClick={() => loadHistory()}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                    >
                                        <Activity className="w-4 h-4" />
                                        Refresh
                                    </button>
                                </div>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-[600px]">
                                {history.length === 0 ? (
                                    <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                                        <Activity className="w-12 h-12 mb-4 opacity-20" />
                                        <p>No activity recorded yet.</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100 overflow-y-auto flex-1 custom-scrollbar">
                                        {history.map((run) => (
                                            <div
                                                key={run.id}
                                                onClick={() => setSelectedLog(run)}
                                                className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer group"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={clsx("p-2 rounded-full", run.status === 'success' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600")}>
                                                        {run.status === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Terminal className="w-4 h-4" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800 text-sm group-hover:text-brand-600 transition-colors">{(run as any).flowName || 'Workflow Run'}</div>
                                                        <div className="text-xs text-slate-500 font-mono">{run.id.slice(0, 8)}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6 text-sm text-slate-600">
                                                    <div className="flex items-center gap-1 font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                                                        <Coins className="w-3 h-3 text-yellow-500" />
                                                        {run.creditsUsed || 10}
                                                    </div>
                                                    <div className="flex items-center gap-1 w-20 justify-end">
                                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                        {run.duration}ms
                                                    </div>
                                                    <div className="font-mono text-xs text-slate-400 w-32 text-right">
                                                        {new Date(run.startTime).toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Pagination Controls */}
                            {historyTotal > pageSize && (
                                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
                                    <div className="text-sm text-slate-500">
                                        Showing {historyPage * pageSize + 1} - {Math.min((historyPage + 1) * pageSize, historyTotal)} of {historyTotal}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                                            disabled={historyPage === 0}
                                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                            Previous
                                        </button>
                                        <span className="text-sm text-slate-500 px-2">
                                            Page {historyPage + 1} of {Math.ceil(historyTotal / pageSize)}
                                        </span>
                                        <button
                                            onClick={() => setHistoryPage(p => p + 1)}
                                            disabled={(historyPage + 1) * pageSize >= historyTotal}
                                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Next
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
