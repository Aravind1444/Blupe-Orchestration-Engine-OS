import React from 'react';
import { ArrowLeft, Scale, ShieldCheck } from 'lucide-react';

interface LegalPageProps {
    onBack: () => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ onBack }) => {
    return (
        <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto px-6 py-12">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-8 transition-colors text-sm font-medium">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>

                <h1 className="text-4xl font-bold text-slate-900 mb-8">Legal Center</h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <button
                        onClick={() => window.location.hash = '#terms'}
                        className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm hover:border-brand-500 hover:shadow-lg transition-all text-left group"
                    >
                        <h2 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-brand-600 transition-colors">Terms of Service</h2>
                        <p className="text-slate-600 text-sm">Read our comprehensive terms and conditions governing the use of Blupe.</p>
                        <p className="text-brand-600 text-sm font-semibold mt-4 flex items-center gap-2">
                            View Terms <ArrowLeft className="w-4 h-4 rotate-180" />
                        </p>
                    </button>

                    <button
                        onClick={() => window.location.hash = '#privacy'}
                        className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm hover:border-brand-500 hover:shadow-lg transition-all text-left group"
                    >
                        <h2 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-brand-600 transition-colors">Privacy Policy</h2>
                        <p className="text-slate-600 text-sm">Learn how we handle your data securely and responsibly.</p>
                        <p className="text-brand-600 text-sm font-semibold mt-4 flex items-center gap-2">
                            View Policy <ArrowLeft className="w-4 h-4 rotate-180" />
                        </p>
                    </button>
                </div>
            </div>
        </div>

    );
};