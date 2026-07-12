import React, { useEffect, useState } from 'react';
import {
    Plus,
    LayoutTemplate,
    Pencil,
    Trash2,
    X,
    Save,
    ToggleLeft,
    ToggleRight,
    Star,
    Loader2,
    Upload,
    Eye,
    Code2,
    Zap,
    ArrowRight,
    Sparkles,
    Wand2
} from 'lucide-react';
import { admin, getAuthHeaders } from '../services/supabase';
import { AdminTemplate } from '../types';
import clsx from 'clsx';

const CATEGORY_OPTIONS = ['Sales', 'Marketing', 'Dev', 'HR', 'Personal', 'Other'] as const;
type TemplateCategory = 'Sales' | 'Marketing' | 'Dev' | 'HR' | 'Personal' | 'Other';

// AI Template Generator Modal
const AITemplateGenerator: React.FC<{
    onGenerate: (templateData: Partial<AdminTemplate>) => void;
    onClose: () => void;
}> = ({ onGenerate, onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [generatedTemplate, setGeneratedTemplate] = useState<Partial<AdminTemplate> | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError('Please describe the workflow template you want to create');
            return;
        }

        setLoading(true);
        setError('');
        setGeneratedTemplate(null);

        try {
            const templateHeaders = await getAuthHeaders({ 'Content-Type': 'application/json' });

            const response = await fetch('/api/llm', {
                method: 'POST',
                headers: templateHeaders,
                body: JSON.stringify({
                    provider: 'gemini',
                    model: 'gemini-3.1-pro-preview',
                    prompt: `Create a workflow automation template for: ${prompt}

Return ONLY valid JSON with this structure:
{
  "name": "Template Name",
  "description": "Clear 1-2 sentence description",
  "category": "One of: Sales, Marketing, Dev, HR, Personal, Other",
  "nodes": [
    {"id": "node-1", "type": "start|llm|condition|email|slack|webhook|schedule|api_call|sheets|javascript|input|output", "position": {"x": 100, "y": 200}, "data": {"label": "Node Label", "type": "same as type", ...other fields}}
  ],
  "edges": [
    {"id": "e1", "source": "node-1", "target": "node-2", "animated": true}
  ]
}

Layout nodes left-to-right (x increases by 300). Use practical, real-world automation patterns.`,
                    temperature: 0.4,
                    maxTokens: 3000
                })
            });

            if (!response.ok) throw new Error('Failed to generate template');

            const data = await response.json();
            let jsonStr = data.text.trim();
            if (jsonStr.startsWith('\`\`\`')) {
                jsonStr = jsonStr.replace(/^\`\`\`(?:json)?\n?/, '').replace(/\n?\`\`\`$/, '');
            }
            const templateData = JSON.parse(jsonStr);
            setGeneratedTemplate(templateData);
        } catch (err: any) {
            setError(err.message || 'Failed to generate template');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-brand-600" />
                        <h3 className="text-lg font-bold text-slate-900">AI Template Generator</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Describe the workflow template</label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g., Monitor RSS feeds for keywords and send Slack alerts with AI-summarized content"
                            rows={4}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 resize-none"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {['Daily summary to email', 'Lead scoring webhook', 'Customer feedback analyzer'].map(s => (
                            <button
                                key={s}
                                onClick={() => setPrompt(s)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-600 rounded-lg transition-colors"
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {generatedTemplate && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                            <div>
                                <p className="font-bold text-slate-900">{generatedTemplate.name}</p>
                                <p className="text-sm text-slate-600">{generatedTemplate.description}</p>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                <span className="px-2 py-1 bg-white border border-slate-200 rounded text-xs">
                                    {generatedTemplate.category}
                                </span>
                                <span className="px-2 py-1 bg-white border border-slate-200 rounded text-xs">
                                    {(generatedTemplate.nodes as any[])?.length || 0} nodes
                                </span>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {((generatedTemplate.nodes as any[]) || []).slice(0, 4).map((n: any, i: number) => (
                                    <span key={i} className="px-2 py-1 bg-brand-50 text-brand-700 rounded text-xs">
                                        {n.data?.label || n.type}
                                    </span>
                                ))}
                                {((generatedTemplate.nodes as any[])?.length || 0) > 4 && (
                                    <span className="text-xs text-slate-400">+{(generatedTemplate.nodes as any[]).length - 4} more</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        Cancel
                    </button>
                    {generatedTemplate ? (
                        <button
                            onClick={() => { onGenerate({ ...generatedTemplate, is_active: true, is_featured: false }); onClose(); }}
                            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            Create Template
                        </button>
                    ) : (
                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                            {loading ? 'Generating...' : 'Generate Template'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};


interface TemplateEditorProps {
    template: AdminTemplate | null;
    onSave: (template: Partial<AdminTemplate>) => void;
    onClose: () => void;
    saving: boolean;
}

interface FormState {
    name: string;
    description: string;
    category: TemplateCategory;
    is_active: boolean;
    is_featured: boolean;
    nodes: string;
    edges: string;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({ template, onSave, onClose, saving }) => {
    const [form, setForm] = useState<FormState>({
        name: template?.name || '',
        description: template?.description || '',
        category: (template?.category as TemplateCategory) || 'Other',
        is_active: template?.is_active ?? true,
        is_featured: template?.is_featured ?? false,
        nodes: JSON.stringify(template?.nodes || [], null, 2),
        edges: JSON.stringify(template?.edges || [], null, 2),
    });
    const [importMode, setImportMode] = useState(false);
    const [importJson, setImportJson] = useState('');

    const handleImport = () => {
        try {
            const data = JSON.parse(importJson);
            if (data.nodes && Array.isArray(data.nodes)) {
                setForm(f => ({
                    ...f,
                    nodes: JSON.stringify(data.nodes, null, 2),
                    edges: JSON.stringify(data.edges || [], null, 2),
                    name: data.name || f.name,
                    description: data.description || f.description,
                }));
                setImportMode(false);
                setImportJson('');
            } else {
                alert('Invalid flow JSON: missing nodes array');
            }
        } catch (e) {
            alert('Invalid JSON format');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        try {
            onSave({
                name: form.name,
                description: form.description,
                category: form.category as any,
                is_active: form.is_active,
                is_featured: form.is_featured,
                nodes: JSON.parse(form.nodes),
                edges: JSON.parse(form.edges),
            });
        } catch (e) {
            alert('Invalid JSON in nodes or edges');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                        {template ? 'Edit Template' : 'Create New Template'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Template Name</label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g., Lead Scorer Pro"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                                required
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                            <textarea
                                value={form.description}
                                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="What does this template do?"
                                rows={2}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 resize-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
                            <select
                                value={form.category}
                                onChange={(e) => setForm(f => ({ ...f, category: e.target.value as TemplateCategory }))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 bg-white"
                            >
                                {CATEGORY_OPTIONS.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Import Flow */}
                    {importMode ? (
                        <div className="border border-dashed border-slate-300 rounded-xl p-6 bg-slate-50">
                            <p className="text-sm font-medium text-slate-700 mb-3">Paste Flow JSON</p>
                            <textarea
                                value={importJson}
                                onChange={(e) => setImportJson(e.target.value)}
                                rows={8}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-brand-500 resize-none bg-white"
                                placeholder='{"nodes": [...], "edges": [...]}'
                            />
                            <div className="flex items-center gap-2 mt-4">
                                <button
                                    type="button"
                                    onClick={handleImport}
                                    className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
                                >
                                    Import
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setImportMode(false); setImportJson(''); }}
                                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setImportMode(true)}
                            className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:border-brand-500 hover:text-brand-600 transition-colors"
                        >
                            <Upload className="w-4 h-4" />
                            Import Flow JSON
                        </button>
                    )}

                    {/* Nodes JSON */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Nodes (JSON Array)</label>
                        <textarea
                            value={form.nodes}
                            onChange={(e) => setForm(f => ({ ...f, nodes: e.target.value }))}
                            rows={8}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-brand-500 resize-none bg-slate-50"
                            placeholder='[...]'
                        />
                    </div>

                    {/* Edges JSON */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Edges (JSON Array)</label>
                        <textarea
                            value={form.edges}
                            onChange={(e) => setForm(f => ({ ...f, edges: e.target.value }))}
                            rows={4}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-brand-500 resize-none bg-slate-50"
                            placeholder='[...]'
                        />
                    </div>

                    {/* Toggles */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                            <div>
                                <p className="font-medium text-slate-900 text-sm">Active</p>
                                <p className="text-xs text-slate-500">Visible in gallery</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                                className={clsx(
                                    "w-12 h-7 rounded-full transition-colors relative",
                                    form.is_active ? "bg-brand-600" : "bg-slate-300"
                                )}
                            >
                                <span className={clsx(
                                    "absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform",
                                    form.is_active ? "left-6" : "left-1"
                                )} />
                            </button>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                            <div>
                                <p className="font-medium text-slate-900 text-sm">Featured</p>
                                <p className="text-xs text-slate-500">Show on top</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, is_featured: !f.is_featured }))}
                                className={clsx(
                                    "w-12 h-7 rounded-full transition-colors relative",
                                    form.is_featured ? "bg-amber-500" : "bg-slate-300"
                                )}
                            >
                                <span className={clsx(
                                    "absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform",
                                    form.is_featured ? "left-6" : "left-1"
                                )} />
                            </button>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {template ? 'Update Template' : 'Create Template'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export const AdminTemplates: React.FC = () => {
    const [templates, setTemplates] = useState<AdminTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingTemplate, setEditingTemplate] = useState<AdminTemplate | null | 'new'>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [showAIGenerator, setShowAIGenerator] = useState(false);

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const data = await admin.getTemplates(true);
            setTemplates(data);
        } catch (e) {
            console.error('Failed to load templates:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (templateData: Partial<AdminTemplate>) => {
        setSaving(true);
        try {
            if (editingTemplate === 'new') {
                await admin.createTemplate(templateData);
            } else if (editingTemplate) {
                await admin.updateTemplate(editingTemplate.id, templateData);
            }
            await loadTemplates();
            setEditingTemplate(null);
        } catch (e: any) {
            alert(e.message || 'Failed to save template');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this template?')) return;
        setDeleting(id);
        try {
            await admin.deleteTemplate(id);
            await loadTemplates();
        } catch (e: any) {
            alert(e.message || 'Failed to delete template');
        } finally {
            setDeleting(null);
        }
    };

    const handleToggleActive = async (template: AdminTemplate) => {
        try {
            await admin.updateTemplate(template.id, { is_active: !template.is_active });
            await loadTemplates();
        } catch (e: any) {
            alert(e.message || 'Failed to update template');
        }
    };

    const handleToggleFeatured = async (template: AdminTemplate) => {
        try {
            await admin.updateTemplate(template.id, { is_featured: !template.is_featured });
            await loadTemplates();
        } catch (e: any) {
            alert(e.message || 'Failed to update template');
        }
    };

    const handleAIGenerate = async (templateData: Partial<AdminTemplate>) => {
        setSaving(true);
        try {
            await admin.createTemplate(templateData);
            await loadTemplates();
        } catch (e: any) {
            alert(e.message || 'Failed to create template');
        } finally {
            setSaving(false);
        }
    };

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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Template Gallery</h2>
                    <p className="text-slate-500 text-sm mt-1">Manage workflow templates shown to users</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowAIGenerator(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-brand-600 text-white rounded-xl text-sm font-medium hover:opacity-90 transition-all shadow-lg shadow-brand-600/20"
                    >
                        <Sparkles className="w-4 h-4" />
                        AI Generate
                    </button>
                    <button
                        onClick={() => setEditingTemplate('new')}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Template
                    </button>
                </div>
            </div>

            {/* Templates Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                </div>
            ) : templates.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <LayoutTemplate className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-800 mb-2">No templates yet</h3>
                    <p className="text-slate-500 text-sm mb-6">Create workflow templates for users to start from</p>
                    <button
                        onClick={() => setEditingTemplate('new')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create First Template
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.map((template) => (
                        <div
                            key={template.id}
                            className={clsx(
                                "bg-white rounded-2xl border p-6 hover:shadow-lg transition-all relative",
                                !template.is_active && "opacity-60",
                                template.is_featured && "ring-2 ring-amber-400"
                            )}
                        >
                            {template.is_featured && (
                                <div className="absolute -top-2 -right-2 bg-amber-400 text-white p-1.5 rounded-full">
                                    <Star className="w-3 h-3 fill-current" />
                                </div>
                            )}

                            <div className="flex items-start justify-between mb-4">
                                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${getCategoryColor(template.category)}`}>
                                    {template.category}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleToggleFeatured(template)}
                                        className={clsx(
                                            "p-2 rounded-lg transition-colors",
                                            template.is_featured
                                                ? "text-amber-500 hover:bg-amber-50"
                                                : "text-slate-400 hover:bg-slate-50"
                                        )}
                                        title="Toggle Featured"
                                    >
                                        <Star className={clsx("w-4 h-4", template.is_featured && "fill-current")} />
                                    </button>
                                    <button
                                        onClick={() => handleToggleActive(template)}
                                        className={clsx(
                                            "p-2 rounded-lg transition-colors",
                                            template.is_active
                                                ? "text-green-600 hover:bg-green-50"
                                                : "text-slate-400 hover:bg-slate-50"
                                        )}
                                        title={template.is_active ? 'Active' : 'Inactive'}
                                    >
                                        {template.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={() => setEditingTemplate(template)}
                                        className="p-2 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(template.id)}
                                        disabled={deleting === template.id}
                                        className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors disabled:opacity-50"
                                    >
                                        {deleting === template.id
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <Trash2 className="w-4 h-4" />
                                        }
                                    </button>
                                </div>
                            </div>

                            <h3 className="font-bold text-slate-900 text-lg mb-2">{template.name}</h3>
                            <p className="text-sm text-slate-500 mb-4 line-clamp-2">{template.description || 'No description'}</p>

                            <div className="flex items-center gap-4 text-xs text-slate-500">
                                <span className="flex items-center gap-1">
                                    <Zap className="w-3.5 h-3.5" />
                                    {template.nodes?.length || 0} nodes
                                </span>
                                <span className="flex items-center gap-1">
                                    <ArrowRight className="w-3.5 h-3.5" />
                                    {template.edges?.length || 0} connections
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )
            }

            {/* Editor Modal */}
            {editingTemplate && (
                <TemplateEditor
                    template={editingTemplate === 'new' ? null : editingTemplate}
                    onSave={handleSave}
                    onClose={() => setEditingTemplate(null)}
                    saving={saving}
                />
            )}

            {/* AI Generator Modal */}
            {showAIGenerator && (
                <AITemplateGenerator
                    onGenerate={handleAIGenerate}
                    onClose={() => setShowAIGenerator(false)}
                />
            )}
        </div>
    );
};

export default AdminTemplates;
