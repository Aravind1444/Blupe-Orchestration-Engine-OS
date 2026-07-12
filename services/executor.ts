import { Edge, Node } from 'reactflow';
import { NodeData, NodeStatus } from '../types';
import { supabase, getAuthHeaders } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

let activeFlowChannel: RealtimeChannel | null = null;
let activeFlowId: string | null = null;
const logCallbacks = new Set<(payload: any) => void>();

export function getOrCreateFlowChannel(flowId: string) {
    if (activeFlowId === flowId && activeFlowChannel) {
        return activeFlowChannel;
    }

    if (activeFlowChannel) {
        activeFlowChannel.unsubscribe();
    }

    activeFlowId = flowId;
    activeFlowChannel = supabase
        .channel(`flow_logs_${flowId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'execution_logs',
                filter: `flow_id=eq.${flowId}`
            },
            (payload: any) => {
                logCallbacks.forEach(cb => cb(payload));
            }
        );

    activeFlowChannel.subscribe();
    return activeFlowChannel;
}

export interface ExecutionLog {
    id: string;
    nodeId: string;
    nodeLabel: string;
    output?: any;
    status: NodeStatus;
    timestamp: number;
    duration: number;
    cost?: number;
}

// Strip visual node fields and secret values from canvas nodes before execution
function stripAndSanitizeNodes(nodes: Node<NodeData>[]): any[] {
    return nodes.map(node => {
        const { width, height, selected, position, dragging, ...stripped } = node;

        const data = { ...stripped.data };

        if (data.secrets) {
            delete data.secrets;
        }
        if (data.password) delete data.password;
        if (data.apiKey) delete data.apiKey;
        if (data.api_key) delete data.api_key;
        if (data.accessToken) delete data.accessToken;
        if (data.access_token) delete data.access_token;
        if (data.privateKey) delete data.privateKey;
        if (data.private_key) delete data.private_key;

        return {
            ...stripped,
            data
        };
    });
}

function stripEdges(edges: Edge[]): any[] {
    return edges.map(edge => {
        const { selected, ...stripped } = edge;
        return stripped;
    });
}

// Runner writes 'success' / 'error' / 'running' / 'paused'; canvas enum uses 'completed'
function normalizeLogStatus(status: string): NodeStatus {
    if (status === 'success') return NodeStatus.COMPLETED;
    if (status === 'failed') return NodeStatus.ERROR;
    if (status === 'paused') return NodeStatus.WAITING_APPROVAL;
    return status as NodeStatus;
}

function isTerminalStatus(status: NodeStatus): boolean {
    return (
        status === NodeStatus.COMPLETED ||
        status === NodeStatus.ERROR ||
        status === NodeStatus.SKIPPED ||
        status === NodeStatus.WAITING_APPROVAL
    );
}

/**
 * Fetch execution_logs for a run so we can paint node statuses even if
 * realtime dropped events or the HTTP body raced with __run_end__.
 */
async function fetchRunLogsFromDb(runId: string): Promise<any[]> {
    try {
        const { data, error } = await supabase
            .from('execution_logs')
            .select('id, node_id, node_type, status, output, error, duration_ms, credits_used, created_at, run_id')
            .eq('run_id', runId)
            .neq('node_id', '__run_end__')
            .order('created_at', { ascending: true });

        if (error) {
            console.warn('[Executor] Failed to fetch run logs for UI hydrate:', error.message);
            return [];
        }
        return data || [];
    } catch (e: any) {
        console.warn('[Executor] Failed to fetch run logs for UI hydrate:', e?.message || e);
        return [];
    }
}

async function fetchRunEndFromDb(runId: string): Promise<any | null> {
    try {
        const { data, error } = await supabase
            .from('execution_logs')
            .select('status, credits_used, run_id, node_id')
            .eq('run_id', runId)
            .eq('node_id', '__run_end__')
            .maybeSingle();
        if (error) return null;
        return data;
    } catch {
        return null;
    }
}

export const runWorkflow = async (
    nodes: Node<NodeData>[],
    edges: Edge[],
    updateNodeStatus: (nodeId: string, status: NodeStatus, output?: any, error?: string, extraData?: Record<string, any>) => void,
    addLog: (log: any) => void,
    secrets: Record<string, string>,
    initialContext: Record<string, any> = {},
    requestApproval?: (message: string, nodeId: string, dismissSignal?: Promise<void>) => Promise<boolean>,
    meta?: { flowId?: string; flowOwnerId?: string; runId?: string }
): Promise<{ creditsUsed: number }> => {

    const runId = meta?.runId || crypto.randomUUID();
    const flowId = meta?.flowId;

    // Reset status of all nodes to idle, then optimistically mark trigger
    // nodes (no incoming edges) as running for instant visual feedback while
    // the request travels to the runner.
    nodes.forEach(n => updateNodeStatus(n.id, NodeStatus.IDLE));
    const edgeTargets = new Set(edges.map(e => e.target));
    nodes.filter(n => !edgeTargets.has(n.id)).forEach(n => updateNodeStatus(n.id, NodeStatus.RUNNING));

    // Signals used to coordinate with runs resumed outside this browser
    // (HITL approve/reject links): any realtime event arriving while the
    // local approval popup is open means someone else resumed the flow, and
    // the '__run_end__' marker row tells us an externally-resumed run finished.
    let externalActivity: (() => void) | null = null;
    let runEndLog: any = null;
    let markRunEnded: (() => void) | null = null;
    const runEnded = new Promise<void>((resolve) => { markRunEnded = resolve; });

    // 1. Set up/retrieve cached Flow Realtime Listener.
    // latestByNode: most recent log row we applied per node (for ordering)
    // terminalNodes: nodes that already received a terminal status via realtime
    const latestByNode = new Map<string, any>();
    const terminalNodes = new Set<string>();

    const applyLogToUi = (log: any, opts?: { force?: boolean; fromRealtime?: boolean }) => {
        if (!log || !log.node_id || log.node_id === '__run_end__') return;
        if (log.run_id && log.run_id !== runId) return;

        const nodeId = log.node_id;
        const status = normalizeLogStatus(log.status);
        const force = opts?.force === true;

        // Ignore stale running events after a terminal status was applied
        if (!force && status === NodeStatus.RUNNING && terminalNodes.has(nodeId)) {
            return;
        }

        // Prefer later terminal over earlier running when hydrating
        const prev = latestByNode.get(nodeId);
        if (!force && prev && isTerminalStatus(normalizeLogStatus(prev.status)) && status === NodeStatus.RUNNING) {
            return;
        }

        latestByNode.set(nodeId, log);

        const label = nodes.find(n => n.id === nodeId)?.data?.label || nodeId;
        const extra = log.output?.agentState
            ? { agentState: log.output.agentState }
            : undefined;

        if (status === NodeStatus.RUNNING) {
            updateNodeStatus(nodeId, NodeStatus.RUNNING, log.output, undefined, extra);
            // Only add log lines when there is progressive payload (e.g. agent thoughts)
            if (log.output && opts?.fromRealtime) {
                addLog({
                    id: log.id || `${nodeId}-running-${Date.now()}`,
                    nodeId,
                    nodeLabel: label,
                    output: log.output,
                    status,
                    timestamp: Date.now(),
                    duration: log.duration_ms || 0,
                    cost: log.credits_used || 0
                });
            }
            return;
        }

        if (isTerminalStatus(status)) {
            terminalNodes.add(nodeId);
        }

        addLog({
            id: log.id || `${nodeId}-${status}-${Date.now()}`,
            nodeId,
            nodeLabel: label,
            output: log.output || log.error,
            status,
            timestamp: Date.now(),
            duration: log.duration_ms || 0,
            cost: log.credits_used || 0
        });
        updateNodeStatus(nodeId, status, log.output, log.error, extra);
    };

    /** Apply an array of logs (response body or DB) without clobbering fresher terminal UI state. */
    const hydrateFromLogs = (logs: any[], forceTerminal = false) => {
        if (!logs || logs.length === 0) return;

        // Collapse to latest row per node (array is ascending by created_at when from DB)
        const latest = new Map<string, any>();
        for (const log of logs) {
            if (!log?.node_id || log.node_id === '__run_end__') continue;
            latest.set(log.node_id, log);
        }

        for (const log of latest.values()) {
            const status = normalizeLogStatus(log.status);
            if (forceTerminal || !terminalNodes.has(log.node_id) || isTerminalStatus(status)) {
                applyLogToUi(log, { force: forceTerminal || isTerminalStatus(status) });
            }
        }
    };

    const onPayload = (payload: any) => {
        const newLog = payload.new;
        if (!newLog || !newLog.node_id || newLog.run_id !== runId) return;
        const nodeId = newLog.node_id;

        if (nodeId === '__run_end__') {
            runEndLog = newLog;
            markRunEnded?.();
            return;
        }

        externalActivity?.();
        applyLogToUi(newLog, { fromRealtime: true });
    };

    let fallbackChannel: RealtimeChannel | null = null;
    if (flowId) {
        getOrCreateFlowChannel(flowId);
        logCallbacks.add(onPayload);
    } else {
        fallbackChannel = supabase
            .channel(`run_logs_${runId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'execution_logs',
                    filter: `run_id=eq.${runId}`
                },
                onPayload
            );
        fallbackChannel.subscribe();
    }

    // Brief moment for the realtime channel to attach
    await new Promise<void>((resolve) => setTimeout(resolve, 80));

    // Polling is the reliable progress path (Realtime is best-effort / often delayed
    // by RLS or channel lag). Every ~350ms we re-read this run's logs and paint
    // running / success / error on the canvas as soon as the runner writes them.
    let pollActive = true;
    let lastPollFingerprint = '';
    const pollTick = async () => {
        if (!pollActive) return;
        try {
            const [logs, endRow] = await Promise.all([
                fetchRunLogsFromDb(runId),
                fetchRunEndFromDb(runId),
            ]);
            // Cheap change detection so we do not thrash React on identical rows
            const fingerprint = logs
                .map(l => `${l.node_id}:${l.status}:${l.duration_ms || 0}:${l.id || ''}`)
                .join('|');
            if (fingerprint !== lastPollFingerprint) {
                lastPollFingerprint = fingerprint;
                hydrateFromLogs(logs, false);
            }
            if (endRow && !runEndLog) {
                runEndLog = endRow;
                markRunEnded?.();
            }
        } catch (e) {
            // non-fatal
        }
    };
    const pollHandle = setInterval(() => { void pollTick(); }, 350);
    // Immediate first poll shortly after request fires
    const firstPollHandle = setTimeout(() => { void pollTick(); }, 200);

    try {
        const sanitizedNodes = stripAndSanitizeNodes(nodes);
        const sanitizedEdges = stripEdges(edges);

        const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
        if (flowId) {
            headers['x-flow-id'] = flowId;
        }

        const mode = 'production';

        const executePayload = {
            type: 'direct',
            flowId,
            nodes: sanitizedNodes,
            edges: sanitizedEdges,
            payload: initialContext,
            runId,
            mode
        };

        const cloudRunUrl = import.meta.env.VITE_CLOUD_RUN_WORKFLOW_RUNNER_URL;
        const executeUrl = cloudRunUrl
            ? `${cloudRunUrl.replace(/\/$/, '')}/execute`
            : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/execute-flow`;

        const executionRequest = fetch(executeUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(executePayload)
        });

        // Race HTTP completion vs run-end marker (realtime or poll).
        // Polling keeps painting node-level progress the whole time.
        const executionOutcome = await Promise.race([
            executionRequest.then(
                response => ({ type: 'response' as const, response }),
                error => ({ type: 'request-error' as const, error }),
            ),
            runEnded.then(() => ({ type: 'ended' as const })),
        ]);

        pollActive = false;
        clearInterval(pollHandle);
        clearTimeout(firstPollHandle);

        if (executionOutcome.type === 'request-error') {
            throw executionOutcome.error;
        }

        let result: any = null;

        if (executionOutcome.type === 'ended') {
            // Final hydrate from DB (force terminal statuses)
            const bodyOrNull = await Promise.race([
                executionRequest
                    .then(async (res) => {
                        if (!res.ok) return null;
                        try { return await res.json(); } catch { return null; }
                    })
                    .catch(() => null),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
            ]);
            result = bodyOrNull;

            if (result?.logs?.length) {
                hydrateFromLogs(result.logs, true);
            } else {
                const dbLogs = await fetchRunLogsFromDb(runId);
                hydrateFromLogs(dbLogs, true);
            }

            if (runEndLog?.status === 'failed' || result?.status === 'failed') {
                const lastErrorNode = result?.logs?.find((l: any) => l.status === 'error');
                throw new Error(lastErrorNode?.error || 'Workflow execution failed');
            }
            return { creditsUsed: runEndLog?.credits_used || result?.creditsUsed || 0 };
        }

        // HTTP response won the race
        const response = executionOutcome.response;

        if (!response.ok) {
            const errText = await response.text();
            const dbLogs = await fetchRunLogsFromDb(runId);
            hydrateFromLogs(dbLogs, true);
            throw new Error(`Execution request failed: ${response.statusText} - ${errText}`);
        }

        result = await response.json();

        // 5. Handle approval resumes if loop is paused
        while (result && result.status === 'paused' && result.resumeToken && requestApproval) {
            const pausedNodeId = result.logs?.[result.logs.length - 1]?.node_id || '';
            const message = result.output?.message || 'Approval Required';

            // Paint the paused node as waiting for approval
            if (pausedNodeId) {
                updateNodeStatus(pausedNodeId, NodeStatus.WAITING_APPROVAL, result.output);
                terminalNodes.add(pausedNodeId);
            }

            let dismissPopup: (() => void) | null = null;
            const dismissSignal = new Promise<void>((resolve) => { dismissPopup = resolve; });
            const resumedExternally = new Promise<boolean>((resolve) => {
                externalActivity = () => resolve(true);
            });

            const decision = await Promise.race([
                requestApproval(message, pausedNodeId, dismissSignal).then(a => ({ external: false, approved: a })),
                resumedExternally.then(() => ({ external: true, approved: false })),
            ]);
            externalActivity = null;

            if (decision.external) {
                dismissPopup?.();
                await Promise.race([
                    runEnded,
                    new Promise<void>((resolve) => setTimeout(resolve, 15 * 60 * 1000)),
                ]);
                const dbLogs = await fetchRunLogsFromDb(runId);
                hydrateFromLogs(dbLogs, true);
                if (runEndLog?.status === 'failed') {
                    throw new Error('Workflow execution failed');
                }
                return { creditsUsed: runEndLog?.credits_used || 0 };
            }

            const approved = decision.approved;

            const resumePayload = {
                type: 'resume',
                token: result.resumeToken,
                action: approved ? 'approve' : 'reject',
                mode
            };

            const resumeUrl = cloudRunUrl
                ? `${cloudRunUrl.replace(/\/$/, '')}/resume`
                : executeUrl;

            const resumeResponse = await fetch(resumeUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(resumePayload)
            });

            if (!resumeResponse.ok) {
                const errText = await resumeResponse.text();
                throw new Error(`Resume request failed: ${resumeResponse.statusText} - ${errText}`);
            }

            result = await resumeResponse.json();
        }

        // Final paint: response body first, then DB for anything still missing
        if (result && result.logs && result.logs.length > 0) {
            hydrateFromLogs(result.logs, true);
        } else {
            const dbLogs = await fetchRunLogsFromDb(runId);
            hydrateFromLogs(dbLogs, true);
        }

        if (result && result.status === 'failed') {
            const lastErrorNode = result.logs?.find((l: any) => l.status === 'error');
            throw new Error(lastErrorNode?.error || 'Workflow execution failed');
        }

        return { creditsUsed: result?.creditsUsed || 0 };

    } finally {
        pollActive = false;
        try { clearInterval(pollHandle); } catch { /* ignore */ }
        try { clearTimeout(firstPollHandle); } catch { /* ignore */ }
        if (flowId) {
            logCallbacks.delete(onPayload);
        }
        if (fallbackChannel) {
            fallbackChannel.unsubscribe();
        }
    }
};
