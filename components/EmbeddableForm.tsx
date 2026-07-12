
import React, { useState, useEffect } from 'react';
import { Loader2, Send, CheckCircle2, AlertCircle, FormInput } from 'lucide-react';
import clsx from 'clsx';
import { NodeData } from '../types';
import { getEffectiveNodeType, normalizeFlowNodes } from '../services/nodeContract';

interface EmbeddableFormProps {
    flowId: string;
}

interface FormField {
    id: string;
    label: string;
    variableName: string;
    type?: string;
    required?: boolean;
}

export const EmbeddableForm: React.FC<EmbeddableFormProps> = ({ flowId }) => {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [formNode, setFormNode] = useState<any>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchFlow = async () => {
            try {
                const res = await fetch(`/.netlify/functions/public-flow?id=${flowId}`);
                if (!res.ok) throw new Error('Flow not found or access denied');

                const data = await res.json();
                const nodes = normalizeFlowNodes(data.nodes || []);
                const trigger = nodes.find((n: any) => getEffectiveNodeType(n) === 'form_trigger');

                if (!trigger) {
                    throw new Error('This workflow does not have a Form Trigger');
                }

                setFormNode(trigger);

                // Initialize form data
                const initialData: Record<string, string> = {};
                (trigger.data.formFields || []).forEach((f: FormField) => {
                    initialData[f.variableName] = '';
                });
                setFormData(initialData);

            } catch (err: any) {
                console.error(err);
                setError(err.message || 'Failed to load form');
            } finally {
                setLoading(false);
            }
        };

        if (flowId) fetchFlow();
    }, [flowId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/.netlify/functions/webhook/${flowId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!res.ok) throw new Error('Failed to submit form');

            setSuccess(true);
            setFormData({}); // Clear form on success

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Submission failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p>Loading form...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-red-500 text-center">
                <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                <p className="font-medium">{error}</p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center animate-in fade-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Submission Successful!</h3>
                <p className="text-slate-500 mb-8 max-w-xs mx-auto">Your response has been recorded and the workflow has started.</p>
                <button
                    onClick={() => setSuccess(false)}
                    className="px-6 py-2.5 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/20"
                >
                    Submit Another Response
                </button>
            </div>
        );
    }

    if (!formNode) return null;

    const { formTitle, formFields = [] } = formNode.data;

    return (
        <div className="w-full max-w-xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 my-8">
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center gap-4">
                <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                    <FormInput className="w-6 h-6 text-brand-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">{formTitle || 'Public Input Form'}</h1>
                    <p className="text-sm text-slate-500">Please fill out the details below</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                {formFields.length === 0 ? (
                    <p className="text-center text-slate-400 italic py-8">This form has no fields configured.</p>
                ) : (
                    formFields.map((field: FormField) => (
                        <div key={field.id} className="space-y-2">
                            <label className="block text-sm font-bold text-slate-700">
                                {field.label}
                                {field.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            <input
                                type={field.type || 'text'}
                                value={formData[field.variableName] || ''}
                                onChange={e => setFormData({ ...formData, [field.variableName]: e.target.value })}
                                required={field.required !== false}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-900 placeholder:text-slate-400"
                                placeholder={`Enter ${field.label.toLowerCase()}...`}
                            />
                        </div>
                    ))
                )}

                <div className="pt-4">
                    <button
                        type="submit"
                        disabled={submitting || formFields.length === 0}
                        className={clsx(
                            "w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl text-white font-bold text-lg shadow-lg transition-all transform active:scale-[0.98]",
                            submitting || formFields.length === 0
                                ? "bg-slate-300 cursor-not-allowed shadow-none"
                                : "bg-brand-600 hover:bg-brand-500 hover:shadow-brand-500/25"
                        )}
                    >
                        {submitting ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <span>Submit Response</span>
                                <Send className="w-5 h-5" />
                            </>
                        )}
                    </button>
                </div>
            </form>

            <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400 font-medium">Powered by <span className="text-brand-600 font-bold">Blupe</span></p>
            </div>
        </div>
    );
};
