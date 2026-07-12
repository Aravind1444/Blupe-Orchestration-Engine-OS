import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import ReactFlow, {
    addEdge,
    useNodesState,
    useEdgesState,
    Connection,
    Edge,
    Node,
    Background,
    Controls,
    MiniMap,
    useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import './index.css';
import {
    Play, Save, Plus, Settings, Download, Upload, Trash2,
    Menu, X, Zap, Loader2,
    LayoutGrid, Share2, Lock, History, GitBranch, Camera,
    LayoutTemplate, Undo, Redo, MoreHorizontal, BookOpen, Coins, Copy, Sparkles, Radio, Sun, Moon, Globe, TrendingUp, Home
} from 'lucide-react';
import clsx from 'clsx';

import { Sidebar } from './components/Sidebar';
import PropertyPanel from './components/PropertyPanel';
import { nodeTypes } from './components/CustomNodes';
import CustomEdge from './components/CustomEdge';
import LandingPage from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { AuthModal } from './components/AuthModal';
import { SecretsModal } from './components/SecretsModal';
import { Dialog } from './components/Dialog';
import PublicFlowRunner from './components/PublicFlowRunner';
import PublishedFlowViewer from './components/PublishedFlowViewer';
import { SettingsPage } from './components/SettingsPage';
import { DocsPage } from './components/DocsPage';
import { SecurityPage } from './components/SecurityPage';
import { LegalPage } from './components/LegalPage';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { TermsOfServicePage } from './components/TermsOfServicePage';
import { RefundPolicyPage } from './components/RefundPolicyPage';
import RunHistory from './components/RunHistory';
import { AIFlowGenerator } from './components/AIFlowGenerator';
import { WebhookSettingsModal } from './components/WebhookSettings';
import { PublishTemplateModal } from './components/PublishTemplateModal';
import { TemplatesPage } from './components/TemplatesPage';
import { EmbeddableForm } from './components/EmbeddableForm';
import FeaturesPage from './components/FeaturesPage';

// Admin Console Components
import { AdminLayout } from './admin/AdminLayout';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminUsers } from './admin/AdminUsers';
import { AdminNodes } from './admin/AdminNodes';
import { AdminTemplates } from './admin/AdminTemplates';

import { storage, auth, supabase, upsertFlowSchedule, deleteFlowSchedule } from './services/supabase';
import { dataStore } from './services/dataStore';
import { runWorkflow, getOrCreateFlowChannel } from './services/executor';
import { templates as staticTemplates, getTemplates, Template } from './services/templates';
import { BillingService } from './services/billing';
import { SavedFlow, NodeData, NodeType, NodeStatus, ExecutionLog, Secret, PageView, UserProfile, AdminPageView, AdminNode } from './types';
import {
    buildNodeLabel,
    createCustomNodeSnapshot,
    CUSTOM_NODE_DRAG_MIME,
    getEffectiveNodeType,
    isBuiltInNodeType,
    normalizeFlowNodes,
} from './services/nodeContract';

const edgeTypes = {
    custom: CustomEdge,
};

// Simple cron expression parser for browser (no external dependencies)
// Supports standard 5-field cron format: minute hour day-of-month month day-of-week
const parseCronExpression = (expression: string): { next: () => { toDate: () => Date }, matches: (date: Date) => boolean } | null => {
    try {
        const parts = expression.trim().split(/\s+/);
        if (parts.length !== 5) return null;

        const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

        const parseField = (field: string, min: number, max: number): number[] => {
            if (field === '*') {
                return Array.from({ length: max - min + 1 }, (_, i) => i + min);
            }
            if (field.includes('/')) {
                const [range, step] = field.split('/');
                const stepNum = parseInt(step, 10);
                const start = range === '*' ? min : parseInt(range, 10);
                const result: number[] = [];
                for (let i = start; i <= max; i += stepNum) {
                    result.push(i);
                }
                return result;
            }
            if (field.includes(',')) {
                return field.split(',').map(v => parseInt(v, 10));
            }
            if (field.includes('-')) {
                const [start, end] = field.split('-').map(v => parseInt(v, 10));
                return Array.from({ length: end - start + 1 }, (_, i) => i + start);
            }
            return [parseInt(field, 10)];
        };

        const minutes = parseField(minute, 0, 59);
        const hours = parseField(hour, 0, 23);
        const daysOfMonth = parseField(dayOfMonth, 1, 31);
        const months = parseField(month, 1, 12);
        const daysOfWeek = parseField(dayOfWeek, 0, 6);

        return {
            next: () => {
                const now = new Date();
                const nextDate = new Date(now);

                // Simple approach: find the next matching time within the next 24 hours
                for (let attempt = 0; attempt < 1440; attempt++) { // 1440 minutes in a day
                    nextDate.setMinutes(nextDate.getMinutes() + 1);
                    nextDate.setSeconds(0);
                    nextDate.setMilliseconds(0);

                    const m = nextDate.getMinutes();
                    const h = nextDate.getHours();
                    const dom = nextDate.getDate();
                    const mon = nextDate.getMonth() + 1;
                    const dow = nextDate.getDay();

                    if (
                        minutes.includes(m) &&
                        hours.includes(h) &&
                        daysOfMonth.includes(dom) &&
                        months.includes(mon) &&
                        daysOfWeek.includes(dow)
                    ) {
                        return { toDate: () => nextDate };
                    }
                }

                // Fallback: return a time far in the future
                nextDate.setFullYear(nextDate.getFullYear() + 1);
                return { toDate: () => nextDate };
            },
            matches: (date: Date) => {
                const m = date.getMinutes();
                const h = date.getHours();
                const dom = date.getDate();
                const mon = date.getMonth() + 1;
                const dow = date.getDay();

                return minutes.includes(m) &&
                    hours.includes(h) &&
                    daysOfMonth.includes(dom) &&
                    months.includes(mon) &&
                    daysOfWeek.includes(dow);
            }
        };
    } catch (e) {
        console.error('Cron parse error:', e);
        return null;
    }
};

// Helper for safe cron parsing
const parseCron = (expression: string) => {
    return parseCronExpression(expression);
};

function useUndoRedo<T>(initialState: T) {
    const [past, setPast] = useState<T[]>([]);
    const [present, setPresent] = useState<T>(initialState);
    const [future, setFuture] = useState<T[]>([]);

    const set = (newPresent: T) => {
        setPast((prev) => [...prev, present]);
        setPresent(newPresent);
        setFuture([]);
    };

    const undo = () => {
        if (past.length === 0) return;
        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        setFuture((prev) => [present, ...prev]);
        setPresent(previous);
        setPast(newPast);
    };

    const redo = () => {
        if (future.length === 0) return;
        const next = future[0];
        const newFuture = future.slice(1);
        setPast((prev) => [...prev, present]);
        setPresent(next);
        setFuture(newFuture);
    };

    return { present, set, undo, redo, past, future, setPast, setFuture, setPresent };
}

