import React, { useEffect, useMemo, useState } from 'react';
import {
    Plus,
    Box,
    Pencil,
    Trash2,
    X,
    ToggleLeft,
    ToggleRight,
    Loader2,
    Save,
    Code2,
    Zap,
    Brain,
    GitFork,
    Globe,
    Mail,
    Sparkles,
    Wand2
} from 'lucide-react';
import { admin, getAuthHeaders } from '../services/supabase';
import { AdminNode, NodeCategory } from '../types';

import clsx from 'clsx';
import { isBuiltInNodeType } from '../services/nodeContract';

const ICON_OPTIONS = [
    'Box', 'Zap', 'Brain', 'GitFork', 'Globe', 'Mail', 'Code2',
    'Database', 'Server', 'Cloud', 'Terminal', 'Cpu', 'Layers'
];

const CATEGORY_OPTIONS: NodeCategory[] = ['Triggers', 'AI', 'Logic', 'Integrations', 'Data', 'IO', 'Custom'];

const EXECUTION_TYPES = [
    { value: 'api_call', label: 'API Call', description: 'Execute an HTTP request' },
    { value: 'javascript', label: 'JavaScript', description: 'Run custom JS code' },
    { value: 'llm_prompt', label: 'LLM Prompt', description: 'Execute an AI prompt' },
    { value: 'plugin_js', label: 'Plugin JS', description: 'Run server-side custom logic in the Cloud Run sandbox' },
];

const PLUGIN_CAPABILITIES = ['fetch', 'llm', 'json', 'crypto', 'log', 'sarvam'];

const safeParseJson = (value: string, label: string) => {
    try {
        return { value: JSON.parse(value), error: null as string | null };
    } catch {
        return { value: null, error: `Invalid JSON in ${label}` };
    }
};

const validateNodeDefinition = (
    form: {
        node_type: string;
        execution_type: string;
        credit_cost: number;
        config_schema: string;
        default_config: string;
        execution_config: string;
        pluginCode: string;
        pluginTimeoutMs: number;
        pluginCapabilities: string[];
    },
    existingNodes: AdminNode[],
    currentNodeId?: string,
) => {
    const errors: string[] = [];
    const configSchema = safeParseJson(form.config_schema, 'Config Schema');
    const defaultConfig = safeParseJson(form.default_config, 'Default Config');
    const executionConfig = safeParseJson(form.execution_config, 'Execution Config');

    if (configSchema.error) errors.push(configSchema.error);
    if (defaultConfig.error) errors.push(defaultConfig.error);
    if (executionConfig.error) errors.push(executionConfig.error);

    if (!form.node_type.trim()) {
        errors.push('Node type is required.');
    }
    if (isBuiltInNodeType(form.node_type.trim())) {
        errors.push('Node type collides with an existing built-in node.');
    }
    const duplicate = existingNodes.find(existing =>
        existing.node_type === form.node_type.trim() && existing.id !== currentNodeId
    );
    if (duplicate) {
        errors.push(`Node type "${form.node_type}" already exists.`);
    }
    if (form.credit_cost < 0) {
        errors.push('Credit cost must be zero or greater.');
    }

    if (configSchema.value && defaultConfig.value) {
        const schemaKeys = new Set(Object.keys(configSchema.value));
        const invalidDefaults = Object.keys(defaultConfig.value).filter(key => !schemaKeys.has(key));
        if (invalidDefaults.length > 0) {
            errors.push(`Default Config keys must exist in Config Schema: ${invalidDefaults.join(', ')}`);
        }
    }

    if (form.execution_type === 'plugin_js') {
        if (!form.pluginCode.trim()) {
            errors.push('Plugin JS nodes require sandbox code.');
        }
        if (form.pluginTimeoutMs < 100 || form.pluginTimeoutMs > 30000) {
            errors.push('Plugin timeout must be between 100ms and 30000ms.');
        }
        const invalidCapabilities = form.pluginCapabilities.filter(capability => !PLUGIN_CAPABILITIES.includes(capability));
        if (invalidCapabilities.length > 0) {
            errors.push(`Unknown plugin capabilities: ${invalidCapabilities.join(', ')}`);
        }
    }

    return {
        errors,
        parsedConfigSchema: configSchema.value || {},
        parsedDefaultConfig: defaultConfig.value || {},
        parsedExecutionConfig: executionConfig.value || {},
    };
};

