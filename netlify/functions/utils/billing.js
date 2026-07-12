import { createClient } from '@supabase/supabase-js';
import { getEndpointCost } from './pricing.js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Server-side credit metering check & deduction.
 * Charges user or public flow owner based on context.
 * Bypasses billing if caller is service_role.
 * 
 * @param {object} authResult - Result of requireUser
 * @param {string} endpointName - Name of the proxy endpoint
 * @param {object} requestBody - Payload of the request
 * @returns {object} { allowed: boolean, error?: string, statusCode?: number }
 */
export async function enforceBilling(authResult, endpointName, requestBody) {
  if (authResult.error) {
    return { allowed: false, error: authResult.error, statusCode: 401 };
  }

  const user = authResult.user;
  if (user.id === 'service_role') {
    return { allowed: true }; // Service role (background Edge execution) bypasses billing
  }

  const cost = getEndpointCost(endpointName, requestBody);

  if (user.role === 'flow_owner') {
    // Guest run: deduct credits from flow owner
    // This will also enforce the daily run limit inside the Postgres function!
    try {
      const { error } = await supabase.rpc('charge_flow_owner', {
        p_flow_id: user.flowId,
        p_amount: cost
      });

      if (error) {
        console.warn(`[Billing] Failed to charge owner for public run of flow ${user.flowId}:`, error.message);
        return {
          allowed: false,
          error: 'Daily execution limit reached or owner has insufficient credits.',
          statusCode: 402
        };
      }
      return { allowed: true };
    } catch (err) {
      console.error('[Billing] Error executing charge_flow_owner RPC:', err);
      return { allowed: false, error: 'Billing service error', statusCode: 500 };
    }
  } else {
    // Authenticated user run: deduct credits from caller
    try {
      const { data: success, error } = await supabase.rpc('deduct_credits_v2', {
        p_user_id: user.id,
        p_amount: cost
      });

      if (error || !success) {
        console.warn(`[Billing] Insufficient credits for user ${user.id} on endpoint ${endpointName}`);
        return {
          allowed: false,
          error: 'Insufficient credits. Please upgrade or purchase more credits.',
          statusCode: 402
        };
      }
      return { allowed: true };
    } catch (err) {
      console.error('[Billing] Error executing deduct_credits_v2 RPC:', err);
      return { allowed: false, error: 'Billing service error', statusCode: 500 };
    }
  }
}