export default function App() {
    // Dark Mode restored
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('darkMode') === 'true' ||
                window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });

    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('darkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('darkMode', 'false');
        }
    }, [darkMode]);

    const location = useLocation();

    // Initialize view based on URL path (not hash) - memoized to prevent re-computation
    const initialView = useMemo((): PageView | 'public' | 'published' => {
        const path = location.pathname;
        if (path === '/security') return 'security';
        if (path === '/terms') return 'terms';
        if (path === '/privacy') return 'privacy';
        if (path === '/refund') return 'refund';
        if (path === '/docs') return 'docs';
        if (path === '/features') return 'features';
        if (path === '/legal') return 'legal';
        if (path === '/settings') return 'settings';
        if (path === '/dashboard') return 'dashboard';
        if (path === '/auth') return 'auth';
        if (path === '/admin') return 'admin';
        if (path === '/admin/users') return 'admin-users';
        if (path === '/admin/nodes') return 'admin-nodes';
        if (path === '/admin/templates') return 'admin-templates';
        if (path.startsWith('/flow/') && path.endsWith('/history')) return 'history';
        if (path.startsWith('/flow/')) return 'editor';
        if (path.startsWith('/public/')) return 'public';
        if (path.startsWith('/published/')) return 'published';
        if (path.startsWith('/embed/form/')) return 'embed-form';
        return 'landing';
    }, []); // Empty deps - only run once on mount

    const [view, setView] = useState<PageView | 'public' | 'published' | 'embed-form'>(initialView);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [credits, setCredits] = useState<number>(0);

    const [currentFlowId, setCurrentFlowId] = useState<string | null>(null);
    const [currentFlowName, setCurrentFlowName] = useState<string>('Untitled Workflow');
    const [publicFlowId, setPublicFlowId] = useState<string | null>(() => {
        const path = location.pathname;
        if (path.startsWith('/public/')) {
            return path.split('/')[2] || null;
        }
        if (path.startsWith('/flow/')) {
            return path.split('/')[2] || null;
        }
        return null;
    });
    const [publishedFlowId, setPublishedFlowId] = useState<string | null>(() => {
        const path = location.pathname;
        if (path.startsWith('/published/')) {
            return path.split('/')[2] || null;
        }
        return null;
        return null;
    });
    // Handle Template Route
    useEffect(() => {
        if (location.pathname.startsWith('/template/')) {
            // Extract ID and set view to templates
            setView('templates');
        }
    }, [location.pathname]);

    const [embedFlowId, setEmbedFlowId] = useState<string | null>(() => {
        const path = location.pathname;
        if (path.startsWith('/embed/form/')) {
            return path.split('/')[3] || null; // /embed/form/{id}
        }
        return null;
    });

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const [past, setPast] = useState<any[]>([]);
    const [future, setFuture] = useState<any[]>([]);

    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<ExecutionLog[]>([]);
    // State updates are asynchronous, so keep a synchronous lock as well to
    // prevent a rapid double-click from starting two server-side executions.
    const isRunningRef = useRef(false);

    const [showSecrets, setShowSecrets] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showVersions, setShowVersions] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [editorTemplates, setEditorTemplates] = useState<Record<string, Template>>(staticTemplates);
    const [showAIGenerator, setShowAIGenerator] = useState(false);
    const [isBYOK, setIsBYOK] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    // React Flow Memoization Fix
    const nodeTypesMemo = useMemo(() => nodeTypes, []);
    const edgeTypesMemo = useMemo(() => ({ custom: CustomEdge }), []);
    const [showWebhookSettings, setShowWebhookSettings] = useState(false);
    const [webhookSettings, setWebhookSettings] = useState<any>({ webhook_enabled: false });
    const [showPublishTemplateModal, setShowPublishTemplateModal] = useState(false);
    const [dialog, setDialog] = useState<{ isOpen: boolean, title: string, message: string, type: 'alert' | 'confirm' | 'prompt', onConfirm: (val?: string) => void, onCancel?: () => void, placeholder?: string, variant?: 'default' | 'danger' | 'success' | 'warning' }>({ isOpen: false, title: '', message: '', type: 'alert', onConfirm: () => { } });
    const [toast, setToast] = useState<string | null>(null);

    const [secrets, setSecrets] = useState<Secret[]>([]);
    const [versions, setVersions] = useState<any[]>([]);
    const lastLoadedFlowIdRef = useRef<string | null>(null);

    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { project } = useReactFlow();

    // Add useNavigate hook
    const reactRouterNavigate = useNavigate();

    // Auto-refresh version history when opened
    useEffect(() => {
        if (showVersions && currentFlowId) {
            dataStore.getFlowById(currentFlowId, true).then(f => f?.versions && setVersions(f.versions));
        }
    }, [showVersions, currentFlowId]);

    // --- Initialization & Routing ---

    // Unified Navigation Handler
    const navigateTo = useCallback((newView: PageView | 'public' | 'published', flowId?: string) => {
        let path = '';
        switch (newView) {
            case 'landing': path = '/'; break;
            case 'dashboard': path = '/dashboard'; break;
            case 'editor': path = `/flow/${flowId}`; break;
            case 'settings': path = '/settings'; break;
            case 'docs': path = '/docs'; break;
            case 'features': path = '/features'; break;
            case 'security': path = '/security'; break;
            case 'legal': path = '/legal'; break;
            case 'privacy': path = '/privacy'; break;
            case 'terms': path = '/terms'; break;
            case 'refund': path = '/refund'; break;
            case 'history': path = `/flow/${flowId}/history`; break;
            case 'auth': path = '/auth'; break;
            case 'public': path = `/public/${flowId}`; break;
            case 'published': path = `/published/${flowId}`; break;
            case 'admin': path = '/admin'; break;
            case 'admin-users': path = '/admin/users'; break;
            case 'admin-nodes': path = '/admin/nodes'; break;
            case 'admin-templates': path = '/admin/templates'; break;
        }

        reactRouterNavigate(path);

        setView(newView);
        if (flowId) {
            if (newView === 'editor') setCurrentFlowId(flowId);
            if (newView === 'public') setPublicFlowId(flowId);
            if (newView === 'published') setPublishedFlowId(flowId);
        }
    }, [reactRouterNavigate]);

    // Sync View with URL Path (handling Back/Forward navigation)
    useEffect(() => {
        const path = location.pathname;
        let newView: PageView | 'public' | 'published' = 'landing';

        if (path === '/security') newView = 'security';
        else if (path === '/terms') newView = 'terms';
        else if (path === '/privacy') newView = 'privacy';
        else if (path === '/refund') newView = 'refund';
        else if (path === '/docs') newView = 'docs';
        else if (path === '/features') newView = 'features';
        else if (path === '/legal') newView = 'legal';
        else if (path === '/settings') newView = 'settings';
        else if (path === '/dashboard') newView = 'dashboard';
        else if (path === '/auth') newView = 'auth';
        else if (path === '/admin') newView = 'admin';
        else if (path === '/admin/users') newView = 'admin-users';
        else if (path === '/admin/nodes') newView = 'admin-nodes';
        else if (path === '/admin/templates') newView = 'admin-templates';
        else if (path.startsWith('/flow/') && path.endsWith('/history')) {
            const id = path.split('/')[2];
            if (id && id !== currentFlowId) setCurrentFlowId(id);
            newView = 'history';
        }
        else if (path.startsWith('/flow/')) {
            const id = path.split('/')[2];
            if (id && id !== currentFlowId) setCurrentFlowId(id);
            newView = 'editor';
        }
        else if (path.startsWith('/public/')) {
            const id = path.split('/')[2];
            if (id) setPublicFlowId(id);
            newView = 'public';
        }
        else if (path.startsWith('/published/')) {
            const id = path.split('/')[2];
            if (id) setPublishedFlowId(id);
            newView = 'published';
        }

        // Only update if view changed to avoid loops
        if (view !== newView) {
            setView(newView);
        }
    }, [location.pathname, view, currentFlowId, setPublicFlowId, setPublishedFlowId, setCurrentFlowId]);

    useEffect(() => {
        // Initial Auth Check & Redirect
        auth.getUser().then(u => {
            if (u) {
                setUser(u);
                // If on landing page (/) or auth page (/auth) but logged in, go to dashboard
                const path = window.location.pathname;
                if (path === '/' || path === '/auth') {
                    navigateTo('dashboard');
                }
            }
            refreshCredits();
        });

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            const u = session?.user ? {
                id: session.user.id,
                email: session.user.email || '',
                full_name: session.user.user_metadata?.full_name,
                avatar_url: session.user.user_metadata?.avatar_url
            } : null;

            setUser(u);

            // Use window.location.pathname to check current view
            const currentPath = window.location.pathname;

            // Only redirect on explicit sign-in/sign-out events
            if (event === 'SIGNED_OUT') {
                const isPublicPage =
                    currentPath === '/' ||
                    currentPath === '/docs' ||
                    currentPath === '/security' ||
                    currentPath === '/terms' ||
                    currentPath === '/privacy' ||
                    currentPath === '/refund' ||
                    currentPath === '/legal' ||
                    currentPath.startsWith('/public/') ||
                    currentPath.startsWith('/published/');

                if (!isPublicPage) {
                    navigateTo('landing');
                }
            } else if (event === 'SIGNED_IN') {
                // Check for pending payment action first
                const pendingAction = sessionStorage.getItem('pending_payment_action');
                if (pendingAction === 'pro_upgrade' && session?.user.email) {
                    sessionStorage.removeItem('pending_payment_action');
                    // Small delay to ensure UI is ready
                    setTimeout(() => {
                        BillingService.initiateCheckout('pro', session.user.email!, () => {
                            refreshCredits();
                            window.location.reload();
                        });
                    }, 1000);
                    // Stay on current view if possible or go to dashboard
                    if (currentPath === '/' || currentPath === '/auth') {
                        navigateTo('dashboard');
                    }
                } else {
                    // Normal redirect
                    if (currentPath === '/' || currentPath === '/auth') {
                        navigateTo('dashboard');
                    }
                }
            }
            // For INITIAL_SESSION, TOKEN_REFRESHED, etc. - do NOT redirect

            refreshCredits();
        });

        // Load Secrets
        const savedSecrets = localStorage.getItem('flow-secrets-v1');
        if (savedSecrets) setSecrets(JSON.parse(savedSecrets));

        return () => {

            authListener.subscription.unsubscribe();
        };
    }, []);

    // Load flow data when entering editor with a flow ID
    useEffect(() => {
        // Load when: in editor, have a flowId, and it's different from what we last loaded
        if (view === 'editor' && currentFlowId && lastLoadedFlowIdRef.current !== currentFlowId) {
            console.log(`[Flow] Loading flow: ${currentFlowId} (was: ${lastLoadedFlowIdRef.current})`);
            lastLoadedFlowIdRef.current = currentFlowId;

            // Warm up/cache flow-wide realtime log subscription
            getOrCreateFlowChannel(currentFlowId);

            // Load flow from storage
            storage.getFlowById(currentFlowId).then(flow => {
                if (flow) {
                    setCurrentFlowName(flow.name);
                    // Reset all node statuses to IDLE to prevent stale spinners
                    const cleanedNodes = normalizeFlowNodes(flow.nodes || []);
                    setNodes(cleanedNodes);
                    setEdges(flow.edges || []);
                    // Load webhook settings
                    setWebhookSettings({
                        webhook_enabled: flow.webhook_enabled,
                        webhook_api_key: flow.webhook_api_key,
                        webhook_response_mode: flow.webhook_response_mode,
                    });
                    setPast([]);
                    setFuture([]);
                } else {
                    // Flow not found in storage - create default start node
                    setCurrentFlowName('Untitled Workflow');
                    setNodes([{
                        id: 'start-1',
                        type: NodeType.START,
                        position: { x: 100, y: 300 },
                        data: { label: 'Start', type: NodeType.START, status: NodeStatus.IDLE }
                    }]);
                    setEdges([]);
                    setWebhookSettings({});
                    setPast([]);
                    setFuture([]);
                }
            });
        }
        // Reset ref when leaving editor or clearing flowId
        if (view !== 'editor' || !currentFlowId) {
            lastLoadedFlowIdRef.current = null;
        }
        // Load templates from DB when entering editor
        if (view === 'editor') {
            getTemplates().then(dbTemplates => {
                setEditorTemplates(dbTemplates);
            });
        }
    }, [view, currentFlowId]);

    // --- Scheduler ---
    useEffect(() => {
        // Don't run scheduler if we are already running a workflow
        // Allow scheduler to run on both editor AND dashboard views (as long as app is open)
        if (isRunning) return;

        // Check schedules every 10 seconds for more accurate triggering
        const intervalId = setInterval(() => {
            // Only check if we're in editor with active flow
            if (view !== 'editor' || nodes.length === 0) return;

            const scheduleNodes = nodes.filter(n =>
                getEffectiveNodeType(n) === NodeType.SCHEDULE &&
                n.data.cronExpression &&
                n.data.scheduleActive === true
            );

            scheduleNodes.forEach(node => {
                const cronExp = node.data.cronExpression;
                try {
                    const cron = parseCronExpression(cronExp!);
                    if (cron) {
                        const now = new Date();

                        // Create a minute-based key to prevent multiple triggers in the same minute
                        const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}:${now.getMinutes()}`;
                        const lastTriggerMinute = node.data.lastTriggerMinute;

                        // Trigger if:
                        // 1. Current time matches cron pattern
                        // 2. We haven't triggered this minute yet
                        if (cron.matches(now) && lastTriggerMinute !== minuteKey) {
                            console.log(`[CRON] Triggering schedule: ${node.id} at ${now.toLocaleTimeString()}`);

                            // Update node with last trigger info BEFORE running to prevent re-trigger
                            setNodes(nds => nds.map(n =>
                                n.id === node.id
                                    ? { ...n, data: { ...n.data, lastRun: now.getTime(), lastTriggerMinute: minuteKey } }
                                    : n
                            ));

                            // Run the workflow
                            handleRunWorkflow();
                        }
                    }
                } catch (e) {
                    console.error("Cron Parse Error for node:", node.id, e);
                }
            });
        }, 10000); // Check every 10 seconds

        return () => clearInterval(intervalId);
    }, [nodes, isRunning, view]);

    // --- Webhook Queue Subscription ---
    // Listen for incoming webhook triggers and auto-execute the flow
    useEffect(() => {
        // Only active when in editor view with a saved flow AND webhook is enabled
        if (view !== 'editor' || !currentFlowId || !user || !webhookSettings.webhook_enabled) return;

        console.log('[Webhook] Subscribing to webhook_queue for flow:', currentFlowId);

        const channel = supabase
            .channel(`webhook_queue_${currentFlowId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'webhook_queue',
                    filter: `flow_id=eq.${currentFlowId}`
                },
                async (payload: any) => {
                    console.log('[Webhook] Received trigger:', payload);

                    // Don't trigger if already running
                    if (isRunningRef.current) {
                        console.log('[Webhook] Skipping - workflow already running');
                        return;
                    }

                    const webhookData = payload.new;
                    if (!webhookData || webhookData.status !== 'pending') return;

                    // Mark as processing to prevent re-trigger
                    await supabase
                        .from('webhook_queue')
                        .update({ status: 'processing' })
                        .eq('id', webhookData.id);

                    // Find the webhook node to get the variable name
                    const webhookNode = nodes.find(n => n.data.type === NodeType.WEBHOOK);
                    const varName = webhookNode?.data.variableName || 'payload';

                    // Build initial variables with webhook payload
                    // Support both {{payload.field}} and {{field}} access patterns
                    const initialVariables: Record<string, any> = {};

                    // Get the actual payload (excluding _webhook metadata)
                    const { _webhook, ...userPayload } = webhookData.payload || {};

                    // Add the full payload under the variable name (e.g., {{payload.field}})
                    initialVariables[varName] = userPayload;

                    // Also spread individual fields for direct access (e.g., {{name}}, {{topic}})
                    Object.entries(userPayload).forEach(([key, value]) => {
                        initialVariables[key] = value;
                    });

                    // Add webhook metadata separately
                    initialVariables['_webhook'] = _webhook || {};

                    console.log(`[Webhook] Payload received:`, webhookData.payload);
                    console.log(`[Webhook] Initial variables:`, initialVariables);
                    showToast('Webhook received! Running workflow...');

                    // Run the workflow with injected payload
                    isRunningRef.current = true;
                    setIsRunning(true);
                    const secretMap: Record<string, string> = {};
                    secrets.forEach(s => secretMap[s.key] = s.value);

                    const updateStatus = (nodeId: string, status: NodeStatus, output?: any, error?: string, extraData?: Record<string, any>) => {
                        setNodes((nds) => nds.map((n) => {
                            if (n.id === nodeId) {
                                return { ...n, data: { ...n.data, status, output: output !== undefined ? output : n.data.output, error, ...extraData } };
                            }
                            return n;
                        }));
                    };

                    const addLog = (log: ExecutionLog) => {
                        setLogs(prev => [log, ...prev]);
                    };

                    const requestApproval = async (message: string, nodeId: string, dismissSignal?: Promise<void>): Promise<boolean> => {
                        return new Promise((resolve) => {
                            let settled = false;
                            const settle = (approved: boolean) => {
                                if (settled) return;
                                settled = true;
                                setDialog(prev => ({ ...prev, isOpen: false }));
                                resolve(approved);
                            };
                            dismissSignal?.then(() => settle(false));
                            setDialog({
                                isOpen: true, type: 'confirm', title: 'Approval Required', message,
                                onConfirm: () => settle(true),
                                onCancel: () => settle(false)
                            });
                        });
                    };

                    try {
                        const runId = crypto.randomUUID();
                        await runWorkflow(nodes, edges, updateStatus, addLog, secretMap, initialVariables, requestApproval, { flowId: currentFlowId || undefined, runId });

                        // Update queue status
                        await supabase
                            .from('webhook_queue')
                            .update({ status: 'completed', processed_at: new Date().toISOString() })
                            .eq('id', webhookData.id);

                        // The runner persists the canonical history record.
                        void refreshCredits();
                    } catch (error: any) {
                        console.error('[Webhook] Workflow failed:', error);
                        await supabase
                            .from('webhook_queue')
                            .update({ status: 'failed', processed_at: new Date().toISOString() })
                            .eq('id', webhookData.id);
                    } finally {
                        isRunningRef.current = false;
                        setIsRunning(false);
                    }
                }
            )
            .subscribe();

        return () => {
            console.log('[Webhook] Unsubscribing from webhook_queue');
            supabase.removeChannel(channel);
        };
    }, [view, currentFlowId, user, nodes, edges, secrets, webhookSettings.webhook_enabled]);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        if (view !== 'editor') return;
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input/textarea is focused
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            // Copy: Ctrl+C
            if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
                if (selectedNodeId) {
                    const nodeToCopy = nodes.find(n => n.id === selectedNodeId);
                    if (nodeToCopy) {
                        localStorage.setItem('clipboard_node', JSON.stringify(nodeToCopy));
                    }
                }
            }

            // Paste: Ctrl+V
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                const clipboardData = localStorage.getItem('clipboard_node');
                if (clipboardData) {
                    try {
                        const copiedNode = JSON.parse(clipboardData);
                        const newNodeId = crypto.randomUUID();

                        // Offset position slightly
                        const position = {
                            x: copiedNode.position.x + 50,
                            y: copiedNode.position.y + 50,
                        };

                        const newNode = {
                            ...copiedNode,
                            id: newNodeId,
                            position,
                            data: {
                                ...copiedNode.data,
                                label: `${copiedNode.data.label} (Copy)`
                            },
                            selected: true
                        };

                        // Deselect others and add new node
                        setNodes((nds) => nds.map(n => ({ ...n, selected: false })).concat(newNode));
                        setSelectedNodeId(newNodeId);
                    } catch (err) {
                        console.error("Failed to paste node", err);
                    }
                }
            }

            // Don't trigger shortcuts when typing in inputs
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifier = isMac ? e.metaKey : e.ctrlKey;

            // Ctrl/Cmd + Z = Undo
            if (modifier && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (past.length === 0) return;
                const snapshot = past[past.length - 1];
                setFuture(prev => [{ nodes, edges }, ...prev]);
                setNodes(normalizeFlowNodes(snapshot.nodes));
                setEdges(snapshot.edges);
                setPast(prev => prev.slice(0, prev.length - 1));
                return;
            }

            // Ctrl/Cmd + Y OR Ctrl/Cmd + Shift + Z = Redo
            if ((modifier && e.key === 'y') || (modifier && e.key === 'z' && e.shiftKey)) {
                e.preventDefault();
                if (future.length === 0) return;
                const snapshot = future[0];
                setPast(prev => [...prev, { nodes, edges }]);
                setNodes(normalizeFlowNodes(snapshot.nodes));
                setEdges(snapshot.edges);
                setFuture(prev => prev.slice(1));
                return;
            }

            // Ctrl/Cmd + S = Save (just show toast since async save is complex)
            if (modifier && e.key === 's') {
                e.preventDefault();
                // Trigger click on save button instead of calling async function
                const saveBtn = document.querySelector('[data-save-btn]') as HTMLButtonElement;
                if (saveBtn) saveBtn.click();
                return;
            }

            // Delete or Backspace = Delete selected node
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
                e.preventDefault();
                setPast(prev => [...prev, { nodes, edges }]);
                setFuture([]);
                setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
                setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
                setSelectedNodeId(null);
                return;
            }

            // Escape = Deselect
            if (e.key === 'Escape') {
                setSelectedNodeId(null);
                setShowMenu(false);
                setShowVersions(false);
                setShowTemplates(false);
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [view, selectedNodeId, nodes, edges, past, future]);

    const refreshCredits = async () => {
        // Force refresh from server to get real-time balance
        const c = await dataStore.getUserCredits(true);
        setCredits(c.balance);
    };

    // Calculate estimated credits for the current flow
    const flowCreditCost = useMemo(() => {
        // Base cost for running any flow
        let totalCost = 10;

        // Add costs for each node type
        nodes.forEach(node => {
            const nodeCost = BillingService.calculateNodeRunCost(node, isBYOK);
            if (nodeCost > 1) {
                totalCost += (nodeCost - 1);
            }
        });

        return totalCost;
    }, [nodes, isBYOK]);

    // ... Flow Management Logic ...
    const takeSnapshot = () => {
        setPast(prev => [...prev, { nodes, edges }]);
        setFuture([]);
        if (past.length > 20) setPast(prev => prev.slice(1));
    };

    const undo = () => {
        if (past.length === 0) return;
        const snapshot = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);
        setFuture(prev => [{ nodes, edges }, ...prev]);
        setNodes(normalizeFlowNodes(snapshot.nodes));
        setEdges(snapshot.edges);
        setPast(newPast);
    };

    const redo = () => {
        if (future.length === 0) return;
        const snapshot = future[0];
        const newFuture = future.slice(1);
        setPast(prev => [...prev, { nodes, edges }]);
        setNodes(normalizeFlowNodes(snapshot.nodes));
        setEdges(snapshot.edges);
        setFuture(newFuture);
    };

    const handleCreateFlow = () => {
        setCurrentFlowId(null);
        setCurrentFlowName('Untitled Workflow');
        setNodes([{ id: 'start-1', type: NodeType.START, position: { x: 100, y: 300 }, data: { label: 'Start', type: NodeType.START, status: NodeStatus.IDLE } }]);
        setEdges([]);
        setPast([]);
        setFuture([]);
        setView('editor');
    };

    const handleOpenFlow = (flow: SavedFlow) => {
        setCurrentFlowId(flow.id);
        setCurrentFlowName(flow.name);
        setNodes(normalizeFlowNodes(flow.nodes || []));
        setEdges(flow.edges || []);
        setPast([]);
        setFuture([]);
        setView('editor');
    };

    const handleSaveFlow = async () => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }
        if (!currentFlowId) {
            setDialog({
                isOpen: true,
                type: 'prompt',
                title: 'Save Workflow',
                message: 'Enter a name for your workflow:',
                onConfirm: async (name) => {
                    if (!name) return;

                    // Check Limits before saving new flow
                    let creds: any;
                    try {
                        const [credsResult, existingFlows] = await Promise.all([
                            storage.getUserCredits(),
                            storage.getFlows()
                        ]);
                        creds = credsResult;
                        const limit = creds.tier === 'pro' ? 30 : 10;
                        if (existingFlows.length >= limit) {
                            setDialog({
                                isOpen: true,
                                type: 'alert',
                                title: 'Plan Limit Reached',
                                message: `Your plan allows up to ${limit} workflows. Please upgrade for more.`,
                                onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false }))
                            });
                            return;
                        }
                    } catch (e) {
                        console.error("Limit check failed", e);
                        // Continue or block? Best to safeguard, but let's just log and continue if check fails to avoid blocking users on network error?
                        // Actually, if check fails, we might still want to proceed if we can't verify, or block safely.
                        // Let's block safely with error message to be consistent with "Enterprise Grade".
                        setDialog({
                            isOpen: true,
                            type: 'alert',
                            title: 'Error',
                            message: 'Unable to verify plan limits. Please try again.',
                            onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false }))
                        });
                        return;
                    }

                    const newId = crypto.randomUUID();
                    const newFlow: SavedFlow = {
                        id: newId,
                        name,
                        nodes,
                        edges,
                        updated_at: Date.now()
                    };
                    try {
                        await storage.saveFlow(newFlow);
                        setCurrentFlowId(newId);
                        setCurrentFlowName(name);
                        await storage.saveFlowVersion(newId, { id: crypto.randomUUID(), timestamp: Date.now(), name: 'Initial Save', nodes, edges }, creds.tier);
                        setDialog(prev => ({ ...prev, isOpen: false }));
                        setToast('Flow saved successfully!');
                        setTimeout(() => setToast(null), 3000);
                    } catch (e: any) {
                        setDialog({ isOpen: true, type: 'alert', title: 'Save Error', message: e.message, onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) });
                    }
                }
            });
            return;
        }
        try {
            const creds = await dataStore.getUserCredits();
            await storage.saveFlow({
                id: currentFlowId,
                name: currentFlowName,
                nodes,
                edges,
                updated_at: Date.now()
            });
            await storage.saveFlowVersion(currentFlowId, { id: crypto.randomUUID(), timestamp: Date.now(), name: `Auto-save ${new Date().toLocaleTimeString()}`, nodes, edges }, creds.tier);

            // Sync schedule with server-side pg_cron
            const scheduleNode = nodes.find(n => n.data?.type === NodeType.SCHEDULE);
            if (scheduleNode && scheduleNode.data?.scheduleActive && scheduleNode.data?.cronExpression) {
                const scheduleResult = await upsertFlowSchedule(
                    currentFlowId,
                    scheduleNode.data.cronExpression,
                    true
                );
                if (scheduleResult.success) {
                    console.log('[Schedule] Server-side schedule activated:', scheduleResult);
                    showToast('Flow saved & schedule synced to server!');
                } else {
                    console.warn('[Schedule] Failed to sync schedule:', scheduleResult.error);
                    showToast('Flow saved (schedule sync failed: ' + (scheduleResult.error || 'Unknown error') + ')');
                }
            } else if (scheduleNode && !scheduleNode.data?.scheduleActive) {
                // Deactivate server-side schedule
                const deleteResult = await deleteFlowSchedule(currentFlowId);
                if (deleteResult.success) {
                    console.log('[Schedule] Server-side schedule deactivated');
                }
                showToast('Flow saved successfully');
            } else {
                showToast('Flow saved successfully');
            }
        } catch (e: any) {
            setDialog({ isOpen: true, type: 'alert', title: 'Save Error', message: e.message, onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) });
        }
    };

    const handleExportFlow = () => {
        const flowData: SavedFlow = {
            id: currentFlowId || crypto.randomUUID(),
            name: currentFlowName || 'Untitled Flow',
            nodes,
            edges,
            updated_at: Date.now(),
            ...webhookSettings
        };
        const blob = new Blob([JSON.stringify(flowData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(flowData.name || 'flow').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShowMenu(false);
    };

    const handleSnapshot = async () => {
        if (!currentFlowId) {
            setDialog({ isOpen: true, type: 'alert', title: 'Cannot Create Snapshot', message: 'Please save the flow first before creating a snapshot.', onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) });
            return;
        }

        // Check Version Limits
        try {
            const creds = await dataStore.getUserCredits();
            const flow = await dataStore.getFlowById(currentFlowId);
            const versionsCount = flow?.versions?.length || 0;
            const limit = creds.tier === 'pro' ? 10 : 3;

            if (versionsCount >= limit) {
                setDialog({
                    isOpen: true,
                    type: 'alert',
                    title: 'Snapshot Limit Reached',
                    message: `You have reached the limit of ${limit} snapshots for the ${creds.tier} plan.\n\nPlease delete older snapshots or upgrade to Pro to create more.`,
                    onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })), // Just close, do not proceed
                    variant: 'warning'
                });
                return;
            } else {
                startSnapshotDialog(creds.tier);
            }
        } catch (e) {
            console.error(e);
            startSnapshotDialog('starter');
        }
    };

    const startSnapshotDialog = (tier: string) => {
        setDialog({
            isOpen: true,
            type: 'prompt',
            title: 'Create Snapshot',
            message: 'Name this version:',
            placeholder: 'e.g. Initial V1',
            onConfirm: async (name) => {
                if (name) {
                    try {
                        setDialog(prev => ({ ...prev, isOpen: false }));
                        const creds = await dataStore.getUserCredits();
                        // Use dataStore to save and invalidate cache
                        await dataStore.saveFlowVersion(currentFlowId!, {
                            id: crypto.randomUUID(),
                            timestamp: Date.now(),
                            name: name,
                            nodes,
                            edges
                        }, creds.tier);

                        showToast('Snapshot saved. View in Menu - Version History.');

                        // Update local list if open - fetch fresh data from dataStore
                        if (showVersions) {
                            dataStore.getFlowById(currentFlowId!, true).then(f => f?.versions && setVersions(f.versions));
                        }
                    } catch (e: any) {
                        showToast('Failed to save snapshot: ' + e.message);
                    }
                }
            }
        });
    };

    const handleSaveWebhookSettings = async (settings: { webhook_enabled: boolean; webhook_api_key?: string; webhook_response_mode: 'async' | 'sync' }) => {
        if (!currentFlowId) {
            showToast('Please save the flow first');
            return;
        }
        try {
            setWebhookSettings(settings);
            await storage.saveFlow({
                id: currentFlowId,
                name: currentFlowName,
                nodes,
                edges,
                updated_at: Date.now(),
                webhook_enabled: settings.webhook_enabled,
                webhook_api_key: settings.webhook_api_key,
                webhook_response_mode: settings.webhook_response_mode,
            });
            showToast(settings.webhook_enabled ? 'Webhook enabled!' : 'Webhook disabled');
        } catch (e: any) {
            showToast('Failed to save webhook settings: ' + e.message);
        }
    };

    const handleRunWorkflow = async () => {
        if (isRunningRef.current) return;

        isRunningRef.current = true;
        setIsRunning(true);

        // Paint the initial state synchronously, before the credit request and
        // server dispatch, so starting a run feels immediate.
        const edgeTargets = new Set(edges.map(edge => edge.target));
        setNodes(nds => nds.map(node => ({
            ...node,
            data: {
                ...node.data,
                status: edgeTargets.has(node.id) ? NodeStatus.IDLE : NodeStatus.RUNNING,
                error: undefined,
            }
        })));

        const cancelStart = () => {
            isRunningRef.current = false;
            setIsRunning(false);
            setNodes(nds => nds.map(node => ({
                ...node,
                data: { ...node.data, status: NodeStatus.IDLE }
            })));
        };

        try {
            const latestCredits = await storage.getUserCredits();

            // Calculate Estimated Cost
            let estimatedCost = 10; // Base run cost
            nodes.forEach(node => {
                // Only count nodes that will likely run (rudimentary check, better to be conservative)
                // For accurate estimation, we assume all enabled nodes might run.
                const nodeCost = BillingService.calculateNodeRunCost(node, isBYOK);
                if (nodeCost > 1) {
                    estimatedCost += (nodeCost - 1); // Add the extra cost on top of base
                }
            });

            console.log(`Estimated Flow Cost: ${estimatedCost}, Balance: ${latestCredits.balance}, Mode: ${isBYOK ? 'BYOK' : 'Platform'}`);

            if (latestCredits.balance < estimatedCost) {
                setDialog({
                    isOpen: true,
                    type: 'alert',
                    title: 'Insufficient Credits',
                    message: `You need approximately ${estimatedCost} credits to run this workflow (Balance: ${latestCredits.balance}). ${isBYOK ? 'Enable Platform Keys for standard pricing or top up.' : 'Enable BYOK to reduce costs if you have your own keys.'}\n\nUpgrade to Pro for 5,000 credits/month and unlock more workflows!`,
                    onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false }))
                });
                cancelStart();
                return;
            }
        } catch (e) {
            console.error("Credit check failed", e);
            setDialog({
                isOpen: true,
                type: 'alert',
                title: 'Connection Error',
                message: 'Unable to verify credit balance. Please check your internet connection.',
                onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false }))
            });
            cancelStart();
            return;
        }

        const secretMap: Record<string, string> = {};
        secrets.forEach(s => secretMap[s.key] = s.value);
        const updateStatus = (nodeId: string, status: NodeStatus, output?: any, error?: string, extraData?: Record<string, any>) => {
            setNodes((nds) => nds.map((n) => {
                if (n.id === nodeId) {
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            status,
                            output: output !== undefined ? output : n.data.output,
                            error,
                            ...extraData
                        }
                    };
                }
                return n;
            }));
        };

        const addLog = (log: ExecutionLog) => {
            setLogs(prev => [log, ...prev]);
        };

        const requestApprovalWrapper = async (message: string, nodeId: string, dismissSignal?: Promise<void>): Promise<boolean> => {
            return new Promise((resolve) => {
                let settled = false;
                const settle = (approved: boolean) => {
                    if (settled) return;
                    settled = true;
                    setDialog(prev => ({ ...prev, isOpen: false }));
                    resolve(approved);
                };
                // Approval handled outside this browser (HITL link) — close silently
                dismissSignal?.then(() => settle(false));
                setDialog({
                    isOpen: true,
                    type: 'confirm',
                    title: 'Approval Required',
                    message: message,
                    onConfirm: () => settle(true),
                    onCancel: () => settle(false)
                });
            });
        };

        try {
            const runId = crypto.randomUUID();
            await runWorkflow(nodes, edges, updateStatus, addLog, secretMap, {}, requestApprovalWrapper, { flowId: currentFlowId || undefined, runId });
            // The server runner writes the authoritative history record. Do not
            // issue a duplicate client-side insert after execution completes.
            void refreshCredits();
        } catch (error: any) {
            console.error("Workflow failed", error);
            // Failed runs are also persisted by the server runner.
            void refreshCredits();
            setDialog({ isOpen: true, type: 'alert', title: 'Workflow Failed', message: error.message, onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) });
        } finally {
            isRunningRef.current = false;
            setIsRunning(false);
            // Keep COMPLETED (green tick) / ERROR (red X) on nodes after the run.
            // Only clear leftover RUNNING spinners so the canvas is not stuck loading.
            // Status is reset to IDLE at the start of the next run.
            setNodes((nds) => nds.map((n) => {
                if (n.data?.status === NodeStatus.RUNNING || n.data?.status === NodeStatus.RETRYING) {
                    return {
                        ...n,
                        data: { ...n.data, status: NodeStatus.IDLE }
                    };
                }
                return n;
            }));
        }
    };

    const onConnect = useCallback((params: Connection) => {
        takeSnapshot();
        setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#94a3b8' } }, eds));
    }, [setEdges]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        const droppedType = event.dataTransfer.getData('application/reactflow');
        if (typeof droppedType === 'undefined' || !droppedType) return;
        const customNodePayload = event.dataTransfer.getData(CUSTOM_NODE_DRAG_MIME);
        let customNodeDefinition: AdminNode | null = null;
        if (customNodePayload) {
            try {
                customNodeDefinition = JSON.parse(customNodePayload) as AdminNode;
            } catch (error) {
                console.warn('[Sidebar] Failed to parse custom node definition from drag payload', error);
            }
        }

        const position = reactFlowWrapper.current?.getBoundingClientRect();
        if (!position) return;

        const p = project({
            x: event.clientX - position.left,
            y: event.clientY - position.top,
        });

        // Check if this is a built-in NodeType or a custom one
        const isBuiltIn = isBuiltInNodeType(droppedType);

        // For custom nodes, use 'default' as React Flow type so DynamicNode renders them
        const reactFlowType = isBuiltIn ? droppedType : 'default';
        const customSnapshot = customNodeDefinition ? createCustomNodeSnapshot(customNodeDefinition) : {};
        const customConfig = customNodeDefinition?.default_config || {};

        const newNode: Node<NodeData> = {
            id: crypto.randomUUID(),
            type: reactFlowType,
            position: p,
            data: {
                label: buildNodeLabel(droppedType, customNodeDefinition || undefined),
                type: droppedType, // Store original type in data
                status: NodeStatus.IDLE,
                customConfig,
                ...customSnapshot,
            }
        };

        takeSnapshot();
        setNodes((nds) => nds.concat(newNode));
    }, [project, setNodes]);

    const handleAddNode = useCallback((nodeType: string, customNodeDefinition?: AdminNode) => {
        const position = reactFlowWrapper.current?.getBoundingClientRect();
        if (!position) return;

        // Place the new node roughly in the center of the viewport
        const p = project({
            x: position.width / 2,
            y: position.height / 2,
        });

        const isBuiltIn = isBuiltInNodeType(nodeType);
        const reactFlowType = isBuiltIn ? nodeType : 'default';
        const customSnapshot = customNodeDefinition ? createCustomNodeSnapshot(customNodeDefinition) : {};
        const customConfig = customNodeDefinition?.default_config || {};

        const newNode: Node<NodeData> = {
            id: crypto.randomUUID(),
            type: reactFlowType,
            position: p,
            data: {
                label: buildNodeLabel(nodeType, customNodeDefinition || undefined),
                type: nodeType,
                status: NodeStatus.IDLE,
                customConfig,
                ...customSnapshot,
            }
        };

        takeSnapshot();
        setNodes((nds) => nds.concat(newNode));
    }, [project, setNodes]);




    const handleUpdateNode = (id: string, data: Partial<NodeData>) => {
        setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...data } } : n));
    };

    const handleDeleteNode = (id: string) => {
        takeSnapshot();
        setNodes(nds => nds.filter(n => n.id !== id));
        setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
        setSelectedNodeId(null);
    };

    const loadTemplate = (key: string) => {
        const t = editorTemplates[key];
        if (t) {
            setNodes(normalizeFlowNodes(t.nodes));
            setEdges(t.edges);
            setCurrentFlowName(t.name);
            setCurrentFlowId(null);
            takeSnapshot();
        }
        setShowTemplates(false);
    };

    const restoreVersion = (v: any) => {
        setNodes([]);
        setEdges([]);
        setTimeout(() => {
            setNodes(normalizeFlowNodes(v.nodes));
            setEdges(v.edges);
            showToast(`Restored version: ${v.name}`);
        }, 10);
        setShowVersions(false);
        takeSnapshot();
    };

    const deleteSnapshot = (versionId: string) => {
        if (!currentFlowId) return;
        setDialog({
            isOpen: true,
            type: 'confirm',
            title: 'Delete Snapshot',
            message: 'Are you sure you want to delete this snapshot? This action cannot be undone.',
            variant: 'danger',
            onConfirm: async () => {
                setDialog(prev => ({ ...prev, isOpen: false }));
                try {
                    await dataStore.deleteFlowVersion(currentFlowId, versionId);
                    showToast('Snapshot deleted');
                    dataStore.getFlowById(currentFlowId, true).then(f => f?.versions && setVersions(f.versions));
                } catch (e: any) {
                    showToast('Failed to delete: ' + e.message);
                }
            }
        });
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ name: currentFlowName, nodes, edges }));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", currentFlowName + ".json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleImportClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target?.result as string);
                    if (json.nodes && json.edges) {
                        setNodes(normalizeFlowNodes(json.nodes));
                        setEdges(json.edges);
                        setCurrentFlowName(json.name || 'Imported Flow');
                        setCurrentFlowId(null);
                        takeSnapshot();
                    }
                } catch (e) { setDialog({ isOpen: true, type: 'alert', title: 'Import Error', message: 'Invalid JSON file format', onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) }); }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const [deployedUrl, setDeployedUrl] = useState<string | null>(null);

    const handleDeploy = async () => {
        if (!currentFlowId) {
            setDialog({ isOpen: true, type: 'alert', title: 'Cannot Deploy', message: 'Please save the flow first before deploying.', onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) });
            return;
        }
        try {
            console.log('[Deploy] Publishing flow ID:', currentFlowId);
            const { data, error } = await supabase
                .from('flows')
                .update({ is_published: true })
                .eq('id', currentFlowId)
                .select();
            
            console.log('[Deploy] Supabase response data:', data, 'error:', error);
            if (error) throw error;

            if (!data || data.length === 0) {
                throw new Error("No flow record was updated in the database. Make sure you have saved this flow to the cloud and own it.");
            }

            const deployUrl = `${window.location.origin}/public/${currentFlowId}`;
            setDeployedUrl(deployUrl);
            showToast('Workflow successfully deployed!');
        } catch (e: any) {
            console.error('[Deploy] Failed to publish flow:', e);
            setDialog({ isOpen: true, type: 'alert', title: 'Deploy Error', message: `Failed to deploy: ${e.message}`, onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false })) });
        }
    };

    const toastTimeout = useRef<NodeJS.Timeout | null>(null);

    const showToast = (message: string) => {
        if (toastTimeout.current) clearTimeout(toastTimeout.current);
        setToast(message);
        toastTimeout.current = setTimeout(() => setToast(null), 3000);
    };

    const handleCopyDeployUrl = () => {
        if (deployedUrl) {
            navigator.clipboard.writeText(deployedUrl);
            showToast('URL copied to clipboard');
        }
    };

    // --- Views ---

    if (view === 'public' && publicFlowId) return <PublicFlowRunner flowId={publicFlowId} />;

    if (view === 'published' && publishedFlowId) {
        return (
            <PublishedFlowViewer
                flowId={publishedFlowId}
                onNavigate={(v, id) => navigateTo(v as any, id)}
            />
        );
    }

    if (view === 'landing') {
        return <LandingPage onStart={() => navigateTo('auth')} onNavigate={(page) => navigateTo(page)} />;
    }

    if (view === 'embed-form' && embedFlowId) {
        return <EmbeddableForm flowId={embedFlowId} />;
    }

    if (view === 'auth') {
        return <AuthModal onBack={() => navigateTo('landing')} onSkip={() => navigateTo('dashboard')} />;
    }

    if (view === 'dashboard') {
        return (
            <Dashboard
                user={user}
                credits={credits || 0}
                onOpenFlow={(id) => navigateTo('editor', id)}
                onCreateFlow={async () => {
                    const id = crypto.randomUUID();
                    // Clear state
                    setNodes([]);
                    setEdges([]);
                    setPast([]);
                    setFuture([]);
                    await storage.saveFlowVersion(id, { id: crypto.randomUUID(), timestamp: Date.now(), name: 'Untitled Flow', nodes: [], edges: [] });
                    navigateTo('editor', id);
                    setShowAIGenerator(true);
                }}
                onNavigate={(page) => navigateTo(page)}
                onLogout={async () => {
                    await auth.signOut();
                    navigateTo('landing');
                }}
            />
        );
    }

    if (view === 'templates') {
        return (
            <div className="flex h-screen w-screen bg-[#f8fafc] text-slate-900 overflow-hidden font-sans flex-col">
                <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 flex-shrink-0 z-20">
                    <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setView('dashboard')}>
                        <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-brand-500/20">
                            B
                        </div>
                        <span className="font-bold text-slate-900 tracking-tight">Blupe</span>
                    </div>
                    <button onClick={() => setView('dashboard')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-900 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </header>
                <div className="flex-1 overflow-hidden relative">
                    <TemplatesPage onUseTemplate={async (templateId) => {
                        try {
                            const { data: { session } } = await import('./services/supabase').then(m => m.supabase.auth.getSession());
                            if (!session) return;

                            // Fetch template
                            const res = await fetch(`/api/templates?id=${templateId}`);
                            const template = await res.json();
                            if (!res.ok) throw new Error(template.error || 'Failed to fetch template');

                            // Create flow based on template
                            const flow = await storage.createFlow(
                                session.user.id,
                                `${template.name} (Copy)`,
                                (template.nodes || []),
                                (template.edges || []),
                                {
                                    is_public: false,
                                    webhook_enabled: false
                                }
                            );

                            if (flow) {
                                navigateTo('editor', flow.id);
                            }
                        } catch (e) {
                            console.error(e);
                            showToast('Failed to use template: ' + (e as Error).message);
                        }
                    }} />
                </div>
            </div>
        );
    }

    if (view === 'settings') return <SettingsPage onBack={() => navigateTo('dashboard')} />;
    if (view === 'docs') return <DocsPage onBack={() => navigateTo(user ? 'dashboard' : 'landing')} />;
    if (view === 'features') return (
        <>
            <FeaturesPage
                onNavigate={navigateTo}
                onStart={() => user ? navigateTo('dashboard') : setShowAuthModal(true)}
            />
            {showAuthModal && (
                <AuthModal
                    onLogin={() => {
                        setShowAuthModal(false);
                        navigateTo('dashboard');
                    }}
                    onSkip={() => setShowAuthModal(false)}
                />
            )}
        </>
    );
    if (view === 'security') return <SecurityPage onBack={() => navigateTo(user ? 'dashboard' : 'landing')} />;
    if (view === 'legal') return <LegalPage onBack={() => navigateTo(user ? 'dashboard' : 'landing')} />;
    if (view === 'privacy') return <PrivacyPolicyPage onBack={() => navigateTo(user ? 'dashboard' : 'landing')} />;
    if (view === 'terms') return <TermsOfServicePage onBack={() => navigateTo(user ? 'dashboard' : 'landing')} />;
    if (view === 'refund') return <RefundPolicyPage onBack={() => navigateTo(user ? 'dashboard' : 'landing')} />;
    if (view === 'history' && currentFlowId) return <RunHistory flowId={currentFlowId} onBack={() => navigateTo('editor', currentFlowId!)} />;

    // Admin Console Views
    const adminPageFromView = (v: PageView): AdminPageView => {
        if (v === 'admin-users') return 'users';
        if (v === 'admin-nodes') return 'nodes';
        if (v === 'admin-templates') return 'templates';
        return 'dashboard';
    };

    const handleAdminNavigate = (page: AdminPageView) => {
        const pageMap: Record<AdminPageView, PageView> = {
            'dashboard': 'admin',
            'users': 'admin-users',
            'nodes': 'admin-nodes',
            'templates': 'admin-templates'
        };
        navigateTo(pageMap[page]);
    };

    if (view === 'admin' || view === 'admin-users' || view === 'admin-nodes' || view === 'admin-templates') {
        const currentAdminPage = adminPageFromView(view);
        return (
            <AdminLayout
                activePage={currentAdminPage}
                onNavigate={navigateTo}
                onAdminNavigate={handleAdminNavigate}
            >
                {currentAdminPage === 'dashboard' && <AdminDashboard />}
                {currentAdminPage === 'users' && <AdminUsers />}
                {currentAdminPage === 'nodes' && <AdminNodes />}
                {currentAdminPage === 'templates' && <AdminTemplates />}
            </AdminLayout>
        );
    }

    // --- Editor View ---
    return (
        <div className="flex h-screen w-screen bg-[#f8fafc] text-slate-900 overflow-hidden font-sans">
            <SecretsModal isOpen={showSecrets} onClose={() => setShowSecrets(false)} secrets={secrets} onSave={(s) => { setSecrets(s); localStorage.setItem('flow-secrets-v1', JSON.stringify(s)); }} />
            {showWebhookSettings && (
                <WebhookSettingsModal
                    isOpen={showWebhookSettings}
                    onClose={() => setShowWebhookSettings(false)}
                    settings={webhookSettings}
                    onSave={handleSaveWebhookSettings}
                    flowId={currentFlowId || ''}
                    flowName={currentFlowName}
                />
            )}

            {showPublishTemplateModal && (
                <PublishTemplateModal
                    isOpen={showPublishTemplateModal}
                    onClose={() => setShowPublishTemplateModal(false)}
                    flowId={currentFlowId || ''}
                    flowName={currentFlowName || 'Untitled Workflow'}
                    nodes={nodes}
                    edges={edges}
                />
            )}
            {dialog.isOpen && (
                <Dialog {...dialog} onClose={() => { setDialog(prev => ({ ...prev, isOpen: false })); dialog.onCancel?.(); }} />
            )}
            <AIFlowGenerator
                isOpen={showAIGenerator}
                onClose={() => setShowAIGenerator(false)}
                existingNodes={nodes}
                existingEdges={edges}
                userCredits={credits || 0}
                onDeductCredits={async (amount) => {
                    await storage.deductCredits(amount);
                    const updated = await storage.getUserCredits();
                    setCredits(updated.balance);
                }}
                onGenerate={(generatedNodes, generatedEdges) => {
                    setNodes(normalizeFlowNodes(generatedNodes));
                    setEdges(generatedEdges);
                    setShowAIGenerator(false);
                    setToast('Flow generated and imported! (-10 credits)');
                    setTimeout(() => setToast(null), 3000);
                }}
            />

            {/* Toast Notification */}
            {/* Toast Notification */}
            {toast && (
                <div className="fixed top-20 right-4 z-[100] bg-white border border-slate-200 border-l-4 border-l-brand-600 text-slate-800 px-6 py-4 rounded shadow-2xl text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200 flex items-center gap-2">
                    {toast}
                </div>
            )}

            {/* Deployed Flow Modal */}
            {deployedUrl && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => setDeployedUrl(null)}
                >
                    <div
                        className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-in scale-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-semibold text-slate-900">Flow Published</h3>
                                <p className="text-sm text-slate-500 mt-1">Your workflow is live and ready to share.</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                                <Share2 className="w-5 h-5 text-emerald-600" />
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-8 space-y-6">
                            {/* Run URL */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Run Link</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-600 truncate hover:border-slate-300 transition-colors">
                                        {deployedUrl}
                                    </div>
                                    <button
                                        onClick={handleCopyDeployUrl}
                                        className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
                                    >
                                        Copy
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400">Public link to execute this workflow.</p>
                            </div>

                            {/* View URL */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Share Link</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-600 truncate hover:border-slate-300 transition-colors">
                                        {deployedUrl.replace('/public/', '/published/')}
                                    </div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(deployedUrl.replace('/public/', '/published/'));
                                            showToast('View link copied');
                                        }}
                                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                        Copy
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400">Share with others to view and duplicate.</p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-4 bg-slate-50/50 border-t border-slate-50 flex justify-end">
                            <button
                                onClick={() => setDeployedUrl(null)}
                                className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors px-4 py-2"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showVersions && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg">Version History</h3>
                            <button onClick={() => setShowVersions(false)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="max-h-96 overflow-y-auto space-y-2">
                            <button onClick={() => { if (currentFlowId) storage.getFlowById(currentFlowId).then(f => f?.versions && setVersions(f.versions)); }} className="text-xs text-brand-600 mb-2">Refresh</button>
                            {versions.length === 0 && <p className="text-slate-400 text-sm">No snapshots found.</p>}
                            {versions.map(v => (
                                <div key={v.id} className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-100">
                                    <div>
                                        <div className="font-bold text-sm">{v.name}</div>
                                        <div className="text-xs text-slate-500">{new Date(v.timestamp).toLocaleString()}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => restoreVersion(v)} className="text-xs bg-white border border-slate-200 px-3 py-1 rounded hover:bg-slate-50 font-medium">Restore</button>
                                        <button onClick={() => deleteSnapshot(v.id)} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete Snapshot"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {showAuthModal && (
                <AuthModal
                    onLogin={() => { }}
                    onSkip={() => { setShowAuthModal(false); }}
                />
            )}

            <Sidebar onBack={() => navigateTo('dashboard')} onAddNode={handleAddNode} />

            <div className="flex-1 relative flex flex-col h-full">
                {/* Toolbar */}
                <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-10 shadow-sm">
                    {/* Left: Flow Info */}
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                            {/* Editable Title */}
                            <input
                                value={currentFlowName}
                                onChange={(e) => setCurrentFlowName(e.target.value)}
                                className="text-xl font-bold text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0 w-[200px] truncate placeholder-slate-400"
                                placeholder="Untitled Flow"
                            />
                            <div className="flex items-center gap-2 text-[10px] font-mono">
                                <span className={currentFlowId ? "text-emerald-600" : "text-amber-500"}>
                                    {currentFlowId ? '● Saved' : '○ Draft'}
                                </span>
                                <span className="text-slate-400">|</span>
                                <div className="flex items-center gap-1 text-slate-500" title={`This flow costs ~${flowCreditCost} credits to run`}>
                                    <Zap className="w-3 h-3 text-amber-500" />
                                    <span>~{flowCreditCost} credits/run</span>
                                </div>
                                <span className="text-slate-400">|</span>
                                <div className="flex items-center gap-1 text-slate-500">
                                    <Coins className="w-3 h-3 text-yellow-500" />
                                    <span>{credits.toLocaleString()} balance</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                        {/* Home Link */}
                        <button
                            onClick={() => navigateTo('dashboard')}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
                            title="Back to Home"
                        >
                            <Home className="w-4 h-4" />
                            <span className="hidden sm:inline">Home</span>
                        </button>

                        <div className="h-5 w-px bg-slate-200 mx-0.5" />

                        {/* BYOK Toggle & Secrets Link */}
                        <div className="flex items-center gap-1.5" title="Bring Your Own Keys">
                            <span className="text-[10px] font-bold text-slate-500 tracking-wider">BYOK</span>
                            <div className="flex items-center bg-slate-100 rounded-full p-0.5 border border-slate-200">
                                <button
                                    onClick={() => {
                                        setIsBYOK(!isBYOK);
                                        if (!isBYOK) showToast('BYOK Enabled: Using your own API keys.');
                                        else showToast('Platform Mode: Using standard keys.');
                                    }}
                                    className={clsx(
                                        "relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-brand-500 focus:ring-offset-1",
                                        isBYOK ? "bg-brand-500" : "bg-slate-300"
                                    )}
                                >
                                    <span
                                        className={clsx(
                                            "inline-block h-3 w-3 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm",
                                            isBYOK ? "translate-x-4" : "translate-x-0.5"
                                        )}
                                    />
                                </button>
                                {/* Integrated Secrets Button */}
                                {isBYOK && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowSecrets(true); }}
                                        className="ml-1 p-0.5 text-slate-400 hover:text-brand-600 transition-colors rounded-full hover:bg-white"
                                        title="Manage Secrets"
                                    >
                                        <Lock className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="h-5 w-px bg-slate-200 mx-0.5" />

                        {/* Undo/Redo */}
                        <div className="flex items-center gap-0.5">
                            <button
                                onClick={undo}
                                disabled={past.length === 0}
                                className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg disabled:opacity-30 transition-colors hover:bg-slate-100"
                                title="Undo (Ctrl+Z)"
                            >
                                <Undo className="w-4 h-4" />
                            </button>
                            <button
                                onClick={redo}
                                disabled={future.length === 0}
                                className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg disabled:opacity-30 transition-colors hover:bg-slate-100"
                                title="Redo (Ctrl+Y)"
                            >
                                <Redo className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="h-5 w-px bg-slate-200 mx-0.5" />

                        {/* Icon Actions */}
                        <button
                            onClick={() => window.open('/docs', '_blank')}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                            title="Documentation"
                        >
                            <BookOpen className="w-4 h-4" />
                        </button>

                        {/* More Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <MoreHorizontal className="w-5 h-5" />
                            </button>

                            {showMenu && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-50 duration-200">
                                    <button
                                        onClick={() => { setShowMenu(false); setShowTemplates(true); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                    >
                                        <LayoutGrid className="w-4 h-4" />
                                        Load Templates
                                    </button>
                                    <button
                                        onClick={() => { setShowMenu(false); setShowAIGenerator(true); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                    >
                                        <Sparkles className="w-4 h-4 text-brand-500" />
                                        Generate with AI
                                    </button>
                                    <div className="h-px bg-slate-100 my-1" />
                                    <button
                                        onClick={() => { setShowMenu(false); navigateTo('history', currentFlowId || undefined); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                        disabled={!currentFlowId}
                                    >
                                        <TrendingUp className="w-4 h-4" />
                                        Run History
                                    </button>
                                    <button
                                        onClick={() => { setShowMenu(false); setShowVersions(true); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                    >
                                        <History className="w-4 h-4" />
                                        Version History
                                    </button>
                                    <button
                                        onClick={() => { setShowMenu(false); handleSnapshot(); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                    >
                                        <Camera className="w-4 h-4" />
                                        Save Snapshot
                                    </button>
                                    <div className="h-px bg-slate-100 my-1" />
                                    <button
                                        onClick={() => { setShowMenu(false); handleImportClick(); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Import JSON
                                    </button>
                                    <button
                                        onClick={() => { setShowMenu(false); handleExport(); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                    >
                                        <Download className="w-4 h-4" />
                                        Export JSON
                                    </button>
                                    <div className="h-px bg-slate-100 my-1" />
                                    <button
                                        onClick={() => { setShowMenu(false); setShowPublishTemplateModal(true); }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                    >
                                        <Share2 className="w-4 h-4" />
                                        Publish as Template
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowMenu(false);
                                            navigateTo('settings');
                                        }}
                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                                    >
                                        <Settings className="w-4 h-4" />
                                        Settings & Usage
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="h-6 w-px bg-slate-200 mx-1" />

                        {/* Primary Actions */}
                        <div className="flex items-center gap-2">
                            {/* Webhook (Smaller) */}
                            <button
                                onClick={() => setShowWebhookSettings(true)}
                                className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                                title="Webhook Settings"
                            >
                                <Radio className="w-4 h-4" />
                            </button>

                            <button
                                onClick={handleSaveFlow}
                                data-save-btn="true"
                                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm text-sm"
                            >
                                <Save className="w-4 h-4" />
                                <span className="hidden sm:inline">Save</span>
                            </button>

                            <button
                                onClick={handleDeploy}
                                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium rounded-lg hover:bg-emerald-100 hover:border-emerald-300 transition-all shadow-sm text-sm"
                            >
                                <Share2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Deploy</span>
                            </button>

                            <button
                                onClick={handleRunWorkflow}
                                disabled={isRunning}
                                className={clsx(
                                    "flex items-center gap-2 px-4 py-1.5 text-white font-medium rounded-lg transition-all shadow-sm text-sm",
                                    isRunning
                                        ? "bg-slate-400 cursor-not-allowed"
                                        : "bg-brand-600 hover:bg-brand-700 hover:shadow-brand-500/25 active:transform active:scale-95"
                                )}
                            >
                                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                                <span>Run</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Canvas */}
                <div className="flex-1 relative" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                        onPaneClick={() => setSelectedNodeId(null)}
                        nodeTypes={nodeTypesMemo} // Using Memoized
                        edgeTypes={edgeTypesMemo} // Using Memoized
                        proOptions={{ hideAttribution: true }}
                        className="bg-slate-50"
                        minZoom={0.1}
                        maxZoom={2}
                        defaultEdgeOptions={{
                            type: 'custom',
                            animated: true,
                            style: { stroke: '#94a3b8', strokeWidth: 2 }
                        }}
                    >
                        <Background color="#e2e8f0" gap={16} size={2.2} />
                        <Controls className="bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden !m-4" />
                        <MiniMap
                            nodeColor={(n: any) => {
                                if (n.type === 'start') return '#10b981';
                                if (n.type === 'end') return '#ef4444';
                                return '#6366f1';
                            }}
                            className="!m-4 border border-slate-200 shadow-xl rounded-lg overflow-hidden bg-white/90"
                        />
                        {showTemplates && (
                            <div
                                className="absolute inset-0 bg-black/10 z-40"
                                onClick={() => setShowTemplates(false)}
                            >
                                <div
                                    className="absolute top-4 right-4 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-200"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex justify-between items-center px-2 py-1 mb-2">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Load Template</div>
                                        <button onClick={() => setShowTemplates(false)}><X className="w-3 h-3 text-slate-400" /></button>
                                    </div>
                                    <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                                        {Object.entries(editorTemplates).map(([key, t]) => (
                                            <button key={key} onClick={() => loadTemplate(key)} className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg transition-colors group mb-1">
                                                <div className="text-xs font-bold text-slate-700 group-hover:text-brand-600">{t.name}</div>
                                                <div className="text-[10px] text-slate-500 leading-tight line-clamp-1">{t.description}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </ReactFlow>

                    {/* Floating AI Generator Button */}
                    <button
                        onClick={() => setShowAIGenerator(true)}
                        className="absolute bottom-4 left-4 w-12 h-12 flex items-center justify-center bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white rounded-full shadow-lg shadow-brand-500/30 transition-all hover:scale-110 z-20"
                        title="Generate workflow with AI"
                        aria-label="Open AI Flow Generator"
                    >
                        <Sparkles className="w-5 h-5" />
                    </button>

                    <PropertyPanel
                        selectedNode={nodes.find(n => n.id === selectedNodeId) || null}
                        onUpdateNode={handleUpdateNode}
                        onDeleteNode={handleDeleteNode}
                        onClose={() => setSelectedNodeId(null)}
                        isBYOK={isBYOK}
                        secrets={secrets}
                        onSaveSecrets={(updatedSecrets) => { setSecrets(updatedSecrets); localStorage.setItem('flow-secrets-v1', JSON.stringify(updatedSecrets)); }}
                        flowId={currentFlowId}
                    />
                </div>
            </div>
        </div>
    );
}
