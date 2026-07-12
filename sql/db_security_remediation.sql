-- =============================================================================
-- BLUPE SECURITY REMEDIATION - MIGRATION SCRIPT
-- =============================================================================
-- Run this in the Supabase SQL Editor to apply database changes.
-- =============================================================================

-- 1. Create Processed Payments Table (Idempotency Lock for Razorpay)
CREATE TABLE IF NOT EXISTS public.processed_payments (
    payment_id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    plan TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.processed_payments ENABLE ROW LEVEL SECURITY;

-- No public select/insert policies -> only accessible via Service Role (Admin) key
-- This is secure by default.

-- 2. Create process_razorpay_payment atomic transaction RPC function
CREATE OR REPLACE FUNCTION public.process_razorpay_payment(
    p_payment_id TEXT,
    p_order_id TEXT,
    p_user_id UUID,
    p_amount INTEGER,
    p_plan TEXT,
    p_credits_to_add INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_existing_id TEXT;
    v_current_balance INTEGER;
    v_subscription_end TIMESTAMPTZ;
BEGIN
    -- 1. Check if already processed (Idempotency check)
    SELECT payment_id INTO v_existing_id 
    FROM public.processed_payments 
    WHERE payment_id = p_payment_id;
    
    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment already processed', 'code', 'DUPLICATE');
    END IF;
    
    -- 2. Insert payment record (Locking the payment ID)
    INSERT INTO public.processed_payments (payment_id, order_id, user_id, amount, plan)
    VALUES (p_payment_id, p_order_id, p_user_id, p_amount, p_plan);
    
    -- 3. Fetch current credits balance
    SELECT balance INTO v_current_balance 
    FROM public.user_credits 
    WHERE user_id = p_user_id;
    
    -- Calculate subscription end date (30 days from now)
    v_subscription_end := NOW() + INTERVAL '30 days';
    
    -- 4. Update or Insert user credits and tier
    IF v_current_balance IS NULL THEN
        INSERT INTO public.user_credits (user_id, balance, tier, flow_limit, subscription_end_date, updated_at)
        VALUES (p_user_id, p_credits_to_add, 'pro', 50, v_subscription_end, NOW());
    ELSE
        UPDATE public.user_credits 
        SET balance = balance + p_credits_to_add,
            tier = 'pro',
            flow_limit = 50,
            subscription_end_date = v_subscription_end,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true, 
        'new_balance', COALESCE(v_current_balance, 0) + p_credits_to_add
    );
EXCEPTION WHEN OTHERS THEN
    -- Rollback everything and raise exception
    RAISE EXCEPTION 'Payment processing transaction failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Rate Limiting for Paid Endpoints
CREATE TABLE IF NOT EXISTS public.user_endpoint_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_endpoint_requests 
ON public.user_endpoint_requests(user_id, endpoint, created_at DESC);

ALTER TABLE public.user_endpoint_requests ENABLE ROW LEVEL SECURITY;

-- 4. Create check_user_rate_limit RPC function
CREATE OR REPLACE FUNCTION public.check_user_rate_limit(
    p_user_id UUID,
    p_endpoint TEXT,
    p_max_requests INTEGER,
    p_window_minutes INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Count requests from this user for this endpoint in the time window
    SELECT COUNT(*) INTO v_count
    FROM public.user_endpoint_requests
    WHERE user_id = p_user_id
      AND endpoint = p_endpoint
      AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;

    IF v_count < p_max_requests THEN
        INSERT INTO public.user_endpoint_requests (user_id, endpoint)
        VALUES (p_user_id, p_endpoint);
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.check_user_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_rate_limit TO service_role;

-- 5. Flow charge logging (to prevent guest proxy-calling credit drain bypasses)
CREATE TABLE IF NOT EXISTS public.flow_charges_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_charges_log_flow 
ON public.flow_charges_log(flow_id, created_at DESC);

ALTER TABLE public.flow_charges_log ENABLE ROW LEVEL SECURITY;

-- 6. Hardened charge_flow_owner RPC function with daily run cap checks to prevent wallet-drain
CREATE OR REPLACE FUNCTION public.charge_flow_owner(p_flow_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
DECLARE
    v_owner_id UUID;
    v_daily_run_cap INTEGER;
    v_runs_today INTEGER;
    v_flow_content JSONB;
BEGIN
    -- Get flow owner and content
    SELECT user_id, content INTO v_owner_id, v_flow_content 
    FROM public.flows 
    WHERE id = p_flow_id;
    
    IF v_owner_id IS NOT NULL THEN
        -- Resolve daily cap from flow settings or default to 100 runs
        IF v_flow_content IS NOT NULL AND (v_flow_content->'settings'->>'dailyRunCap') IS NOT NULL THEN
            v_daily_run_cap := (v_flow_content->'settings'->>'dailyRunCap')::INTEGER;
        ELSE
            v_daily_run_cap := 100; -- Default daily cap
        END IF;

        -- Count charges for this flow in the last 24 hours (acts as run count)
        SELECT COUNT(*) INTO v_runs_today 
        FROM public.flow_charges_log 
        WHERE flow_id = p_flow_id 
          AND created_at >= NOW() - INTERVAL '24 hours';
          
        IF v_runs_today >= v_daily_run_cap THEN
            RAISE EXCEPTION 'Daily execution limit of % runs reached for this public flow', v_daily_run_cap;
        END IF;

        -- Log charge
        INSERT INTO public.flow_charges_log (flow_id, amount)
        VALUES (p_flow_id, p_amount);

        -- Deduct credits from owner
        UPDATE public.user_credits 
        SET balance = GREATEST(0, balance - p_amount) 
        WHERE user_id = v_owner_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to service_role and authenticated users
GRANT EXECUTE ON FUNCTION public.charge_flow_owner TO authenticated;
GRANT EXECUTE ON FUNCTION public.charge_flow_owner TO service_role;

-- 7. Create deduct_credits_v2 RPC function for server-side metering
CREATE OR REPLACE FUNCTION public.deduct_credits_v2(p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    SELECT balance INTO v_balance FROM public.user_credits WHERE user_id = p_user_id;
    
    IF v_balance IS NULL THEN
        RETURN FALSE;
    END IF;
    
    IF v_balance < p_amount THEN
        RETURN FALSE;
    END IF;
    
    UPDATE public.user_credits 
    SET balance = balance - p_amount 
    WHERE user_id = p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.deduct_credits_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits_v2 TO service_role;
