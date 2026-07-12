
import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle, PauseCircle, Clock, DollarSign, Terminal, Coins, X } from 'lucide-react'; // Added X import
import { RunRecord } from '../types';
import { storage } from '../services/supabase';

interface RunHistoryProps {
    flowId: string;
    onBack: () => void;
}

// Exportable Modal Component
export const LogDetailsModal = ({ isOpen, run, onClose }: { isOpen: boolean, run: RunRecord | null, onClose: () => void }) => {
    if (!isOpen || !run) return null;

    return (
        <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Execution Details</h2>
                        <p className="text-xs text-slate-500 font-mono">ID: {run.id}</p>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-900" /></button>
                </div>
                <div className="p-6 bg-white overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="text-[10px] uppercase font-bold text-slate-400">Status</div>
                            <div className={`text-sm font-bold ${run.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>{run.status.toUpperCase()}</div>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="text-[10px] uppercase font-bold text-slate-400">Cost</div>
                            <div className="text-sm font-bold text-slate-700">${(run.totalCost || 0).toFixed(5)}</div>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                            <div className="text-[10px] uppercase font-bold text-slate-400">Credits</div>
                            <div className="text-sm font-bold text-yellow-600">{run.creditsUsed || 10}</div>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {run.logs.map((log) => {
                            const stepConsoleLogs = log.consoleLogs || 
                                (log.output && typeof log.output === 'object' && (log.output as any).__consoleLogs);
                            
                            let cleanOutput = log.output;
                            if (cleanOutput && typeof cleanOutput === 'object') {
                                const { __consoleLogs, ...rest } = cleanOutput as any;
                                cleanOutput = Object.keys(rest).length === 1 && rest.result !== undefined ? rest.result : rest;
                            }

                            return (
                                <div key={log.id} className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                                        <span className="font-bold text-xs text-slate-700">{log.nodeLabel}</span>
                                        <span className="text-[10px] font-mono text-slate-400">{log.duration}ms</span>
                                    </div>
                                    <div className="p-3 bg-slate-900 overflow-x-auto">
                                        <pre className="text-[10px] font-mono text-slate-300">
                                            {typeof cleanOutput === 'object' ? JSON.stringify(cleanOutput, null, 2) : String(cleanOutput)}
                                        </pre>
                                    </div>
                                    {stepConsoleLogs && stepConsoleLogs.length > 0 && (
                                        <div className="bg-slate-950 p-3 border-t border-slate-800">
                                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-sans flex items-center gap-1"><Terminal className="w-3 h-3" /> Console Output</div>
                                            <pre className="text-[9px] font-mono text-emerald-400 whitespace-pre-wrap break-all leading-normal">
                                                {stepConsoleLogs.map((item: string, idx: number) => `[${idx + 1}] ${item}`).join('\n')}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const RunHistory: React.FC<RunHistoryProps> = ({ flowId, onBack }) => {
    // ... existing implementation
    const [runs, setRuns] = useState<RunRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);

    useEffect(() => {
        const load = async () => {
            const history = await storage.getRunHistory(flowId);
            setRuns(history);
            setLoading(false);
        };
        load();
    }, [flowId]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
            case 'stopped': return <PauseCircle className="w-4 h-4 text-orange-500" />;
            default: return <Clock className="w-4 h-4 text-slate-400" />;
        }
    };

    return (
        <div className="h-screen w-full bg-[#f8fafc] text-slate-900 font-sans flex overflow-hidden">
            {/* Sidebar List */}
            <div className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-10">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 text-xs font-bold uppercase tracking-wider mb-4">
                        <ArrowLeft className="w-3 h-3" /> Back to Editor
                    </button>
                    <h2 className="text-xl font-bold text-slate-900">Run History</h2>
                    <p className="text-xs text-slate-500 mt-1">{runs.length} runs recorded</p>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="p-8 text-center text-slate-400 text-xs">Loading history...</div>
                    ) : runs.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-xs">No runs found for this flow.</div>
                    ) : (
                        runs.map((run) => (
                            <button
                                key={run.id}
                                onClick={() => setSelectedRun(run)}
                                className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedRun?.id === run.id ? 'bg-brand-50 border-l-4 border-l-brand-500' : 'border-l-4 border-l-transparent'}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        {getStatusIcon(run.status)}
                                        <span className={`text-sm font-semibold ${run.status === 'success' ? 'text-emerald-700' : run.status === 'failed' ? 'text-red-700' : 'text-slate-700'}`}>
                                            {run.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                        {new Date(run.startTime).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <div className="text-xs text-slate-500">
                                        {new Date(run.startTime).toLocaleTimeString()}
                                    </div>
                                    <div className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">
                                        {run.duration}ms
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Details Panel - Refactored to use same design language as Modal but inline */}
            <div className="flex-1 bg-slate-50 p-8 overflow-y-auto custom-scrollbar">
                {selectedRun ? (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 mb-1">Execution Details</h2>
                                <p className="text-sm text-slate-500 font-mono">ID: {selectedRun.id}</p>
                            </div>
                            <div className="flex items-center gap-8">
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Credits Used</div>
                                    <div className="text-xl font-mono font-bold text-yellow-500 flex items-center justify-end gap-1">
                                        <Coins className="w-4 h-4" />
                                        {(selectedRun as any).creditsUsed || 10}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Est. Cost</div>
                                    <div className="text-xl font-mono font-bold text-emerald-600 flex items-center justify-end">
                                        <DollarSign className="w-4 h-4" />
                                        {(selectedRun.totalCost || 0).toFixed(5)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Trigger</div>
                                    <div className="text-sm font-semibold text-slate-700">{selectedRun.triggeredBy || 'Manual'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                                <Terminal className="w-4 h-4 text-slate-400" />
                                <h3 className="text-sm font-bold text-slate-700">Step-by-Step Logs</h3>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {selectedRun.logs.map((log) => {
                                    const stepConsoleLogs = log.consoleLogs || 
                                        (log.output && typeof log.output === 'object' && (log.output as any).__consoleLogs);
                                    
                                    let cleanOutput = log.output;
                                    if (cleanOutput && typeof cleanOutput === 'object') {
                                        const { __consoleLogs, ...rest } = cleanOutput as any;
                                        cleanOutput = Object.keys(rest).length === 1 && rest.result !== undefined ? rest.result : rest;
                                    }

                                    return (
                                        <div key={log.id} className="p-4 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-3">
                                                    <div className={`text-xs font-bold px-2 py-0.5 rounded ${log.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : log.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                                                        {log.nodeLabel}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 font-mono">Node: {log.nodeId}</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px] text-slate-400 font-mono">
                                                    {log.cost && <span className="text-emerald-600 font-bold">${(log.cost || 0).toFixed(5)}</span>}
                                                    <span>{log.duration}ms</span>
                                                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                </div>
                                            </div>
                                            <div className="bg-slate-900 rounded p-3 overflow-x-auto">
                                                <pre className="text-[10px] font-mono text-slate-300 leading-relaxed">
                                                    {typeof cleanOutput === 'object' ? JSON.stringify(cleanOutput, null, 2) : String(cleanOutput)}
                                                </pre>
                                            </div>
                                            {stepConsoleLogs && stepConsoleLogs.length > 0 && (
                                                <div className="mt-2 bg-slate-950 rounded p-3 border border-slate-800">
                                                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-sans flex items-center gap-1"><Terminal className="w-3 h-3" /> Console Output</div>
                                                    <pre className="text-[9px] font-mono text-emerald-400 whitespace-pre-wrap break-all leading-normal">
                                                        {stepConsoleLogs.map((item: string, idx: number) => `[${idx + 1}] ${item}`).join('\n')}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <Terminal className="w-16 h-16 mb-4 opacity-20" />
                        <p>Select a run to view details</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RunHistory;
