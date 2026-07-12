
// ... imports
import { createClient } from '@supabase/supabase-js';
import { SavedFlow, UserProfile, RunRecord, FlowVersion, Secret, UserCredits } from '../types';
import { isBuiltInNodeType } from './nodeContract';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// AUTH CACHING - Reduces redundant auth.getUser() calls
// ============================================================================
let cachedAuthUser: any = null;
let authCacheTimestamp = 0;
const AUTH_CACHE_TTL = 30000; // 30 seconds

/**
 * Get authenticated user with caching to avoid repeated API calls.
 * Cache is invalidated after 30 seconds or on auth state change.
 */
const getCachedAuthUser = async () => {
    const now = Date.now();
    if (cachedAuthUser && (now - authCacheTimestamp) < AUTH_CACHE_TTL) {
        return cachedAuthUser;
    }
    const { data: { user } } = await supabase.auth.getUser();
    cachedAuthUser = user;
    authCacheTimestamp = now;
    return user;
};

// Invalidate cache on auth state changes
supabase.auth.onAuthStateChange(() => {
    cachedAuthUser = null;
    authCacheTimestamp = 0;
});

export const auth = {
    signInWithGoogle: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) throw error;
    },

    signUpWithEmail: async (email: string, password: string, fullName?: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName || email.split('@')[0]
                }
            }
        });
        if (error) throw error;
        return data;
    },

    signInWithEmail: async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        return data;
    },

    signOut: async () => {
        await supabase.auth.signOut();
    },
    getUser: async (): Promise<UserProfile | null> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        return {
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.user_metadata?.name,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture
        };
    },
    onAuthStateChange: (callback: (user: UserProfile | null) => void) => {
        return supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                callback({
                    id: session.user.id,
                    email: session.user.email || '',
                    full_name: session.user.user_metadata?.full_name,
                    avatar_url: session.user.user_metadata?.avatar_url
                });
            } else {
                callback(null);
            }
        });
    }
};

export async function getAuthHeaders(headers: Record<string, string> = {}): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (token) {
        return {
            ...headers,
            'Authorization': `Bearer ${token}`
        };
    }
    return headers;
}

