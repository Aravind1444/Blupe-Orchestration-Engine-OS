import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Radio, Shield, Zap, RefreshCw, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

interface WebhookSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    flowId: string;
    flowName: string;
    settings: {
        webhook_enabled?: boolean;
        webhook_api_key?: string;
        webhook_response_mode?: 'async' | 'sync';
    };
    onSave: (settings: {
        webhook_enabled: boolean;
        webhook_api_key?: string;
        webhook_response_mode: 'async' | 'sync';
    }) => void;
}

export const WebhookSettingsModal: React.FC<WebhookSettingsProps> = ({
    isOpen,
    onClose,
    flowId,
    flowName,
    settings,
    onSave,
}) => {
    const [enabled, setEnabled] = useState(settings.webhook_enabled || false);
    const [apiKey, setApiKey] = useState(settings.webhook_api_key || '');
    const [responseMode, setResponseMode] = useState<'async' | 'sync'>(settings.webhook_response_mode || 'async');
    const [copied, setCopied] = useState<'url' | 'curl' | 'key' | null>(null);

    useEffect(() => {
        setEnabled(settings.webhook_enabled || false);
        setApiKey(settings.webhook_api_key || '');
        setResponseMode(settings.webhook_response_mode || 'async');
    }, [settings]);

    if (!isOpen) return null;

    const siteUrl = window.location.origin;
    const webhookUrl = `${siteUrl}/api/webhook/${flowId}`;

    const generateApiKey = () => {
        const key = crypto.randomUUID().replace(/-/g, '');
        setApiKey(key);
    };

    const copyToClipboard = (text: string, type: 'url' | 'curl' | 'key') => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
    };

    const handleSave = () => {
        onSave({
            webhook_enabled: enabled,
            webhook_api_key: apiKey || undefined,
            webhook_response_mode: responseMode,
        });
        onClose();
    };

    const curlExample = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\${apiKey ? `\n  -H "X-API-Key: ${apiKey}" \\` : ''}
  -d '{"name": "John", "email": "john@example.com"}'`;

    return (
        <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-lg">
                            <Radio className="w-5 h-5 text-orange-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Webhook Settings</h2>
                            <p className="text-xs text-slate-500">{flowName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-5 overflow-y-auto max-h-[60vh] custom-scrollbar">
                    {/* Enable Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-3">
                            <Zap className={clsx("w-5 h-5", enabled ? "text-orange-500" : "text-slate-400")} />
                            <div>
                                <p className="font-semibold text-slate-900">Enable Webhook</p>
                                <p className="text-xs text-slate-500">Allow external HTTP requests to trigger this flow</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setEnabled(!enabled)}
                            className={clsx(
                                "w-12 h-6 rounded-full transition-colors relative",
                                enabled ? "bg-orange-500" : "bg-slate-300"
                            )}
                        >
                            <div className={clsx(
                                "w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm",
                                enabled ? "translate-x-6" : "translate-x-0.5"
                            )} />
                        </button>
                    </div>

                    {enabled && (
                        <>
                            {/* Webhook URL */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Webhook URL</label>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-slate-100 px-3 py-2.5 rounded-lg text-sm font-mono text-slate-700 break-all border border-slate-200">
                                        {webhookUrl}
                                    </code>
                                    <button
                                        onClick={() => copyToClipboard(webhookUrl, 'url')}
                                        className={clsx(
                                            "p-2.5 rounded-lg transition-colors",
                                            copied === 'url' ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                        )}
                                    >
                                        {copied === 'url' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* API Key */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                                        <Shield className="w-3.5 h-3.5" /> API Key (Optional)
                                    </label>
                                    <button
                                        onClick={generateApiKey}
                                        className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
                                    >
                                        <RefreshCw className="w-3 h-3" /> Generate New
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder="Leave empty for no authentication"
                                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                                    />
                                    {apiKey && (
                                        <button
                                            onClick={() => copyToClipboard(apiKey, 'key')}
                                            className={clsx(
                                                "p-2.5 rounded-lg transition-colors",
                                                copied === 'key' ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                            )}
                                        >
                                            {copied === 'key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400">If set, requests must include <code className="bg-slate-100 px-1 rounded">X-API-Key</code> header</p>
                            </div>

                            {/* Response Mode */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Response Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setResponseMode('async')}
                                        className={clsx(
                                            "p-3 rounded-xl border-2 text-left transition-all",
                                            responseMode === 'async'
                                                ? "border-orange-500 bg-orange-50"
                                                : "border-slate-200 hover:border-slate-300"
                                        )}
                                    >
                                        <p className="font-semibold text-sm text-slate-900">Async</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Return immediately, process in background</p>
                                    </button>
                                    <button
                                        onClick={() => setResponseMode('sync')}
                                        className={clsx(
                                            "p-3 rounded-xl border-2 text-left transition-all",
                                            responseMode === 'sync'
                                                ? "border-orange-500 bg-orange-50"
                                                : "border-slate-200 hover:border-slate-300"
                                        )}
                                    >
                                        <p className="font-semibold text-sm text-slate-900">Sync</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Wait for flow completion (slower)</p>
                                    </button>
                                </div>
                            </div>

                            {/* Curl Example */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Example Request</label>
                                <div className="relative">
                                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto custom-scrollbar">
                                        {curlExample}
                                    </pre>
                                    <button
                                        onClick={() => copyToClipboard(curlExample, 'curl')}
                                        className={clsx(
                                            "absolute top-2 right-2 p-1.5 rounded-md transition-colors",
                                            copied === 'curl' ? "bg-emerald-600 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                        )}
                                    >
                                        {copied === 'curl' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            </div>

                            {/* Rate Limit Info */}
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                                <ExternalLink className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-amber-800">
                                    <strong>Rate Limit:</strong> 100 requests per hour per IP address.
                                    Payload data is available as <code className="bg-amber-100 px-1 rounded">_webhook</code> context.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors shadow-sm"
                    >
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
};
