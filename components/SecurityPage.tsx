import React from 'react';
import { ArrowLeft, Lock, Server, Key, Eye } from 'lucide-react';

interface SecurityPageProps {
    onBack: () => void;
}

export const SecurityPage: React.FC<SecurityPageProps> = ({ onBack }) => {
    return (
        <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto px-6 py-12">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-8 transition-colors text-sm font-medium">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>

                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-4xl font-bold text-slate-900">Security Architecture</h1>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-sm font-medium">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        System Operational
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
                        <Lock className="w-8 h-8 text-brand-500 mb-4" />
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Encryption at Rest</h3>
                        <p className="text-sm text-slate-600">
                            All workflow data persisted to the database is encrypted using industry standards. Your sensitive API keys never leave your browser, and is stored locally.
                        </p>
                    </div>
                    <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
                        <Server className="w-8 h-8 text-blue-500 mb-4" />
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Industry Compliant Security and Infrastructure</h3>
                        <p className="text-sm text-slate-600">
                            Blupe runs on Google Cloud Platform and Vercel, inheriting their robust physical and network security controls.
                        </p>
                    </div>
                    <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
                        <Key className="w-8 h-8 text-yellow-500 mb-4" />
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Zero-Trust Secrets</h3>
                        <p className="text-sm text-slate-600">
                            By default, API keys entered in the "Secrets" modal are stored in your browser's LocalStorage. They are never sent to our servers unless you opt-in to Cloud Sync.
                        </p>
                    </div>
                    <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
                        <Eye className="w-8 h-8 text-purple-500 mb-4" />
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Audit Logging</h3>
                        <p className="text-sm text-slate-600">
                            Every workflow execution generates a comprehensive log. Trace every step, input, and output for full observability.
                        </p>
                    </div>
                </div>

                <div className="p-8 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">Vulnerability Reporting</h2>
                    <p className="text-slate-600 text-sm mb-4">
                        We take security seriously. If you discover a vulnerability, please report it via our responsible disclosure program.
                    </p>
                    <a href="mailto:team@blupe.space" className="text-brand-600 font-medium hover:underline">team@blupe.space</a>
                </div>
            </div>
        </div>
    );
};