export const storage = {
    getUserCredits: async (): Promise<UserCredits> => {
        const user = await getCachedAuthUser();
        if (!user) {
            // Guest user: Use session storage for in-memory credit tracking
            const guestCredits = sessionStorage.getItem('guest_credits');
            const balance = guestCredits ? parseInt(guestCredits, 10) : 20;
            return { balance, tier: 'starter', flow_limit: 10 }; // Guest gets 20 simulated credits
        }

        const { data } = await supabase.from('user_credits').select('*').eq('user_id', user.id).single();

        // If profile info is missing in DB but exists in Auth, sync it lazily
        if (data && (!data.full_name || !data.avatar_url)) {
            const updates: any = {};
            if (!data.full_name && user.user_metadata?.full_name) updates.full_name = user.user_metadata.full_name;
            if (!data.avatar_url && user.user_metadata?.avatar_url) updates.avatar_url = user.user_metadata.avatar_url;

            if (Object.keys(updates).length > 0) {
                await supabase.from('user_credits').update(updates).eq('user_id', user.id);
            }
        }

        if (data) {
            // Credit model:
            //  - Starter: calendar monthly reset to allotment (reset_monthly_credits)
            //  - Active Pro (subscription_end_date in future): credits come from
            //    Razorpay subscription.charged / verify grants — NO calendar reset
            //    (prevents double-grant + wipe of purchased credits)
            const lastReset = data.last_reset_date ? new Date(data.last_reset_date) : new Date(0);
            const now = new Date();
            const isNewMonth = lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear();
            const hasActiveProSub =
                data.tier === 'pro' &&
                data.subscription_end_date &&
                new Date(data.subscription_end_date) > now;

            if (isNewMonth && !hasActiveProSub) {
                console.log("[Credits] New month detected (non-Pro or expired). Resetting credits...");
                await supabase.rpc('reset_monthly_credits', { uid: user.id });
                // Refetch updated data
                const { data: updated } = await supabase.from('user_credits').select('*').eq('user_id', user.id).single();
                if (updated) {
                    return {
                        balance: updated.balance,
                        tier: updated.tier as 'starter' | 'pro' | 'enterprise',
                        flow_limit: updated.flow_limit,
                        full_name: updated.full_name || user.user_metadata?.full_name,
                        avatar_url: updated.avatar_url || user.user_metadata?.avatar_url,
                        handle: updated.handle,
                        last_reset_date: updated.last_reset_date,
                        subscription_end_date: updated.subscription_end_date
                    };
                }
            }

            // Check for subscription expiration via server RPC (cannot forge tier client-side)
            if (data.tier === 'pro' && data.subscription_end_date) {
                const subscriptionEnd = new Date(data.subscription_end_date);
                if (now > subscriptionEnd) {
                    console.log("[Subscription] Pro subscription expired. Requesting server-side downgrade...");
                    const { data: expired } = await supabase.rpc('check_and_expire_subscription');
                    if (expired?.expired) {
                        return {
                            balance: expired.balance ?? data.balance,
                            tier: 'starter' as const,
                            flow_limit: expired.flow_limit ?? 10,
                            full_name: data.full_name || user.user_metadata?.full_name,
                            avatar_url: data.avatar_url || user.user_metadata?.avatar_url,
                            handle: data.handle,
                            last_reset_date: data.last_reset_date
                        };
                    }
                    // RPC not deployed yet — report as starter in UI only (no client write)
                    return {
                        balance: data.balance,
                        tier: 'starter' as const,
                        flow_limit: 10,
                        full_name: data.full_name || user.user_metadata?.full_name,
                        avatar_url: data.avatar_url || user.user_metadata?.avatar_url,
                        handle: data.handle,
                        last_reset_date: data.last_reset_date
                    };
                }
            }

            return {
                balance: data.balance,
                tier: data.tier as 'starter' | 'pro' | 'enterprise',
                flow_limit: data.flow_limit,
                full_name: data.full_name || user.user_metadata?.full_name,
                avatar_url: data.avatar_url || user.user_metadata?.avatar_url,
                handle: data.handle,
                last_reset_date: data.last_reset_date,
                subscription_end_date: data.subscription_end_date
            };
        }

        return { balance: 500, tier: 'starter', flow_limit: 10 };
    },



    /**
     * @deprecated Client-side plan upgrades are disabled for security.
     * Use BillingService.initiateCheckout (Razorpay) which verifies server-side.
     */
    upgradePlan: async (_plan: 'pro') => {
        console.warn('[Credits] upgradePlan is disabled. Use payment checkout instead.');
        throw new Error('Direct plan upgrades are not allowed. Please use the Upgrade button to pay securely.');
    },

    syncSecretsToCloud: async (secrets: Secret[], tier?: string) => {
        const user = await getCachedAuthUser();
        if (!user) return;

        // Use passed tier if available, otherwise fetch
        const userTier = tier || (await storage.getUserCredits()).tier;
        if (userTier === 'starter') {
            throw new Error("Cloud Secret Sync is a Pro feature. Please upgrade.");
        }

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch('/api/secrets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ secrets })
        });
        if (!res.ok) {
            throw new Error(await res.text() || "Failed to sync secrets to cloud.");
        }
    },

    getCloudSecrets: async (tier?: string): Promise<Secret[]> => {
        const user = await getCachedAuthUser();
        if (!user) return [];

        // Use passed tier if available, otherwise fetch
        const userTier = tier || (await storage.getUserCredits()).tier;
        if (userTier === 'starter') return [];

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return [];

        const res = await fetch('/api/secrets', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) return [];
        return await res.json();
    },

    deleteCloudSecrets: async (): Promise<void> => {
        const user = await getCachedAuthUser();
        if (!user) return;

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch('/api/secrets', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!res.ok) {
            throw new Error("Failed to delete cloud secrets.");
        }
    },

    createFlow: async (userId: string, name: string, nodes: any[], edges: any[], options?: any): Promise<SavedFlow> => {
        const flow: SavedFlow = {
            id: crypto.randomUUID(),
            user_id: userId,
            name,
            nodes,
            edges,
            updated_at: Date.now(),
            ...options
        };
        await storage.saveFlow(flow);
        return flow;
    },

    saveFlow: async (flow: SavedFlow): Promise<void> => {
        const user = await getCachedAuthUser();

        if (user) {
            const existingFlows = await storage.getFlows();
            const credits = await storage.getUserCredits();

            const isUpdate = existingFlows.some(f => f.id === flow.id);
            if (!isUpdate && existingFlows.length >= credits.flow_limit) {
                throw new Error(`Flow limit reached (${credits.flow_limit}). Upgrade to Pro for more.`);
            }

            // Fetch existing content to preserve versions
            let versions: FlowVersion[] = [];
            if (isUpdate) {
                const { data: existing } = await supabase.from('flows').select('content').eq('id', flow.id).single();
                if (existing && existing.content && existing.content.versions) {
                    versions = existing.content.versions;
                }
            }

            const { error } = await supabase
                .from('flows')
                .upsert({
                    id: flow.id,
                    user_id: user.id,
                    name: flow.name,
                    content: { nodes: flow.nodes, edges: flow.edges, versions }, // Preserve versions
                    updated_at: new Date().toISOString(),
                    webhook_enabled: flow.webhook_enabled,
                    webhook_api_key: flow.webhook_api_key,
                    webhook_response_mode: flow.webhook_response_mode
                });

            if (error) throw new Error("Failed to save flow to cloud.");
        } else {
            const existing = getLocalFlows();
            const index = existing.findIndex(f => f.id === flow.id);
            if (index >= 0) {
                // Determine existing versions if local
                const old = existing[index];
                if (old.versions) flow.versions = old.versions;
                existing[index] = flow;
            } else {
                existing.push(flow);
            }
            localStorage.setItem('local_flows', JSON.stringify(existing));
        }
    },

    /**
     * Save a flow version with tier-based limits
     * @param tier - User tier: Free gets 3 versions max, Pro gets 10
     */
    saveFlowVersion: async (flowId: string, version: FlowVersion, tier: string = 'starter'): Promise<void> => {
        const user = await getCachedAuthUser();
        if (user) {
            const { data: flow } = await supabase.from('flows').select('content').eq('id', flowId).single();
            if (flow) {
                const content = flow.content;
                let versions = content.versions || [];

                // Enforce tier-based version limits (keep N-1 oldest + new one)
                const maxVersions = tier === 'pro' ? 10 : 3;
                if (versions.length >= maxVersions) {
                    // Remove oldest versions, keep only (maxVersions - 1) to make room for new
                    versions = versions.slice(-(maxVersions - 1));
                }

                versions.push(version);
                content.versions = versions;
                await supabase.from('flows').update({ content }).eq('id', flowId);
            }
        }
    },

    deleteFlowVersion: async (flowId: string, versionId: string): Promise<void> => {
        const user = await getCachedAuthUser();
        if (user) {
            const { data: flow } = await supabase.from('flows').select('content').eq('id', flowId).single();
            if (flow && flow.content?.versions) {
                const versions = flow.content.versions.filter((v: any) => v.id !== versionId);
                const content = { ...flow.content, versions };
                await supabase.from('flows').update({ content }).eq('id', flowId);
            }
        }
    },

    deductCredits: async (amount: number): Promise<void> => {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            // Guest user: Deduct from session storage
            const guestCredits = sessionStorage.getItem('guest_credits');
            const balance = guestCredits ? parseInt(guestCredits, 10) : 20;
            const newBalance = Math.max(0, balance - amount);
            sessionStorage.setItem('guest_credits', String(newBalance));
            console.log(`[Guest Credits] Deducted ${amount}, remaining: ${newBalance}`);
            return;
        }

        // Server RPC only — never fall back to direct balance writes (privilege/balance forgery risk)
        // Legacy signature uses auth.uid(); pass amount only when supported
        let { error } = await supabase.rpc('deduct_credits', { amount: amount });
        if (error) {
            // Older deployments used { uid, amount }
            const retry = await supabase.rpc('deduct_credits', { uid: user.id, amount: amount });
            error = retry.error;
        }
        if (error) {
            console.error("[Credits] RPC deduct_credits failed:", error);
            throw new Error(error.message || 'Failed to deduct credits');
        }
    },

    chargeOwnerCredits: async (flowId: string, amount: number): Promise<void> => {
        const { error } = await supabase.rpc('charge_flow_owner', { p_flow_id: flowId, p_amount: amount });
        if (error) {
            console.error("Failed to charge owner:", error);
            throw new Error(error.message || "Failed to process credits for this flow."); // Propagate error to stop execution
        }
    },

    updateProfile: async (updates: Partial<UserCredits>) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Try RPC first (Bypasses RLS)
        const { error } = await supabase.rpc('update_user_profile', {
            handle: updates.handle,
            full_name: updates.full_name,
            avatar_url: updates.avatar_url
        });

        if (error) {
            console.warn("[Profile] RPC failed, falling back to direct update", error);
            // Fallback: Direct upsert
            const safeUpdates: any = {};
            if (updates.handle !== undefined) safeUpdates.handle = updates.handle;
            if (updates.full_name !== undefined) safeUpdates.full_name = updates.full_name;

            const { error: upsertError } = await supabase.from('user_credits').upsert({
                user_id: user.id,
                ...safeUpdates,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

            if (upsertError) throw new Error("Failed to update profile: " + upsertError.message);
        }
    },

    saveRunHistory: async (run: RunRecord & { creditsUsed?: number, ownerId?: string }): Promise<void> => {
        const { data: { user } } = await supabase.auth.getUser();

        // 1. Logged In User: Save directly (Standard RLS)
        if (user) {
            console.log(`[RunHistory] Saving run for user ${user.id}, flow ${run.flowId}`);
            
            // Verify if flow exists in database to prevent foreign key violations for unsaved local drafts
            const { data: flowExists } = await supabase
                .from('flows')
                .select('id')
                .eq('id', run.flowId)
                .maybeSingle();

            if (!flowExists) {
                console.log(`[RunHistory] Flow ${run.flowId} is not saved to the database yet. Skipping database logging.`);
            } else {
                const { error } = await supabase.from('run_history').insert({
                    flow_id: run.flowId,
                    user_id: user.id,
                    status: run.status,
                    duration: run.duration,
                    credits_used: run.creditsUsed || 10,
                    logs: run.logs
                });

                if (error) {
                    console.error('[RunHistory] Failed to save to Supabase:', error);
                } else {
                    console.log('[RunHistory] Successfully saved to Supabase');
                }
            }
        }
        // 2. Guest User (Public Run): Save via Server API with x-flow-id auth
        else if (run.flowId) {
            try {
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                const res = await fetch(`${baseUrl}/api/run-history`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-flow-id': run.flowId,
                    },
                    body: JSON.stringify({
                        flowId: run.flowId,
                        runData: run
                    })
                });
                if (res.ok) {
                    console.log(`[RunHistory] Saved via Server for public flow: ${run.flowId}`);
                } else {
                    console.error('[RunHistory] Server API returned error:', await res.text());
                }
            } catch (e) {
                console.error("[RunHistory] Failed to save via API", e);
            }
        } else {
            console.warn('[RunHistory] No user and no flowId - run not saved to cloud');
        }


        // Also save locally as backup
        const history = getLocalHistory(run.flowId);
        history.unshift(run);
        localStorage.setItem(`run_history_${run.flowId}`, JSON.stringify(history.slice(0, 50)));
    },

    getDashboardStats: async (): Promise<{ totalRuns: number; successRate: number; creditsUsed: number; topFlows: { id: string; name: string; count: number }[] }> => {
        const user = await getCachedAuthUser();
        if (!user) return { totalRuns: 0, successRate: 0, creditsUsed: 0, topFlows: [] };

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Fetch last 1000 runs for stats
        const { data: runs } = await supabase
            .from('run_history')
            .select('flow_id, flow_name, status, credits_used')
            .eq('user_id', user.id)
            .gte('executed_at', thirtyDaysAgo.toISOString())
            .limit(1000);

        if (!runs || runs.length === 0) return { totalRuns: 0, successRate: 0, creditsUsed: 0, topFlows: [] };

        const totalRuns = runs.length;
        const successRuns = runs.filter(r => r.status === 'completed').length;
        const successRate = Math.round((successRuns / totalRuns) * 100);
        const creditsUsed = runs.reduce((sum, r) => sum + (r.credits_used || 0), 0);

        const flowCounts: Record<string, { name: string; count: number }> = {};
        runs.forEach(r => {
            const id = r.flow_id || 'unknown';
            // Sometimes flow_name might be missing or flow_id null
            if (!flowCounts[id]) {
                flowCounts[id] = { name: r.flow_name || 'Unknown Flow', count: 0 };
            }
            flowCounts[id].count++;
        });

        const topFlows = Object.entries(flowCounts)
            .map(([id, data]) => ({ id, name: data.name, count: data.count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return { totalRuns, successRate, creditsUsed, topFlows };
    },

    getRunHistory: async (flowId: string): Promise<RunRecord[]> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase.from('run_history')
                .select('*')
                .eq('flow_id', flowId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (data && data.length > 0) {
                return data.map((d: any) => ({
                    id: d.id,
                    flowId: d.flow_id,
                    status: d.status,
                    startTime: new Date(d.created_at).getTime(),
                    duration: d.duration,
                    totalCost: d.cost,
                    creditsUsed: d.credits_used,
                    logs: d.logs,
                    triggeredBy: 'Cloud'
                }));
            }
        }
        return getLocalHistory(flowId);
    },

    /**
     * Get run history with tier-based retention and pagination
     * @param options.tier - User tier for retention filtering (pro: 30 days, starter: 3 days)
     * @param options.page - Page number (0-indexed)
     * @param options.pageSize - Records per page (default 20)
     */
    getGlobalRunHistory: async (options: { tier?: string; page?: number; pageSize?: number } = {}): Promise<{ records: RunRecord[]; total: number }> => {
        const user = await getCachedAuthUser();
        if (!user) {
            return { records: [], total: 0 };
        }

        const { tier = 'starter', page = 0, pageSize = 20 } = options;

        // Calculate retention cutoff based on tier
        const retentionDays = tier === 'pro' ? 30 : 3;
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

        // Get total count for pagination
        const { count } = await supabase
            .from('run_history')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('created_at', cutoffDate);

        // Use a single query with embedded join for flow names
        const { data: runData, error: runError } = await supabase
            .from('run_history')
            .select(`
                *,
                flows:flow_id(name)
            `)
            .eq('user_id', user.id)
            .gte('created_at', cutoffDate)
            .order('created_at', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (runError) {
            console.error('[GlobalActivity] Query error:', runError);
            // Fallback: try without join if relationship not set up
            const { data: fallbackData } = await supabase
                .from('run_history')
                .select('*')
                .eq('user_id', user.id)
                .gte('created_at', cutoffDate)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (!fallbackData || fallbackData.length === 0) return { records: [], total: count || 0 };

            return {
                records: fallbackData.map((d: any) => ({
                    id: d.id,
                    flowId: d.flow_id,
                    flowName: 'Workflow',
                    status: d.status,
                    startTime: new Date(d.created_at).getTime(),
                    duration: d.duration,
                    totalCost: d.cost,
                    creditsUsed: d.credits_used,
                    logs: d.logs,
                    triggeredBy: d.triggered_by || 'Manual'
                })),
                total: count || 0
            };
        }

        if (!runData || runData.length === 0) {
            return { records: [], total: count || 0 };
        }

        return {
            records: runData.map((d: any) => ({
                id: d.id,
                flowId: d.flow_id,
                flowName: d.flows?.name || 'Unknown Flow',
                status: d.status,
                startTime: new Date(d.created_at).getTime(),
                duration: d.duration,
                totalCost: d.cost,
                creditsUsed: d.credits_used,
                logs: d.logs,
                triggeredBy: d.triggered_by || 'Manual'
            })),
            total: count || 0
        };
    },

    /**
     * Lightweight version for dashboard listing - only fetches essential fields
     * Avoids transferring full nodes/edges/versions data
     */
    getFlowsList: async (): Promise<Partial<SavedFlow>[]> => {
        const user = await getCachedAuthUser();

        if (user) {
            // Only select essential fields - avoid loading full content JSONB
            const { data, error } = await supabase
                .from('flows')
                .select('id, name, updated_at, content')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false });

            if (data) {
                return data.map((d: any) => ({
                    id: d.id,
                    name: d.name,
                    // Only extract node count for display, not full node data
                    nodes: d.content?.nodes || [],
                    edges: [], // Empty for listing - not needed
                    updated_at: new Date(d.updated_at).getTime()
                }));
            }
        }
        return getLocalFlows();
    },

    getFlows: async (): Promise<SavedFlow[]> => {
        const user = await getCachedAuthUser();

        if (user) {
            const { data, error } = await supabase
                .from('flows')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false });

            if (data) {
                return data.map((d: any) => ({
                    id: d.id,
                    name: d.name,
                    nodes: d.content.nodes,
                    edges: d.content.edges,
                    versions: d.content.versions || [],
                    updated_at: new Date(d.updated_at).getTime(),
                    webhook_enabled: d.webhook_enabled,
                    webhook_api_key: d.webhook_api_key,
                    webhook_response_mode: d.webhook_response_mode
                }));
            }
        }
        return getLocalFlows();
    },

    getFlowById: async (id: string): Promise<SavedFlow | null> => {
        const { data } = await supabase.from('flows').select('*').eq('id', id).single();
        if (data) {
            return {
                id: data.id,
                user_id: data.user_id, // Critical: Needed for billing & logging
                name: data.name,
                nodes: data.content.nodes,
                edges: data.content.edges,
                versions: data.content.versions || [],
                updated_at: new Date(data.updated_at).getTime(),
                webhook_enabled: data.webhook_enabled,
                webhook_api_key: data.webhook_api_key,
                webhook_response_mode: data.webhook_response_mode
            };
        }
        const local = getLocalFlows();
        return local.find(f => f.id === id) || null;
    },

    deleteFlow: async (id: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase.from('flows').delete().eq('id', id);
        }
        const existing = getLocalFlows();
        const filtered = existing.filter(f => f.id !== id);
        localStorage.setItem('local_flows', JSON.stringify(filtered));
    }
};

