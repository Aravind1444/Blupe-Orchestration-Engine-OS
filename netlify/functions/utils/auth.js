import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Validates the Authorization header JWT or Service Key.
 * @param {object} event - Netlify function event object
 * @returns {Promise<{user: object}|{error: string, status: number}>} The user or an error object
 */
export async function requireUser(event) {
    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    const flowId = event.headers['x-flow-id'] || event.headers['X-Flow-Id'] || '';

    if (!authHeader && !flowId) {
        return { error: 'Missing authorization header or flow ID', status: 401 };
    }

    if (authHeader) {
        const token = authHeader.replace('Bearer ', '').trim();
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';
        
        if (
            (serviceRoleKey && token === serviceRoleKey) ||
            (serviceKey && token === serviceKey)
        ) {
            return { user: { id: 'service_role', email: 'service@blupe.space', role: 'service_role' } };
        }

        try {
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (error || !user) {
                return { error: 'Invalid or expired user session', status: 401 };
            }
            return { user };
        } catch (err) {
            return { error: 'Authentication failed', status: 401 };
        }
    }

    // Authenticate via public flow ID (for anonymous guest users running public flows)
    if (flowId) {
        try {
            const { data: flow, error } = await supabase
                .from('flows')
                .select('id, user_id, is_published')
                .eq('id', flowId)
                .single();

            if (error || !flow) {
                return { error: 'Flow not found or access denied', status: 404 };
            }

            if (!flow.is_published) {
                return { error: 'This flow is not published', status: 403 };
            }

            return {
                user: {
                    id: flow.user_id, // Charge to owner
                    role: 'flow_owner',
                    flowId: flow.id
                }
            };
        } catch (err) {
            return { error: 'Flow authentication failed', status: 500 };
        }
    }

    return { error: 'Missing authorization header or flow ID', status: 401 };
}
