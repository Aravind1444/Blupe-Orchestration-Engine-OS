import React from 'react';
import { ArrowLeft, RefreshCw, FileText } from 'lucide-react';

interface RefundPolicyPageProps {
    onBack: () => void;
}

export const RefundPolicyPage: React.FC<RefundPolicyPageProps> = ({ onBack }) => {
    return (
        <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans overflow-y-auto custom-scrollbar">
            <div className="max-w-4xl mx-auto px-6 py-12">
                <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-8 transition-colors text-sm font-medium">
                    <ArrowLeft className="w-4 h-4" /> Back
                </button>

                <h1 className="text-4xl font-bold text-slate-900 mb-8">Cancellation & Refund Policy</h1>

                <div className="space-y-12">
                    <section className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <FileText className="w-6 h-6 text-brand-600" />
                            <h2 className="text-2xl font-bold text-slate-900">Cancellation Policy</h2>
                        </div>
                        <div className="prose prose-slate prose-sm text-slate-600">
                            <p>
                                We believe in freedom of choice. You can cancel your subscription at any time.
                            </p>
                            <p>
                                When you cancel, your plan will remain active until the end of your current billing cycle. After that, your account will revert to the free tier, and you will not be charged again.
                            </p>
                        </div>
                    </section>

                    <section className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <RefreshCw className="w-6 h-6 text-emerald-600" />
                            <h2 className="text-2xl font-bold text-slate-900">Refund Policy</h2>
                        </div>
                        <div className="prose prose-slate prose-sm text-slate-600">
                            <p>
                                We want you to be happy with your purchase. If you are not satisfied, we offer refunds under specific conditions.
                            </p>
                            <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">Eligibility Criteria</h3>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>You must reach out to us within the <strong>first 3 days</strong> of subscribing to your plan.</li>
                                <li>You must have used <strong>less than 10%</strong> of the credits allotted to your plan.</li>
                            </ul>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-4">
                                <p className="text-xs text-slate-500">
                                    <strong>Example:</strong> If your plan offers 5,000 credits, you are eligible for a refund only if you have used fewer than 500 credits.
                                </p>
                            </div>
                            <h3 className="text-lg font-semibold text-slate-800 mt-6 mb-2">How to Request a Refund</h3>
                            <p>
                                To request a refund, please contact our support team via email at:
                                <a href="mailto:team@blupe.space" className="text-brand-600 hover:text-brand-700 font-medium ml-1">team@blupe.space</a>
                            </p>
                            <p>
                                We will review your request and process it if it meets the criteria mentioned above.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
