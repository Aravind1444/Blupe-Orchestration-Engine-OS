import React, { useEffect, useState } from 'react';
import {
    Search,
    Users,
    Crown,
    Coins,
    Zap,
    PlayCircle,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Filter,
    Edit2,
    X,
    Save,
    Check
} from 'lucide-react';
import { admin } from '../services/supabase';
import { AdminUser } from '../types';
import clsx from 'clsx';

// Edit User Modal
type TierType = 'starter' | 'pro' | 'enterprise';

const EditUserModal: React.FC<{
    user: AdminUser;
    onSave: (userId: string, updates: { tier: TierType; balance: number; flow_limit: number }) => Promise<void>;
    onClose: () => void;
}> = ({ user, onSave, onClose }) => {
    const [tier, setTier] = useState<TierType>(user.tier);
    const [balance, setBalance] = useState(user.balance);
    const [flowLimit, setFlowLimit] = useState(user.flow_limit || 10);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await onSave(user.user_id, { tier, balance, flow_limit: flowLimit });
            onClose();
        } catch (e: any) {
            setError(e.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const tierOptions: Array<{ value: TierType; label: string; description: string; credits: number; flows: number }> = [
        { value: 'starter', label: 'Starter', description: 'Free tier with limited features', credits: 500, flows: 10 },
        { value: 'pro', label: 'Pro', description: 'Premium features with higher limits', credits: 5000, flows: 50 },
        { value: 'enterprise', label: 'Enterprise', description: 'Unlimited features for teams', credits: 50000, flows: 100 }
    ];

    const applyTierDefaults = (selectedTier: TierType) => {
        const tierConfig = tierOptions.find(t => t.value === selectedTier);
        if (tierConfig) {
            setBalance(tierConfig.credits);
            setFlowLimit(tierConfig.flows);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Edit User</h3>
                        <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* User Info */}
                    <div className="bg-slate-50 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center">
                                <span className="text-brand-600 font-bold text-lg">
                                    {(user.full_name || user.email)?.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <p className="font-medium text-slate-900">{user.full_name || 'No name'}</p>
                                <p className="text-sm text-slate-500">{user.handle ? `@${user.handle}` : user.user_id.slice(0, 8)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Tier Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Subscription Tier</label>
                        <div className="grid grid-cols-3 gap-3">
                            {tierOptions.map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => {
                                        setTier(option.value);
                                        applyTierDefaults(option.value);
                                    }}
                                    className={clsx(
                                        "p-3 rounded-xl border-2 text-left transition-all",
                                        tier === option.value
                                            ? "border-brand-500 bg-brand-50"
                                            : "border-slate-200 hover:border-slate-300"
                                    )}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        {option.value === 'pro' && <Crown className="w-4 h-4 text-amber-500" />}
                                        {option.value === 'enterprise' && <Crown className="w-4 h-4 text-purple-500" />}
                                        <span className={clsx(
                                            "font-bold text-sm",
                                            tier === option.value ? "text-brand-700" : "text-slate-700"
                                        )}>
                                            {option.label}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500">{option.credits} credits</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Balance */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Credit Balance</label>
                        <div className="relative">
                            <Coins className="absolute left-3 top-2.5 w-5 h-5 text-yellow-500" />
                            <input
                                type="number"
                                value={balance}
                                onChange={e => setBalance(parseInt(e.target.value) || 0)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 font-mono"
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Manually adjust the user's credit balance</p>
                    </div>

                    {/* Flow Limit */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Flow Limit</label>
                        <div className="relative">
                            <Zap className="absolute left-3 top-2.5 w-5 h-5 text-purple-500" />
                            <input
                                type="number"
                                value={flowLimit}
                                onChange={e => setFlowLimit(parseInt(e.target.value) || 1)}
                                min={1}
                                max={1000}
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 font-mono"
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Maximum number of workflows this user can create</p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
                    >
                        {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export const AdminUsers: React.FC = () => {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [tierFilter, setTierFilter] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
    const pageSize = 20;

    useEffect(() => {
        loadUsers();
    }, [page, tierFilter]);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await admin.getUsers({
                limit: pageSize,
                offset: page * pageSize,
                search: search || undefined,
                tier: tierFilter || undefined
            });
            setUsers(data.users || []);
            setTotal(data.total || 0);
        } catch (e) {
            console.error('Failed to load users:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(0);
        loadUsers();
    };

    const handleSaveUser = async (userId: string, updates: { tier: TierType; balance: number; flow_limit: number }) => {
        await admin.updateUser(userId, updates);
        // Update local state
        setUsers(prev => prev.map(u =>
            u.user_id === userId
                ? { ...u, tier: updates.tier, balance: updates.balance, flow_limit: updates.flow_limit }
                : u
        ));
        setSaveSuccess(userId);
        setTimeout(() => setSaveSuccess(null), 2000);
    };

    const totalPages = Math.ceil(total / pageSize);

    const getTierBadge = (tier: string) => {
        switch (tier) {
            case 'pro':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                        <Crown className="w-3 h-3" /> Pro
                    </span>
                );
            case 'enterprise':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                        <Crown className="w-3 h-3" /> Enterprise
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        Starter
                    </span>
                );
        }
    };

    return (
        <div className="space-y-6">
            {/* Edit Modal */}
            {editingUser && (
                <EditUserModal
                    user={editingUser}
                    onSave={handleSaveUser}
                    onClose={() => setEditingUser(null)}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
                    <p className="text-slate-500 text-sm mt-1">{total.toLocaleString()} total users</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 p-4">
                <form onSubmit={handleSearch} className="flex-1 relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by email, name, or handle..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 transition-colors"
                    />
                </form>

                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={tierFilter || ''}
                        onChange={(e) => {
                            setTierFilter(e.target.value || null);
                            setPage(0);
                        }}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 bg-white"
                    >
                        <option value="">All Tiers</option>
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-center py-20">
                        <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500">No users found</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                                <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tier</th>
                                <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                                <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Flows</th>
                                <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Runs</th>
                                <th className="text-left px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Joined</th>
                                <th className="text-right px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {users.map((user) => (
                                <tr
                                    key={user.user_id}
                                    className={clsx(
                                        "hover:bg-slate-50 transition-colors",
                                        saveSuccess === user.user_id && "bg-green-50"
                                    )}
                                >
                                    <td className="px-6 py-4">
                                        <div>
                                            <p className="font-medium text-slate-900">{user.full_name || user.email?.split('@')[0]}</p>
                                            <p className="text-sm text-slate-500">{user.email}</p>
                                            {user.handle && (
                                                <p className="text-xs text-slate-400">@{user.handle}</p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {getTierBadge(user.tier)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <Coins className="w-4 h-4 text-yellow-500" />
                                            <span className="font-mono font-medium text-slate-900">{user.balance.toLocaleString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <Zap className="w-4 h-4 text-purple-500" />
                                            <span className="font-mono text-slate-700">{user.flow_count}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <PlayCircle className="w-4 h-4 text-blue-500" />
                                            <span className="font-mono text-slate-700">{user.run_count}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-slate-500">
                                            {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => setEditingUser(user)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                                        >
                                            {saveSuccess === user.user_id ? (
                                                <>
                                                    <Check className="w-4 h-4 text-green-500" />
                                                    <span className="text-green-600">Saved</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Edit2 className="w-4 h-4" />
                                                    Edit
                                                </>
                                            )}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
                        <p className="text-sm text-slate-500">
                            Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className={clsx(
                                    "p-2 rounded-lg border transition-colors",
                                    page === 0
                                        ? "border-slate-200 text-slate-300 cursor-not-allowed"
                                        : "border-slate-200 text-slate-600 hover:bg-white"
                                )}
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-sm font-medium text-slate-700 px-3">
                                Page {page + 1} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1}
                                className={clsx(
                                    "p-2 rounded-lg border transition-colors",
                                    page >= totalPages - 1
                                        ? "border-slate-200 text-slate-300 cursor-not-allowed"
                                        : "border-slate-200 text-slate-600 hover:bg-white"
                                )}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminUsers;
