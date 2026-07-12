/**
 * Centralized Data Store with Caching
 * 
 * This eliminates redundant API calls by:
 * 1. Caching data in memory with configurable TTL
 * 2. Providing a single source of truth for app-wide data
 * 3. Supporting subscriptions for reactive updates
 * 4. Smart invalidation on mutations
 */

import { SavedFlow, UserCredits, RunRecord, Secret, UserProfile } from '../types';
import { storage, auth, supabase } from './supabase';
import { getTemplates, Template } from './templates';

// Cache configuration - TTL in milliseconds
const CACHE_TTL = {
    USER_CREDITS: 10000,      // 10 seconds - needs fast refresh for balance display
    FLOWS: 120000,            // 2 minutes - changes on save/delete
    FLOWS_LIST: 120000,       // 2 minutes - lightweight listing
    RUN_HISTORY: 15000,       // 15 seconds - activity logs update frequently
    TEMPLATES: 300000,        // 5 minutes - rarely changes
    SECRETS: 300000,          // 5 minutes - rarely changes
    STATS: 60000,             // 1 minute
};

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

type Subscriber<T> = (data: T) => void;

class DataStore {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private subscribers: Map<string, Set<Subscriber<any>>> = new Map();
    private pendingRequests: Map<string, Promise<any>> = new Map();

    // =========================================================================
    // CORE CACHE METHODS
    // =========================================================================

    private isValid<T>(entry: CacheEntry<T> | undefined): boolean {
        if (!entry) return false;
        return Date.now() - entry.timestamp < entry.ttl;
    }

    private set<T>(key: string, data: T, ttl: number): void {
        this.cache.set(key, { data, timestamp: Date.now(), ttl });
        this.notify(key, data);
    }

