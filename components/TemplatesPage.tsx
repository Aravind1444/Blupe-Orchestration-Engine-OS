
import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, Star, GitBranch, User, Loader2, LayoutTemplate } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../services/supabase';

interface Template {
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    install_count: number;
    created_at: string;
    is_featured: boolean;
    creator_user_id: string;
    creator?: {
        email: string; // Or handle/name if available
    };
}

interface TemplatesPageProps {
    onUseTemplate: (templateId: string) => void;
}

const CATEGORIES = ['All', 'Sales', 'Marketing', 'Dev', 'HR', 'Personal', 'Other'];

export const TemplatesPage: React.FC<TemplatesPageProps> = ({ onUseTemplate }) => {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('All');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [installingId, setInstallingId] = useState<string | null>(null);

    useEffect(() => {
        fetchTemplates();
    }, [category]); // Search usually triggers on debounce or enter, keeping simple for now

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (category !== 'All') params.append('category', category);
            if (search) params.append('search', search);

            const res = await fetch(`/api/templates?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch templates');

            const data = await res.json();
            setTemplates(data);
        } catch (err: any) {
            console.error(err);
            setError('Failed to load templates. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchTemplates();
    };

    const handleUseTemplate = async (templateId: string) => {
        setInstallingId(templateId);
        try {
            await onUseTemplate(templateId);
        } catch (err: any) {
            console.error(err);
            // setError(err.message); // Parent handles error display usually
        } finally {
            setInstallingId(null);
        }
    };

    return (
        <div className="flex bg-[#f8fafc] h-full overflow-hidden">
            {/* Sidebar / Filters */}
            <div className="w-64 border-r border-slate-200 bg-white p-6 flex flex-col gap-6 overflow-y-auto">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <LayoutTemplate className="w-6 h-6 text-brand-600" />
                        Templates
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">Discover workflows from the community</p>
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Categories</label>
                    <div className="space-y-0.5 mt-2">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={clsx(
                                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                    category === cat
                                        ? "bg-brand-50 text-brand-700"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header / Search */}
                <div className="p-6 border-b border-slate-200 bg-white flex items-center justify-between gap-4">
                    <form onSubmit={handleSearch} className="flex-1 max-w-lg relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search templates..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                        />
                    </form>
                    <div className="flex items-center gap-2">
                        {/* Sort options or other actions could go here */}
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-slate-400">
                            <Loader2 className="w-8 h-8 animate-spin" />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full text-red-500">
                            <p>{error}</p>
                            <button onClick={fetchTemplates} className="mt-4 text-sm underline">Retry</button>
                        </div>
                    ) : templates.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 m-4">
                            <Search className="w-12 h-12 mb-4 opacity-20" />
                            <p>No templates found matching your criteria</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {templates.map(template => (
                                <div key={template.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-lg transition-all group flex flex-col">
                                    <div className="p-5 flex-1">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider border border-slate-200">
                                                {template.category}
                                            </div>
                                            {template.is_featured && (
                                                <div className="text-amber-500 animate-pulse" title="Featured">
                                                    <Star className="w-4 h-4 fill-current" />
                                                </div>
                                            )}
                                        </div>
                                        <h3 className="font-bold text-slate-900 mb-1 group-hover:text-brand-600 transition-colors line-clamp-1">{template.name}</h3>
                                        <p className="text-sm text-slate-500 line-clamp-2 mb-4 h-10">{template.description}</p>

                                        <div className="flex flex-wrap gap-1 mb-4">
                                            {template.tags?.slice(0, 3).map(tag => (
                                                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded border border-slate-100">
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                        <div className="flex items-center gap-3 text-xs text-slate-400">
                                            <div className="flex items-center gap-1" title="Installs">
                                                <Download className="w-3.5 h-3.5" />
                                                {template.install_count}
                                            </div>
                                            {/* Date or Author could go here */}
                                        </div>
                                        <button
                                            onClick={() => handleUseTemplate(template.id)}
                                            disabled={installingId === template.id}
                                            className="px-3 py-1.5 bg-white border border-slate-200 hover:border-brand-300 hover:text-brand-600 rounded-lg text-sm font-semibold shadow-sm text-slate-600 transition-all flex items-center gap-1.5 disabled:opacity-50"
                                        >
                                            {installingId === template.id ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <GitBranch className="w-3.5 h-3.5" />
                                            )}
                                            Use Template
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