const getLocalFlows = (): SavedFlow[] => {
    try {
        const raw = localStorage.getItem('local_flows');
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
};

const getLocalHistory = (flowId: string): RunRecord[] => {
    try {
        const raw = localStorage.getItem(`run_history_${flowId}`);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

// ============================================================================
// SCHEDULE MANAGEMENT FUNCTIONS (Server-Side Cron via pg_cron)
// ============================================================================

export interface FlowScheduleResult {
    success: boolean;
    job_id?: number;
    job_name?: string;
    is_active?: boolean;
    cron_expression?: string;
    error?: string;
}

export interface FlowScheduleStatus {
    exists: boolean;
    cron_expression?: string;
    is_active?: boolean;
    last_run_at?: string;
    run_count?: number;
    error_count?: number;
    created_at?: string;
}

/**
 * Create or update a server-side cron schedule for a flow
 * This uses pg_cron + pg_net to invoke the Edge Function on schedule
 */
export async function upsertFlowSchedule(
    flowId: string,
    cronExpression: string,
    isActive: boolean
): Promise<FlowScheduleResult> {
    try {
        const { data, error } = await supabase.rpc('upsert_flow_schedule', {
            p_flow_id: flowId,
            p_cron_expression: cronExpression,
            p_is_active: isActive,
            p_project_url: import.meta.env.VITE_SUPABASE_URL,
            p_api_key: import.meta.env.VITE_SUPABASE_ANON_KEY
        });

        if (error) {
            console.error('[Schedule] Upsert error:', error);
            return { success: false, error: error.message };
        }

        console.log('[Schedule] Upsert result:', data);
        return data as FlowScheduleResult;
    } catch (err: any) {
        console.error('[Schedule] Upsert exception:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Delete a server-side cron schedule for a flow
 * This removes the pg_cron job and the flow_schedules record
 */
export async function deleteFlowSchedule(flowId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { data, error } = await supabase.rpc('delete_flow_schedule', {
            p_flow_id: flowId,
        });

        if (error) {
            console.error('[Schedule] Delete error:', error);
            return { success: false, error: error.message };
        }

        console.log('[Schedule] Deleted schedule for flow:', flowId);
        return data as { success: boolean };
    } catch (err: any) {
        console.error('[Schedule] Delete exception:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Get the current schedule status for a flow
 */
export async function getFlowSchedule(flowId: string): Promise<FlowScheduleStatus> {
    try {
        const { data, error } = await supabase.rpc('get_flow_schedule', {
            p_flow_id: flowId,
        });

        if (error) {
            console.error('[Schedule] Get error:', error);
            return { exists: false };
        }

        return data as FlowScheduleStatus;
    } catch (err: any) {
        console.error('[Schedule] Get exception:', err);
        return { exists: false };
    }
}

// ============================================================================
// ADMIN SERVICE FUNCTIONS
// ============================================================================

export const admin = {
    /**
     * Check if the current user is an admin
     */
    isAdmin: async (): Promise<boolean> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { data } = await supabase
            .from('user_credits')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();

        return data?.is_admin === true;
    },

    /**
     * Get admin analytics dashboard data
     */
    getAnalytics: async (): Promise<any> => {
        const { data, error } = await supabase.rpc('get_admin_analytics');
        if (error) {
            console.error('[Admin] Analytics error:', error);
            throw new Error('Failed to load analytics');
        }
        return data;
    },

    /**
     * Get paginated user list
     */
    getUsers: async (params: { limit?: number; offset?: number; search?: string; tier?: string }): Promise<any> => {
        const { data, error } = await supabase.rpc('get_admin_users', {
            p_limit: params.limit || 50,
            p_offset: params.offset || 0,
            p_search: params.search || null,
            p_tier: params.tier || null
        });
        if (error) {
            console.error('[Admin] Users error:', error);
            throw new Error('Failed to load users');
        }
        return data;
    },

    /**
     * Update a user's tier and/or balance
     */
    updateUser: async (userId: string, updates: { tier?: string; balance?: number; flow_limit?: number }): Promise<void> => {
        // Admin-only SECURITY DEFINER RPC — cannot forge via direct table UPDATE
        const { error } = await supabase.rpc('admin_update_user', {
            p_user_id: userId,
            p_tier: updates.tier ?? null,
            p_balance: updates.balance ?? null,
            p_flow_limit: updates.flow_limit ?? null,
        });

        if (error) {
            console.error('[Admin] Update user error:', error);
            throw new Error('Failed to update user');
        }
    },

    // ========== NODE MANAGEMENT ==========

    /**
     * Get all admin nodes (dynamic node definitions)
     * For sidebar display, only returns active nodes
     */
    getNodes: async (activeOnly: boolean = true): Promise<any[]> => {
        let query = supabase
            .from('admin_nodes')
            .select('*')
            .order('display_name', { ascending: true });

        if (activeOnly) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Admin] Nodes error:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Create a new dynamic node
     */
    createNode: async (node: Omit<any, 'id' | 'created_at' | 'updated_at'>): Promise<any> => {
        if (isBuiltInNodeType(node.node_type)) {
            throw new Error(`"${node.node_type}" is reserved for a built-in node type.`);
        }
        const existingNodes = await admin.getNodes(false);
        if (existingNodes.some(existing => existing.node_type === node.node_type)) {
            throw new Error(`Custom node type "${node.node_type}" already exists.`);
        }

        const { data, error } = await supabase
            .from('admin_nodes')
            .insert(node)
            .select()
            .single();

        if (error) {
            console.error('[Admin] Create node error:', error);
            throw new Error(error.message);
        }
        return data;
    },

    /**
     * Update an existing node
     */
    updateNode: async (id: string, updates: Partial<any>): Promise<any> => {
        if (updates.node_type && isBuiltInNodeType(updates.node_type)) {
            throw new Error(`"${updates.node_type}" is reserved for a built-in node type.`);
        }

        const { data, error } = await supabase
            .from('admin_nodes')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[Admin] Update node error:', error);
            throw new Error(error.message);
        }
        return data;
    },

    /**
     * Delete a node
     */
    deleteNode: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('admin_nodes')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[Admin] Delete node error:', error);
            throw new Error(error.message);
        }
    },

    // ========== TEMPLATE MANAGEMENT ==========

    /**
     * Get all admin templates
     */
    getTemplates: async (includeInactive = true): Promise<any[]> => {
        let query = supabase
            .from('admin_templates')
            .select('*')
            .order('created_at', { ascending: false });

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Admin] Templates error:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Create a new template
     */
    createTemplate: async (template: Omit<any, 'id' | 'created_at' | 'updated_at'>): Promise<any> => {
        const { data, error } = await supabase
            .from('admin_templates')
            .insert(template)
            .select()
            .single();

        if (error) {
            console.error('[Admin] Create template error:', error);
            throw new Error(error.message);
        }
        return data;
    },

    /**
     * Update an existing template
     */
    updateTemplate: async (id: string, updates: Partial<any>): Promise<any> => {
        const { data, error } = await supabase
            .from('admin_templates')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('[Admin] Update template error:', error);
            throw new Error(error.message);
        }
        return data;
    },

    /**
     * Delete a template
     */
    deleteTemplate: async (id: string): Promise<void> => {
        const { error } = await supabase
            .from('admin_templates')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[Admin] Delete template error:', error);
            throw new Error(error.message);
        }
    }
};