    private get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (this.isValid(entry)) {
            return entry!.data as T;
        }
        return null;
    }

    private notify<T>(key: string, data: T): void {
        const subs = this.subscribers.get(key);
        if (subs) {
            subs.forEach(fn => fn(data));
        }
    }

    /**
     * Subscribe to cache updates for a specific key
     */
    subscribe<T>(key: string, callback: Subscriber<T>): () => void {
        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }
        this.subscribers.get(key)!.add(callback);

        // Return unsubscribe function
        return () => {
            this.subscribers.get(key)?.delete(callback);
        };
    }

    /**
     * Invalidate specific cache entry
     */
    invalidate(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Invalidate all entries matching a pattern
     */
    invalidatePattern(pattern: string): void {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Clear entire cache (e.g., on logout)
     */
    clear(): void {
        this.cache.clear();
    }

    // =========================================================================
    // DATA FETCHERS WITH DEDUPLICATION
    // =========================================================================

    /**
     * Fetch with deduplication - prevents multiple simultaneous requests
     */
    private async fetchWithDedup<T>(
        key: string,
        fetcher: () => Promise<T>,
        ttl: number
    ): Promise<T> {
        // Return cached if valid
        const cached = this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        // Return pending request if one exists (deduplication)
        if (this.pendingRequests.has(key)) {
            return this.pendingRequests.get(key) as Promise<T>;
        }

        // Create new request
        const request = fetcher().then(data => {
            this.set(key, data, ttl);
            this.pendingRequests.delete(key);
            return data;
        }).catch(err => {
            this.pendingRequests.delete(key);
            throw err;
        });

        this.pendingRequests.set(key, request);
        return request;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    async getUserCredits(forceRefresh = false): Promise<UserCredits> {
        const key = 'user_credits';
        if (forceRefresh) this.invalidate(key);

        return this.fetchWithDedup(
            key,
            () => storage.getUserCredits(),
            CACHE_TTL.USER_CREDITS
        );
    }

    async getFlowsList(forceRefresh = false): Promise<Partial<SavedFlow>[]> {
        const key = 'flows_list';
        if (forceRefresh) this.invalidate(key);

        return this.fetchWithDedup(
            key,
            () => storage.getFlowsList(),
            CACHE_TTL.FLOWS_LIST
        );
    }

    async getFlows(forceRefresh = false): Promise<SavedFlow[]> {
        const key = 'flows';
        if (forceRefresh) this.invalidate(key);

        return this.fetchWithDedup(
            key,
            () => storage.getFlows(),
            CACHE_TTL.FLOWS
        );
    }

    async getFlowById(id: string, forceRefresh = false): Promise<SavedFlow | null> {
        const key = `flow_${id}`;
        if (forceRefresh) this.invalidate(key);

        return this.fetchWithDedup(
            key,
            () => storage.getFlowById(id),
            CACHE_TTL.FLOWS
        );
    }

    async getGlobalRunHistory(options: { tier?: string; page?: number; pageSize?: number; forceRefresh?: boolean } = {}): Promise<{ records: RunRecord[]; total: number }> {
        const { tier = 'starter', page = 0, pageSize = 20, forceRefresh = false } = options;
        const key = `run_history_${tier}_${page}_${pageSize}`;
        if (forceRefresh) this.invalidate(key);

        return this.fetchWithDedup(
            key,
            () => storage.getGlobalRunHistory({ tier, page, pageSize }),
            CACHE_TTL.RUN_HISTORY
        );
    }

    async getTemplates(forceRefresh = false): Promise<Record<string, Template>> {
        const key = 'templates';
        if (forceRefresh) this.invalidate(key);

        return this.fetchWithDedup(
            key,
            () => getTemplates(),
            CACHE_TTL.TEMPLATES
        );
    }

    async getSecrets(tier?: string): Promise<Secret[]> {
        const key = 'secrets';
        const cached = this.get<Secret[]>(key);
        if (cached !== null) return cached;

        return this.fetchWithDedup(
            key,
            () => storage.getCloudSecrets(tier),
            CACHE_TTL.SECRETS
        );
    }

    async getUser(): Promise<UserProfile | null> {
        const key = 'user';
        const cached = this.get<UserProfile | null>(key);
        if (cached !== null) return cached;

        return this.fetchWithDedup(
            key,
            () => auth.getUser(),
            CACHE_TTL.USER_CREDITS
        );
    }

    async getDashboardStats(forceRefresh = false) {
        const key = 'dashboard_stats';
        if (forceRefresh) this.invalidate(key);
        return this.fetchWithDedup(
            key,
            () => storage.getDashboardStats(),
            CACHE_TTL.STATS
        );
    }

    // =========================================================================
    // MUTATION HELPERS (invalidate relevant caches after writes)
    // =========================================================================

    async saveFlow(flow: SavedFlow): Promise<void> {
        await storage.saveFlow(flow);
        // Invalidate flows cache
        this.invalidate('flows');
        this.invalidate('flows_list');
        this.invalidate(`flow_${flow.id}`);
    }

    async deleteFlow(id: string): Promise<void> {
        await storage.deleteFlow(id);
        this.invalidate('flows');
        this.invalidate('flows_list');
        this.invalidate(`flow_${id}`);
    }

    async saveFlowVersion(flowId: string, version: any, tier: string): Promise<void> {
        await storage.saveFlowVersion(flowId, version, tier);
        this.invalidate(`flow_${flowId}`);
    }

    async deleteFlowVersion(flowId: string, versionId: string): Promise<void> {
        await storage.deleteFlowVersion(flowId, versionId);
        this.invalidate(`flow_${flowId}`);
    }

    async deductCredits(amount: number): Promise<void> {
        await storage.deductCredits(amount);
        this.invalidate('user_credits');
    }

    async saveRunHistory(run: RunRecord & { creditsUsed?: number; ownerId?: string }): Promise<void> {
        await storage.saveRunHistory(run);
        this.invalidate('run_history');
        this.invalidate('user_credits'); // Credits may have changed
    }

    // =========================================================================
    // BATCH LOADING FOR PAGES
    // =========================================================================

    /**
     * Load all data needed for Dashboard in parallel
     */
    async loadDashboardData(forceRefresh = false) {
        const [flowsList, credits, templates, stats] = await Promise.all([
            this.getFlowsList(forceRefresh),
            this.getUserCredits(forceRefresh),
            this.getTemplates(),
            this.getDashboardStats(forceRefresh)
        ]);
        return { flowsList, credits, templates, stats };
    }

    /**
     * Load all data needed for Settings page in parallel
     */
    async loadSettingsData(options: { historyPage?: number } = {}) {
        const { historyPage = 0 } = options;
        const [user, credits] = await Promise.all([
            this.getUser(),
            this.getUserCredits()
        ]);
        // Pass tier for retention filtering
        const [historyResult, secrets, stats] = await Promise.all([
            this.getGlobalRunHistory({ tier: credits.tier, page: historyPage }),
            this.getSecrets(credits.tier),
            this.getDashboardStats()
        ]);
        return {
            user,
            credits,
            history: historyResult.records,
            historyTotal: historyResult.total,
            secrets,
            stats
        };
    }
}

// Singleton instance
export const dataStore = new DataStore();

// Clear cache on auth state change (logout)
supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
        dataStore.clear();
    }
});
