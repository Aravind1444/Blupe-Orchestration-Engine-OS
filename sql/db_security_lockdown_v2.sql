-- =============================================================================
-- BLUPE SECURITY LOCKDOWN V2
-- =============================================================================
-- Apply in Supabase SQL Editor after review.
--
-- DEPLOY ORDER (production):
--  1. Deploy app/Netlify/Edge code that calls admin_update_user & payments JWT
--     OR accept temporary admin-update breakage until code is live.
--  2. Run THIS script in Supabase.
--  3. Smoke-test: login, credit load, LLM run, public flow, Pro payment path,
--     admin user edit, webhook/cron if used.
--
-- Prerequisites (must already exist or script will error):
--  - public.is_admin()  (from db_admin_migration.sql)
--  - public.flow_charges_log (from db_security_remediation.sql)
--  - public.processed_payments (from db_security_remediation.sql)
--  - flows.is_published / flows.is_public columns
--
-- Goals:
--  1. Stop cross-user wallet drains via DEFINER RPCs
--  2. Stop self-service privilege / balance / tier forgery via direct UPDATEs
--  3. Harden public-flow charging (fail on insufficient credits)
--  4. Admin-only user update RPC
--  5. Tighten run_history / paused_executions exposure
--
-- Trusted RPCs set: SELECT set_config('blupe.allow_credit_write', 'on', true);
-- so they can mutate billing columns. Direct client DML cannot.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: mark current transaction as trusted for credit column writes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._allow_credit_write()
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('blupe.allow_credit_write', 'on', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 1. protect_user_credits_columns trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_user_credits_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
    v_allow TEXT;
BEGIN
    v_role := COALESCE(auth.role(), '');
    v_allow := COALESCE(current_setting('blupe.allow_credit_write', true), '');

    -- service_role JWT or explicit trusted RPC flag
    IF v_role = 'service_role' OR v_allow = 'on' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Clients may only change profile-ish fields
        NEW.balance := OLD.balance;
        NEW.tier := OLD.tier;
        NEW.is_admin := OLD.is_admin;
        NEW.flow_limit := OLD.flow_limit;
        NEW.subscription_end_date := OLD.subscription_end_date;
        -- Optional columns (may be absent on older DBs — use to_jsonb)
        IF to_jsonb(NEW) ? 'plan_type' AND to_jsonb(OLD) ? 'plan_type' THEN
            NEW.plan_type := OLD.plan_type;
        END IF;
        IF to_jsonb(NEW) ? 'last_reset_date' AND to_jsonb(OLD) ? 'last_reset_date' THEN
            NEW.last_reset_date := OLD.last_reset_date;
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        -- Non-trusted inserts cannot create pro/admin wallets
        NEW.is_admin := false;
        NEW.tier := 'starter';
        NEW.flow_limit := LEAST(COALESCE(NEW.flow_limit, 10), 10);
        NEW.balance := LEAST(COALESCE(NEW.balance, 500), 500);
        NEW.subscription_end_date := NULL;
        IF to_jsonb(NEW) ? 'plan_type' THEN
            NEW.plan_type := 'starter';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_user_credits ON public.user_credits;
CREATE TRIGGER trg_protect_user_credits
    BEFORE INSERT OR UPDATE ON public.user_credits
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_user_credits_columns();

-- ---------------------------------------------------------------------------
-- 2. deduct_credits_v2: only self or service_role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_credits_v2(p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_balance INTEGER;
    v_role TEXT;
BEGIN
    PERFORM public._allow_credit_write();

    v_role := COALESCE(auth.role(), '');
    IF v_role IS DISTINCT FROM 'service_role' THEN
        IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
            RAISE EXCEPTION 'Unauthorized credit deduction';
        END IF;
    END IF;

    IF p_amount IS NULL OR p_amount < 0 THEN
        RETURN FALSE;
    END IF;

    SELECT balance INTO v_balance
    FROM public.user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_balance IS NULL OR v_balance < p_amount THEN
        RETURN FALSE;
    END IF;

    UPDATE public.user_credits
    SET balance = balance - p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.deduct_credits_v2(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_credits_v2(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits_v2(UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Legacy deduct_credits — keep BOTH signatures production uses:
--    (amount)              → client: services/supabase.ts
--    (uid, amount)         → Edge/workflow-runner: service role passes owner uid
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_credits(amount INTEGER)
RETURNS VOID AS $$
DECLARE
    current_balance INTEGER;
BEGIN
    PERFORM public._allow_credit_write();

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT balance INTO current_balance
    FROM public.user_credits
    WHERE user_id = auth.uid()
    FOR UPDATE;

    IF current_balance IS NULL THEN
        INSERT INTO public.user_credits (user_id, balance)
        VALUES (auth.uid(), GREATEST(0, 500 - amount));
    ELSE
        UPDATE public.user_credits
        SET balance = GREATEST(0, balance - amount),
            updated_at = NOW()
        WHERE user_id = auth.uid();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Two-arg overload used by execute-flow / workflow-runner
CREATE OR REPLACE FUNCTION public.deduct_credits(uid UUID, amount INTEGER)
RETURNS VOID AS $$
DECLARE
    current_balance INTEGER;
    v_role TEXT;
BEGIN
    PERFORM public._allow_credit_write();

    v_role := COALESCE(auth.role(), '');
    -- service_role may debit any user; authenticated only self
    IF v_role IS DISTINCT FROM 'service_role' THEN
        IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM uid THEN
            RAISE EXCEPTION 'Unauthorized credit deduction';
        END IF;
    END IF;

    IF amount IS NULL OR amount < 0 THEN
        RETURN;
    END IF;

    SELECT balance INTO current_balance
    FROM public.user_credits
    WHERE user_id = uid
    FOR UPDATE;

    IF current_balance IS NULL THEN
        INSERT INTO public.user_credits (user_id, balance)
        VALUES (uid, GREATEST(0, 500 - amount));
    ELSE
        -- Preserve historical GREATEST(0, ...) behavior for edge runs
        UPDATE public.user_credits
        SET balance = GREATEST(0, balance - amount),
            updated_at = NOW()
        WHERE user_id = uid;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.deduct_credits(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(UUID, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. charge_flow_owner: published/public/owner; fail if insufficient
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.charge_flow_owner(p_flow_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
DECLARE
    v_owner_id UUID;
    v_is_published BOOLEAN;
    v_daily_run_cap INTEGER;
    v_runs_today INTEGER;
    v_flow_content JSONB;
    v_balance INTEGER;
    v_role TEXT;
BEGIN
    PERFORM public._allow_credit_write();

    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'Invalid charge amount';
    END IF;

    SELECT user_id, content,
           COALESCE(is_published, false)
    INTO v_owner_id, v_flow_content, v_is_published
    FROM public.flows
    WHERE id = p_flow_id;

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Flow not found';
    END IF;

    v_role := COALESCE(auth.role(), '');
    IF v_role IS DISTINCT FROM 'service_role' THEN
        IF NOT (v_is_published OR auth.uid() = v_owner_id) THEN
            RAISE EXCEPTION 'Unauthorized flow charge';
        END IF;
    END IF;

    IF v_flow_content IS NOT NULL AND (v_flow_content->'settings'->>'dailyRunCap') IS NOT NULL THEN
        v_daily_run_cap := (v_flow_content->'settings'->>'dailyRunCap')::INTEGER;
    ELSE
        v_daily_run_cap := 100;
    END IF;

    SELECT COUNT(*) INTO v_runs_today
    FROM public.flow_charges_log
    WHERE flow_id = p_flow_id
      AND created_at >= NOW() - INTERVAL '24 hours';

    IF v_runs_today >= v_daily_run_cap THEN
        RAISE EXCEPTION 'Daily execution limit of % runs reached for this public flow', v_daily_run_cap;
    END IF;

    SELECT balance INTO v_balance
    FROM public.user_credits
    WHERE user_id = v_owner_id
    FOR UPDATE;

    IF v_balance IS NULL OR v_balance < p_amount THEN
        RAISE EXCEPTION 'Owner has insufficient credits';
    END IF;

    INSERT INTO public.flow_charges_log (flow_id, amount)
    VALUES (p_flow_id, p_amount);

    UPDATE public.user_credits
    SET balance = balance - p_amount,
        updated_at = NOW()
    WHERE user_id = v_owner_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.charge_flow_owner(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_flow_owner(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_flow_owner(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.charge_flow_owner(UUID, INTEGER) TO anon;

-- ---------------------------------------------------------------------------
-- 5. process_razorpay_payment — insert-first idempotency + trusted write
-- ---------------------------------------------------------------------------
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
    v_current_balance INTEGER;
    v_subscription_end TIMESTAMPTZ;
BEGIN
    PERFORM public._allow_credit_write();

    BEGIN
        INSERT INTO public.processed_payments (payment_id, order_id, user_id, amount, plan)
        VALUES (p_payment_id, p_order_id, p_user_id, p_amount, p_plan);
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment already processed', 'code', 'DUPLICATE');
    END;

    v_subscription_end := NOW() + INTERVAL '30 days';

    SELECT balance INTO v_current_balance
    FROM public.user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        INSERT INTO public.user_credits (user_id, balance, tier, flow_limit, subscription_end_date, updated_at)
        VALUES (p_user_id, p_credits_to_add, 'pro', 50, v_subscription_end, NOW());
        v_current_balance := 0;
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
    RAISE EXCEPTION 'Payment processing transaction failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.process_razorpay_payment(TEXT, TEXT, UUID, INTEGER, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_razorpay_payment(TEXT, TEXT, UUID, INTEGER, TEXT, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Patch common credit RPCs to set trusted write flag
--    (definitions may already exist — we only re-wrap if present via DO block
--     for reset_monthly_credits and handle_new_user)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- reset_monthly_credits(uid uuid) — best-effort patch if exists
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'reset_monthly_credits'
    ) THEN
        EXECUTE $fn$
        CREATE OR REPLACE FUNCTION public.reset_monthly_credits(uid UUID)
        RETURNS VOID AS $body$
        DECLARE
            v_tier TEXT;
            v_sub_end TIMESTAMPTZ;
            v_amount INTEGER;
        BEGIN
            PERFORM public._allow_credit_write();
            SELECT tier, subscription_end_date INTO v_tier, v_sub_end
            FROM public.user_credits WHERE user_id = uid;

            -- Active Pro: credits come from subscription.charged / payment-verify — do not wipe
            IF v_tier = 'pro' AND v_sub_end IS NOT NULL AND v_sub_end > NOW() THEN
                UPDATE public.user_credits
                SET last_reset_date = NOW(),
                    updated_at = NOW()
                WHERE user_id = uid;
                RETURN;
            END IF;

            v_amount := CASE WHEN v_tier = 'enterprise' THEN 50000 ELSE 500 END;
            UPDATE public.user_credits
            SET balance = v_amount,
                last_reset_date = NOW(),
                updated_at = NOW()
            WHERE user_id = uid;
        END;
        $body$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
        $fn$;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Admin update user RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user(
    p_user_id UUID,
    p_tier TEXT DEFAULT NULL,
    p_balance INTEGER DEFAULT NULL,
    p_flow_limit INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin privileges required';
    END IF;

    PERFORM public._allow_credit_write();

    UPDATE public.user_credits
    SET
        tier = COALESCE(p_tier, tier),
        balance = COALESCE(p_balance, balance),
        flow_limit = COALESCE(p_flow_limit, flow_limit),
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.admin_update_user(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Server-side subscription expiry (self)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_and_expire_subscription()
RETURNS JSONB AS $$
DECLARE
    v_row public.user_credits%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_row FROM public.user_credits WHERE user_id = auth.uid();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('tier', 'starter', 'balance', 0);
    END IF;

    IF v_row.tier = 'pro'
       AND v_row.subscription_end_date IS NOT NULL
       AND v_row.subscription_end_date < NOW() THEN
        PERFORM public._allow_credit_write();
        UPDATE public.user_credits
        SET tier = 'starter',
            flow_limit = 10,
            subscription_end_date = NULL,
            updated_at = NOW()
        WHERE user_id = auth.uid();

        RETURN jsonb_build_object(
            'tier', 'starter',
            'balance', v_row.balance,
            'flow_limit', 10,
            'expired', true
        );
    END IF;

    RETURN jsonb_build_object(
        'tier', v_row.tier,
        'balance', v_row.balance,
        'flow_limit', v_row.flow_limit,
        'subscription_end_date', v_row.subscription_end_date,
        'expired', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.check_and_expire_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_expire_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_expire_subscription() TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Profile-only update helper
--    Keep argument NAMES compatible with client:
--    supabase.rpc('update_user_profile', { handle, full_name, avatar_url })
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_profile(
    handle TEXT DEFAULT NULL,
    full_name TEXT DEFAULT NULL,
    avatar_url TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Profile fields only — no _allow_credit_write needed
    -- (trigger allows profile columns; privileged columns stay locked)
    -- Qualify args as update_user_profile.* to avoid column name shadowing
    UPDATE public.user_credits AS uc
    SET
        full_name = COALESCE(update_user_profile.full_name, uc.full_name),
        avatar_url = COALESCE(update_user_profile.avatar_url, uc.avatar_url),
        handle = COALESCE(update_user_profile.handle, uc.handle),
        updated_at = NOW()
    WHERE uc.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.update_user_profile(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_profile(TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9b. handle_new_user must set trusted write flag or insert is clamped wrong
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public._allow_credit_write();
    INSERT INTO public.user_credits (
        user_id,
        balance,
        tier,
        flow_limit,
        full_name,
        avatar_url
    )
    VALUES (
        NEW.id,
        500,
        'starter',
        10,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1)
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture'
        )
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create user_credits for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 10. run_history / paused_executions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon can insert history" ON public.run_history;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'paused_executions'
    ) THEN
        ALTER TABLE public.paused_executions ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 11. user_secrets security lockdown (RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role has full access" ON public.user_secrets;
CREATE POLICY "service_role has full access" ON public.user_secrets
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own secrets" ON public.user_secrets;
CREATE POLICY "Users can view own secrets" ON public.user_secrets
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own secrets" ON public.user_secrets;
CREATE POLICY "Users can insert own secrets" ON public.user_secrets
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own secrets" ON public.user_secrets;
CREATE POLICY "Users can update own secrets" ON public.user_secrets
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own secrets" ON public.user_secrets;
CREATE POLICY "Users can delete own secrets" ON public.user_secrets
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

