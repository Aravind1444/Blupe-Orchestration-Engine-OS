
// ... imports
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Lock, Eye, EyeOff, AlertCircle, Cloud, CloudOff, Info } from 'lucide-react'; // Added Info
import { Secret, UserCredits } from '../types';
import { storage } from '../services/supabase';

interface SecretsModalProps {
    isOpen: boolean;
    onClose: () => void;
    secrets: Secret[];
    onSave: (secrets: Secret[]) => void;
}

export const SecretsModal: React.FC<SecretsModalProps> = ({ isOpen, onClose, secrets: initialSecrets, onSave }) => {
    // ... existing state
    const [secrets, setSecrets] = useState<Secret[]>(initialSecrets);
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');
    const [visible, setVisible] = useState<Record<number, boolean>>({});
    const [credits, setCredits] = useState<UserCredits | null>(null);
    const [syncEnabled, setSyncEnabled] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSecrets(initialSecrets); // Reset to props when opened
            storage.getUserCredits().then(creds => {
                setCredits(creds);
                // Check if we have cloud secrets to set initial toggle state
                if (creds.tier === 'pro') {
                    storage.getCloudSecrets().then(cloud => {
                        if (cloud.length > 0) setSyncEnabled(true);
                    });
                }
            });
        }
    }, [isOpen, initialSecrets]);

    // ... existing handlers (handleAdd, handleDelete, etc.)
    const handleAdd = () => {
        if (!newKey || !newValue) return;
        setSecrets([...secrets, { key: newKey.toUpperCase(), value: newValue }]);
        setNewKey('');
        setNewValue('');
    };

    const handleDelete = (index: number) => {
        const next = [...secrets];
        next.splice(index, 1);
        setSecrets(next);
    };

    const toggleVisible = (index: number) => {
        setVisible(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const handleSaveClose = async () => {
        onSave(secrets);
        if (credits?.tier === 'pro') {
            try {
                if (syncEnabled) {
                    await storage.syncSecretsToCloud(secrets);
                } else {
                    // User turned off sync (or it was off) - purge cloud
                    await storage.deleteCloudSecrets();
                }
            } catch (e: any) {
                console.error("Failed to sync/purge secrets", e);
            }
        }
        onClose();
    };

    const toggleSync = () => {
        if (credits?.tier === 'starter') {
            alert("Cloud Secret Sync is a Pro feature. Please upgrade your plan.");
            return;
        }
        setSyncEnabled(!syncEnabled);
    };

    const requiredKeys = [
        'API_KEY',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'GROQ_API_KEY',
        'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
        'SLACK_WEBHOOK',
        'TAVILY_API_KEY'
    ];

    // Added: Auto populate key name
    const handleRequiredKeyClick = (key: string) => {
        if (!secrets.some(s => s.key === key)) {
            setNewKey(key);
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ... Header ... */}
                <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-brand-50 rounded-md">
                            <Lock className="w-4 h-4 text-brand-600" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-900">Environment Secrets</h2>
                            <p className="text-xs text-slate-500">Securely store API keys for integrations.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex h-[450px]">
                    {/* Sidebar */}
                    <div className="w-64 bg-slate-50 border-r border-slate-200 p-5 space-y-6 overflow-y-auto">
                        {/* ... Sync Toggle ... */}
                        <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-700">Cloud Sync</span>
                                {credits?.tier === 'pro' ? (
                                    <button onClick={toggleSync} className={`w-8 h-4 rounded-full transition-colors relative ${syncEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${syncEnabled ? 'translate-x-4' : ''}`} />
                                    </button>
                                ) : (
                                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                                )}
                            </div>
                            <p className="text-[10px] text-slate-500 leading-tight">
                                {credits?.tier === 'pro'
                                    ? "Encrypt & Sync keys to cloud for published flows."
                                    : "Upgrade to Pro to sync secrets."}
                            </p>
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Required Keys</h3>
                            <div className="space-y-2">
                                {requiredKeys.map(key => {
                                    const isSet = secrets.some(s => s.key === key);
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => handleRequiredKeyClick(key)}
                                            className="w-full flex items-center justify-between text-xs hover:bg-slate-100 p-1 rounded transition-colors text-left"
                                        >
                                            <code className="text-slate-600">{key}</code>
                                            {isSet ? (
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />
                                            ) : (
                                                <Plus className="w-3 h-3 text-slate-400 opacity-50" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 p-5 flex flex-col">
                        {/* ... Secrets List ... */}
                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar mb-4">
                            {secrets.length === 0 && (
                                <div className="text-center py-10 text-slate-400 italic text-xs">No secrets configured.</div>
                            )}
                            {secrets.map((secret, i) => (
                                <div key={i} className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200 group hover:border-slate-300 transition-colors shadow-sm">
                                    <div className="w-1/3">
                                        <span className="text-xs font-bold font-mono text-slate-700 block truncate" title={secret.key}>{secret.key}</span>
                                    </div>
                                    <div className="flex-1 flex items-center justify-between gap-2 bg-slate-50 rounded px-2 py-1 border border-slate-100 min-w-0">
                                        <span className="text-xs font-mono text-slate-500 break-all w-full">
                                            {visible[i] ? secret.value : '•'.repeat(24)}
                                        </span>
                                        <button onClick={() => toggleVisible(i)} className="text-slate-400 hover:text-slate-700 shrink-0">
                                            {visible[i] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                        </button>
                                    </div>
                                    <button onClick={() => handleDelete(i)} className="text-slate-400 hover:text-red-500 transition-colors p-1">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Input Area */}
                        <div className="flex gap-2 pt-4 border-t border-slate-200">
                            <input
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                                placeholder="KEY_NAME"
                                className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500 font-mono transition-colors shadow-sm"
                            />
                            <input
                                value={newValue}
                                onChange={(e) => setNewValue(e.target.value)}
                                type="password"
                                placeholder="Value..."
                                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500 transition-colors shadow-sm"
                            />
                            <button
                                onClick={handleAdd}
                                className="bg-brand-600 hover:bg-brand-700 text-white px-3.5 rounded-lg flex items-center justify-center transition-colors shadow-md shadow-brand-500/20"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 flex justify-end bg-slate-50 rounded-b-xl">
                    <button
                        onClick={handleSaveClose}
                        className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-lg text-xs font-bold transition-colors shadow-md"
                    >
                        Save & Close
                    </button>
                </div>
            </div>
        </div>
    );
};
