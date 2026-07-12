import React from 'react';
import { ArrowLeft, ShieldCheck, Lock, Eye, Mail, Server } from 'lucide-react';

interface PrivacyPolicyPageProps {
    onBack: () => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onBack }) => {
    return (
        <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto px-6 py-12">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-8 transition-colors text-sm font-medium">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>

                <div className="flex items-center justify-between mb-8">
                    <h1 className="text-4xl font-bold text-slate-900">Privacy Policy</h1>
                    <div className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium">
                        Effective Date: December 6, 2025
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm mb-8">
                    <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed">
                        <p className="text-lg font-medium text-slate-900 mb-6">
                            At Blupe, we believe that your data belongs to you. This Privacy Policy outlines our commitment to handling your information securely and responsibly.
                        </p>

                        <h3 className="flex items-center gap-2 text-slate-900 text-lg font-bold mt-8 mb-4">
                            <Eye className="w-5 h-5 text-brand-600" /> 1. Data Collection & Usage
                        </h3>
                        <p>
                            We collect only the information necessary to provide our services. This includes:
                        </p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li><strong>Account Information:</strong> Email address for authentication and identity management.</li>
                            <li><strong>Workflow Data:</strong> Configuration of your agents, flows, and automation scripts, stored securely to execute your tasks.</li>
                            <li><strong>Usage Logs:</strong> Operational logs to help you debug your workflows. These are strictly for your utility.</li>
                        </ul>
                        <p className="mt-4">
                            We process this data solely to deliver the Blupe platform's functionality. We do <strong>not</strong> sell, rent, or monetize your personal data to third parties.
                        </p>

                        <h3 className="flex items-center gap-2 text-slate-900 text-lg font-bold mt-8 mb-4">
                            <Lock className="w-5 h-5 text-emerald-600" /> 2. Security & Zero-Trust Secrets
                        </h3>
                        <p>
                            Your data is handled securely and responsibly. A cornerstone of our security architecture is our <strong>Zero-Trust Secrets handling</strong>:
                        </p>
                        <p className="mt-2">
                            Your API keys (e.g., for OpenAI, Anthropic, or database credentials) are, by default, stored <strong>locally in your browser</strong>. They are never transmitted to our servers unless you explicitly opt-in to Cloud Sync for cross-device usage. When synced, they are encrypted with AES-256 before storage.
                        </p>

                        <h3 className="flex items-center gap-2 text-slate-900 text-lg font-bold mt-8 mb-4">
                            <Mail className="w-5 h-5 text-blue-600" /> 3. Communications
                        </h3>
                        <p>
                            We value your inbox. Communication from Blupe is strictly on a <strong>need-to-know basis</strong>:
                        </p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li><strong>Transactional Emails:</strong> Password resets, billing confirmations, and critical account alerts.</li>
                            <li><strong>Product Updates:</strong> Major feature releases or security notices. You may opt-out of non-essential updates at any time.</li>
                            <li><strong>No Spam:</strong> We will never send third-party promotional emails.</li>
                        </ul>

                        <h3 className="flex items-center gap-2 text-slate-900 text-lg font-bold mt-8 mb-4">
                            <Server className="w-5 h-5 text-purple-600" /> 4. Data Sub-processors
                        </h3>
                        <p>
                            To provide our service, we partner with trusted infrastructure providers:
                        </p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li><strong>Supabase:</strong> Database and authentication services.</li>
                            <li><strong>Google Cloud Platform / Netlify:</strong> Hosting and serverless compute infrastructure.</li>
                        </ul>

                        <h3 className="flex items-center gap-2 text-slate-900 text-lg font-bold mt-8 mb-4">
                            <ShieldCheck className="w-5 h-5 text-slate-600" /> 5. Your Rights
                        </h3>
                        <p>
                            You retain full control over your data. You have the right to:
                        </p>
                        <ul className="list-disc pl-5 space-y-2 mt-2">
                            <li><strong>Access:</strong> Request a copy of all data we hold about you.</li>
                            <li><strong>Correction:</strong> Update inaccurate information via your account settings.</li>
                            <li><strong>Deletion:</strong> Request complete deletion of your account and all associated data. We honor these requests promptly.</li>
                        </ul>

                        <div className="mt-12 pt-8 border-t border-slate-100">
                            <p className="text-slate-500 text-sm">
                                For any privacy-related concerns or requests, please contact us at <a href="mailto:team@blupe.space" className="text-brand-600 hover:underline">team@blupe.space</a>.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