// AI Node Generator Modal
const AINodeGenerator: React.FC<{
    onGenerate: (nodeData: Partial<AdminNode>) => void;
    onClose: () => void;
}> = ({ onGenerate, onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [generatedNode, setGeneratedNode] = useState<Partial<AdminNode> | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            setError('Please describe the node you want to create');
            return;
        }

        setLoading(true);
        setError('');
        setGeneratedNode(null);

        try {
            const nodeHeaders = await getAuthHeaders({ 'Content-Type': 'application/json' });

            const response = await fetch('/api/llm', {
                method: 'POST',
                headers: nodeHeaders,
                body: JSON.stringify({
                    provider: 'gemini',
                    model: 'gemini-3.1-pro-preview',
                    prompt: `You are an expert workflow automation architect. Create a COMPREHENSIVE node definition for: "${prompt}"

CRITICAL REQUIREMENTS:
- The config_schema MUST contain AT LEAST 8-15 fields that users will configure
- Every field needs type, label, and for select fields, an options array
- DO NOT just put label and variableName - that is UNACCEPTABLE
- Think about EVERY parameter a user would need to configure this integration

MANDATORY FIELDS FOR INTEGRATION NODES:
1. Authentication: apiKey, accessToken, clientId, clientSecret (mark with "secret": true)
2. Connection: baseUrl, instanceUrl, environment (select: sandbox/production)
3. Operation: operation (select with 5-10 specific actions like "Create Contact", "Update Deal", "Search Leads")
4. Object/Entity: objectType (select with all relevant objects)
5. Identifiers: recordId, externalId, lookupField
6. Data: fields (textarea for JSON mapping), properties (textarea)
7. Query: filters, query, searchTerm, whereClause
8. Pagination: pageSize (number), offset, cursor
9. Options: includeDeleted (boolean), fetchAll (boolean)
10. Output: variableName

EXAMPLE for a Stripe node (FOLLOW THIS LEVEL OF DETAIL):
{
  "node_type": "stripe",
  "display_name": "Stripe Payments",
  "description": "Process payments, manage subscriptions, and handle invoices with Stripe",
  "category": "Integrations",
  "icon_name": "Zap",
  "color": "#635BFF",
  "execution_type": "api_call",
  "config_schema": {
    "apiKey": {"type": "text", "label": "Stripe Secret Key", "secret": true},
    "operation": {"type": "select", "label": "Operation", "options": ["Create Charge", "Create Customer", "Create Subscription", "Get Customer", "List Invoices", "Create Payment Intent", "Refund Payment", "Cancel Subscription"]},
    "customerId": {"type": "text", "label": "Customer ID"},
    "amount": {"type": "number", "label": "Amount (cents)"},
    "currency": {"type": "select", "label": "Currency", "options": ["usd", "eur", "gbp", "inr", "aud", "cad"]},
    "paymentMethodId": {"type": "text", "label": "Payment Method ID"},
    "subscriptionId": {"type": "text", "label": "Subscription ID"},
    "priceId": {"type": "text", "label": "Price/Plan ID"},
    "metadata": {"type": "textarea", "label": "Metadata (JSON)"},
    "description": {"type": "text", "label": "Payment Description"},
    "email": {"type": "text", "label": "Customer Email"},
    "limit": {"type": "number", "label": "Results Limit"},
    "variableName": {"type": "text", "label": "Output Variable Name"}
  },
  "default_config": {
    "operation": "Create Charge",
    "currency": "usd",
    "limit": 100
  },
  "execution_config": {
    "baseEndpoint": "https://api.stripe.com/v1",
    "authType": "bearer"
  }
}

NOW GENERATE A SIMILAR COMPREHENSIVE NODE FOR: "${prompt}"
Return ONLY valid JSON. The config_schema MUST have 10+ relevant fields.`,
                    temperature: 0.3,
                    maxTokens: 4000
                })
            });

            if (!response.ok) throw new Error('Failed to generate node');

            const data = await response.json();
            let jsonStr = data.text.trim();
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
            }
            const nodeData = JSON.parse(jsonStr);
            setGeneratedNode(nodeData);
        } catch (err: any) {
            setError(err.message || 'Failed to generate node');
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
                        <h3 className="text-lg font-bold text-slate-900">AI Node Generator</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Describe the node you want to create</label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g., A node that connects to Airtable and fetches records from a specified table"
                            rows={4}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-brand-500 resize-none"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {['Discord webhook sender', 'Stripe payment checker', 'Notion page creator'].map(s => (
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

                    {generatedNode && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <div
                                    className="p-3 rounded-xl"
                                    style={{ backgroundColor: `${generatedNode.color}20`, color: generatedNode.color }}
                                >
                                    <Box className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-bold text-slate-900">{generatedNode.display_name}</p>
                                    <p className="text-xs text-slate-500">{generatedNode.node_type}</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600">{generatedNode.description}</p>
                            <div className="flex gap-2 flex-wrap">
                                <span className="px-2 py-1 bg-white border border-slate-200 rounded text-xs">{generatedNode.category}</span>
                                <span className="px-2 py-1 bg-white border border-slate-200 rounded text-xs">{generatedNode.execution_type}</span>
                            </div>
                            {generatedNode.config_schema && Object.keys(generatedNode.config_schema).length > 0 && (
                                <div className="text-xs text-slate-500">
                                    Config fields: {Object.keys(generatedNode.config_schema).join(', ')}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        Cancel
                    </button>
                    {generatedNode ? (
                        <button
                            onClick={() => { onGenerate(generatedNode); onClose(); }}
                            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            Create Node
                        </button>
                    ) : (
                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                            {loading ? 'Generating...' : 'Generate Node'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

interface NodeEditorProps {
    node: AdminNode | null;
    existingNodes: AdminNode[];
    onSave: (node: Partial<AdminNode>) => void;
    onClose: () => void;
    saving: boolean;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ node, existingNodes, onSave, onClose, saving }) => {
    const initialPluginExecutionConfig = (node?.execution_type === 'plugin_js' ? node.execution_config : {}) || {};
    const [form, setForm] = useState({
        node_type: node?.node_type || '',
        display_name: node?.display_name || '',
        description: node?.description || '',
        category: node?.category || 'Custom',
        icon_name: node?.icon_name || 'Box',
        color: node?.color || '#6366f1',
        execution_type: node?.execution_type || 'api_call',
        credit_cost: node?.credit_cost ?? 1,
        is_active: node?.is_active ?? true,
        config_schema: JSON.stringify(node?.config_schema || {}, null, 2),
        default_config: JSON.stringify(node?.default_config || {}, null, 2),
        execution_config: JSON.stringify(node?.execution_config || {}, null, 2),
        pluginCode: String(initialPluginExecutionConfig.code || initialPluginExecutionConfig.script || ''),
        pluginTimeoutMs: Number(initialPluginExecutionConfig.timeoutMs || 5000),
        pluginCapabilities: Array.isArray(initialPluginExecutionConfig.capabilities) ? initialPluginExecutionConfig.capabilities : [],
    });

    const validation = useMemo(() => {
        return validateNodeDefinition(form, existingNodes, node?.id);
    }, [existingNodes, form, node?.id]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validation.errors.length > 0) {
            return;
        }

        const executionConfig = form.execution_type === 'plugin_js'
            ? {
                ...validation.parsedExecutionConfig,
                code: form.pluginCode,
                timeoutMs: form.pluginTimeoutMs,
                capabilities: form.pluginCapabilities,
            }
            : validation.parsedExecutionConfig;

        onSave({
            ...form,
            config_schema: validation.parsedConfigSchema,
            default_config: validation.parsedDefaultConfig,
            execution_config: executionConfig,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900">
                        {node ? 'Edit Node' : 'Create New Node'}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Node Type (ID)</label>
                            <input
                                type="text"
                                value={form.node_type}
                                onChange={(e) => setForm(f => ({ ...f, node_type: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                                placeholder="e.g., custom_webhook"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                                required
                                disabled={!!node}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Display Name</label>
                            <input
                                type="text"
                                value={form.display_name}
                                onChange={(e) => setForm(f => ({ ...f, display_name: e.target.value }))}
                                placeholder="e.g., Custom Webhook"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="What does this node do?"
                            rows={2}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 resize-none"
                        />
                    </div>

                    {/* Appearance */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
                            <select
                                value={form.category}
                                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 bg-white"
                            >
                                {CATEGORY_OPTIONS.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Icon</label>
                            <select
                                value={form.icon_name}
                                onChange={(e) => setForm(f => ({ ...f, icon_name: e.target.value }))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 bg-white"
                            >
                                {ICON_OPTIONS.map(icon => (
                                    <option key={icon} value={icon}>{icon}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Color</label>
                            <input
                                type="color"
                                value={form.color}
                                onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                                className="w-full h-10 border border-slate-200 rounded-lg cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Execution Type */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Execution Type</label>
                        <div className="grid grid-cols-2 gap-3">
                            {EXECUTION_TYPES.map(type => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, execution_type: type.value as any }))}
                                    className={clsx(
                                        "p-3 rounded-xl border text-left transition-all",
                                        form.execution_type === type.value
                                            ? "border-brand-500 bg-brand-50"
                                            : "border-slate-200 hover:border-slate-300"
                                    )}
                                >
                                    <p className="font-medium text-sm text-slate-900">{type.label}</p>
                                    <p className="text-xs text-slate-500">{type.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Credit Cost */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Credit Cost
                            <span className="ml-2 text-xs text-slate-400 font-normal">Credits deducted when node executes</span>
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={form.credit_cost}
                                onChange={e => setForm(f => ({ ...f, credit_cost: parseInt(e.target.value) || 0 }))}
                                className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                            />
                            <span className="text-xs text-slate-500">credits per execution</span>
                        </div>
                    </div>

                    {/* Config Schema - Enhanced */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-sm font-medium text-slate-700">Config Schema (Property Panel Fields)</label>
                            <span className="text-xs text-slate-400">JSON format</span>
                        </div>
                        <textarea
                            value={form.config_schema}
                            onChange={(e) => setForm(f => ({ ...f, config_schema: e.target.value }))}
                            rows={6}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-brand-500 resize-none bg-slate-50"
                            placeholder='{"fieldName": {"type": "text", "label": "Field Label"}}'
                        />
                        <p className="text-xs text-slate-400 mt-1">
                            Types: text, textarea, number, select (with options array), boolean
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Default Config (JSON)</label>
                        <textarea
                            value={form.default_config}
                            onChange={(e) => setForm(f => ({ ...f, default_config: e.target.value }))}
                            rows={3}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-brand-500 resize-none bg-slate-50"
                            placeholder='{}'
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Execution Config (JSON)</label>
                        <textarea
                            value={form.execution_config}
                            onChange={(e) => setForm(f => ({ ...f, execution_config: e.target.value }))}
                            rows={4}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-brand-500 resize-none bg-slate-50"
                            placeholder='{ "endpoint": "", "method": "POST" }'
                        />
                    </div>

                    {form.execution_type === 'plugin_js' && (
                        <div className="space-y-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Plugin Code</label>
                                <textarea
                                    value={form.pluginCode}
                                    onChange={(e) => setForm(f => ({ ...f, pluginCode: e.target.value }))}
                                    rows={10}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-brand-500 resize-y bg-white"
                                    placeholder={'return {\n  ok: true,\n  input: context,\n};'}
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Runs server-side only. Available inputs: <code>context</code>, <code>config</code>, <code>secrets</code>, <code>helpers</code>.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Timeout (ms)</label>
                                    <input
                                        type="number"
                                        min="100"
                                        max="30000"
                                        value={form.pluginTimeoutMs}
                                        onChange={(e) => setForm(f => ({ ...f, pluginTimeoutMs: parseInt(e.target.value, 10) || 5000 }))}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Capabilities</label>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        {PLUGIN_CAPABILITIES.map(capability => (
                                            <label key={capability} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg">
                                                <input
                                                    type="checkbox"
                                                    checked={form.pluginCapabilities.includes(capability)}
                                                    onChange={(e) => setForm(f => ({
                                                        ...f,
                                                        pluginCapabilities: e.target.checked
                                                            ? [...f.pluginCapabilities, capability]
                                                            : f.pluginCapabilities.filter(value => value !== capability),
                                                    }))}
                                                />
                                                <span>{capability}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {validation.errors.length > 0 && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-1">
                            {validation.errors.map(error => (
                                <p key={error} className="text-sm text-red-700">{error}</p>
                            ))}
                        </div>
                    )}

                    {/* Active Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                            <p className="font-medium text-slate-900">Active</p>
                            <p className="text-sm text-slate-500">Node is visible to users when active</p>
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
                            {node ? 'Update Node' : 'Create Node'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export const AdminNodes: React.FC = () => {
    const [nodes, setNodes] = useState<AdminNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingNode, setEditingNode] = useState<AdminNode | null | 'new'>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [showAIGenerator, setShowAIGenerator] = useState(false);

    useEffect(() => {
        loadNodes();
    }, []);

    const loadNodes = async () => {
        setLoading(true);
        try {
            const data = await admin.getNodes(false);
            setNodes(data);
        } catch (e) {
            console.error('Failed to load nodes:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (nodeData: Partial<AdminNode>) => {
        setSaving(true);
        try {
            if (editingNode === 'new') {
                await admin.createNode(nodeData);
            } else if (editingNode) {
                await admin.updateNode(editingNode.id, nodeData);
            }
            await loadNodes();
            setEditingNode(null);
        } catch (e: any) {
            alert(e.message || 'Failed to save node');
        } finally {
            setSaving(false);
        }
    };

    const handleAIGenerate = async (nodeData: Partial<AdminNode>) => {
        setSaving(true);
        try {
            await admin.createNode({ ...nodeData, is_active: true });
            await loadNodes();
        } catch (e: any) {
            alert(e.message || 'Failed to create node');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this node?')) return;
        setDeleting(id);
        try {
            await admin.deleteNode(id);
            await loadNodes();
        } catch (e: any) {
            alert(e.message || 'Failed to delete node');
        } finally {
            setDeleting(null);
        }
    };

    const handleToggleActive = async (node: AdminNode) => {
        try {
            await admin.updateNode(node.id, { is_active: !node.is_active });
            await loadNodes();
        } catch (e: any) {
            alert(e.message || 'Failed to update node');
        }
    };

    const getIconComponent = (iconName: string) => {
        switch (iconName) {
            case 'Zap': return <Zap className="w-5 h-5" />;
            case 'Brain': return <Brain className="w-5 h-5" />;
            case 'GitFork': return <GitFork className="w-5 h-5" />;
            case 'Globe': return <Globe className="w-5 h-5" />;
            case 'Mail': return <Mail className="w-5 h-5" />;
            case 'Code2': return <Code2 className="w-5 h-5" />;
            default: return <Box className="w-5 h-5" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Node Definitions</h2>
                    <p className="text-slate-500 text-sm mt-1">Manage dynamic node types available to users</p>
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
                        onClick={() => setEditingNode('new')}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Node
                    </button>
                </div>
            </div>

            {/* Nodes Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                </div>
            ) : nodes.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <Box className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-800 mb-2">No custom nodes yet</h3>
                    <p className="text-slate-500 text-sm mb-6">Create dynamic nodes that users can add to their workflows</p>
                    <div className="flex justify-center gap-3">
                        <button
                            onClick={() => setShowAIGenerator(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-brand-600 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all"
                        >
                            <Sparkles className="w-4 h-4" />
                            Generate with AI
                        </button>
                        <button
                            onClick={() => setEditingNode('new')}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Create Manually
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {nodes.map((node) => (
                        <div
                            key={node.id}
                            className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-all"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div
                                    className="p-3 rounded-xl"
                                    style={{ backgroundColor: `${node.color}15`, color: node.color }}
                                >
                                    {getIconComponent(node.icon_name)}
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleToggleActive(node)}
                                        className={clsx(
                                            "p-2 rounded-lg transition-colors",
                                            node.is_active
                                                ? "text-green-600 hover:bg-green-50"
                                                : "text-slate-400 hover:bg-slate-50"
                                        )}
                                        title={node.is_active ? 'Active' : 'Inactive'}
                                    >
                                        {node.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={() => setEditingNode(node)}
                                        className="p-2 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(node.id)}
                                        disabled={deleting === node.id}
                                        className="p-2 hover:bg-red-50 rounded-lg text-red-500 transition-colors disabled:opacity-50"
                                    >
                                        {deleting === node.id
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <Trash2 className="w-4 h-4" />
                                        }
                                    </button>
                                </div>
                            </div>

                            <h3 className="font-bold text-slate-900 mb-1">{node.display_name}</h3>
                            <p className="text-sm text-slate-500 mb-4 line-clamp-2">{node.description || 'No description'}</p>

                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-1 bg-slate-100 rounded text-xs font-mono text-slate-600">{node.node_type}</span>
                                <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-600">{node.category}</span>
                                <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500">{node.execution_type}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Editor Modal */}
            {editingNode && (
                <NodeEditor
                    node={editingNode === 'new' ? null : editingNode}
                    existingNodes={nodes}
                    onSave={handleSave}
                    onClose={() => setEditingNode(null)}
                    saving={saving}
                />
            )}

            {/* AI Generator Modal */}
            {showAIGenerator && (
                <AINodeGenerator
                    onGenerate={handleAIGenerate}
                    onClose={() => setShowAIGenerator(false)}
                />
            )}
        </div>
    );
};

export default AdminNodes;
