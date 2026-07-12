/**
 * OAuth Service - Manages OAuth connections for third-party integrations
 * 
 * Supports: Google, Slack, HubSpot
 */

import { supabase } from './supabase';

export interface OAuthConnection {
    id: string;
    user_id: string;
    provider: 'google' | 'slack' | 'hubspot' | 'stripe' | 'microsoft';
    access_token: string;
    refresh_token?: string;
    token_expires_at?: string;
    scopes: string[];
    account_email?: string;
    account_name?: string;
    created_at: string;
    updated_at: string;
}

/**
 * Get all OAuth connections for the current user
 */
export async function getConnectedAccounts(): Promise<OAuthConnection[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('oauth_connections')
        .select('*')
        .eq('user_id', user.id);

    if (error) {
        console.error('[OAuth] Error fetching connections:', error);
        return [];
    }

    return data || [];
}

/**
 * Check if a provider is connected
 */
export async function isProviderConnected(provider: string): Promise<boolean> {
    const connections = await getConnectedAccounts();
    return connections.some(c => c.provider === provider);
}

export async function getStripeConnection(): Promise<OAuthConnection | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
        .from('oauth_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'stripe')
        .single();

    return data;
}

/**
 * Get a valid access token for a provider via server (tokens encrypted at rest).
 * Never decrypt OAuth tokens in the browser.
 */
export async function getAccessToken(provider: 'google' | 'slack' | 'hubspot' | 'stripe' | 'microsoft'): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    try {
        const { getAuthHeaders } = await import('./supabase');
        const res = await fetch(
            `${window.location.origin}/api/oauth-token?provider=${encodeURIComponent(provider)}`,
            {
                method: 'GET',
                headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
            }
        );
        if (!res.ok) {
            console.error(`[OAuth] Failed to load token for ${provider}:`, res.status);
            return null;
        }
        const data = await res.json();
        return data.access_token || null;
    } catch (e) {
        console.error(`[OAuth] getAccessToken error for ${provider}:`, e);
        return null;
    }
}

/**
 * Refresh an expired access token
 */
async function refreshToken(provider: string, refreshToken?: string, userId?: string): Promise<string | null> {
    if (!refreshToken) {
        console.log(`[OAuth] No refresh token for ${provider}`);
        return null;
    }

    try {
        const { getAuthHeaders } = await import('./supabase');
        const response = await fetch(`${window.location.origin}/api/oauth-${provider}-refresh`, {
            method: 'POST',
            headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
            console.error(`[OAuth] Token refresh failed for ${provider}`);
            return null;
        }

        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error(`[OAuth] Token refresh error for ${provider}:`, error);
        return null;
    }
}

/**
 * Disconnect a provider
 */
export async function disconnectProvider(provider: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
        .from('oauth_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', provider);

    if (error) {
        console.error(`[OAuth] Error disconnecting ${provider}:`, error);
        return false;
    }

    return true;
}

/**
 * Initiate OAuth flow for a provider
 */
export async function initiateOAuth(provider: 'google' | 'slack' | 'hubspot' | 'stripe' | 'microsoft'): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error('[OAuth] User not logged in');
        return;
    }

    try {
        const { getAuthHeaders } = await import('./supabase');
        const response = await fetch(`${window.location.origin}/api/oauth-${provider}-init`, {
            method: 'POST',
            headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                returnUrl: window.location.href,
            }),
        });

        if (!response.ok) {
            throw new Error(`OAuth init failed: ${response.statusText}`);
        }

        const { authUrl } = await response.json();

        // Redirect to OAuth provider
        window.location.href = authUrl;
    } catch (error) {
        console.error(`[OAuth] Failed to initiate ${provider} OAuth:`, error);
        throw error;
    }
}

/**
 * Get Google access token (convenience wrapper)
 */
export async function getGoogleAccessToken(): Promise<string | null> {
    return getAccessToken('google');
}

/**
 * Get Slack access token (convenience wrapper)
 */
export async function getSlackAccessToken(): Promise<string | null> {
    return getAccessToken('slack');
}

/**
 * Get HubSpot access token (convenience wrapper)
 */
export async function getHubSpotAccessToken(): Promise<string | null> {
    return getAccessToken('hubspot');
}

/**
 * Get Microsoft Graph access token (convenience wrapper)
 */
export async function getMicrosoftAccessToken(): Promise<string | null> {
    return getAccessToken('microsoft');
}
