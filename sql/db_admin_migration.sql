-- =============================================================================
-- BLUPE ADMIN CONSOLE - DATABASE MIGRATION
-- =============================================================================
-- Run this entire script in your Supabase SQL Editor
-- After running, manually set is_admin = true for your user in user_credits
-- =============================================================================

-- 1. Add is_admin column to user_credits
ALTER TABLE public.user_credits 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Create admin_nodes table for dynamic node definitions
CREATE TABLE IF NOT EXISTS public.admin_nodes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    node_type TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'Other',
    icon_name TEXT DEFAULT 'Box',
    color TEXT DEFAULT '#6366f1',
    config_schema JSONB DEFAULT '{}',
    default_config JSONB DEFAULT '{}',
    execution_type TEXT DEFAULT 'api_call', -- 'api_call', 'javascript', 'llm_prompt'
    execution_config JSONB DEFAULT '{}', -- API endpoint, JS code template, prompt template
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create admin_templates table for managed templates
CREATE TABLE IF NOT EXISTS public.admin_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'Other',
    nodes JSONB NOT NULL DEFAULT '[]',
    edges JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create analytics events table for detailed tracking
CREATE TABLE IF NOT EXISTS public.admin_analytics_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type TEXT NOT NULL, -- 'user_signup', 'flow_created', 'flow_run', 'subscription_started', 'subscription_cancelled'
    user_id UUID REFERENCES auth.users(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_date 
ON public.admin_analytics_events(event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user 
ON public.admin_analytics_events(user_id);

-- 5. RLS Policies for admin tables

-- admin_nodes: Only admins can modify, everyone can read active nodes
ALTER TABLE public.admin_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active nodes" 
ON public.admin_nodes FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can do everything on nodes" 
ON public.admin_nodes FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.user_credits 
        WHERE user_id = auth.uid() AND is_admin = true
    )
);

-- admin_templates: Only admins can modify, everyone can read active templates
ALTER TABLE public.admin_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active templates" 
ON public.admin_templates FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can do everything on templates" 
ON public.admin_templates FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.user_credits 
        WHERE user_id = auth.uid() AND is_admin = true
    )
);

-- admin_analytics_events: Only admins can read/write
ALTER TABLE public.admin_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read analytics" 
ON public.admin_analytics_events FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.user_credits 
        WHERE user_id = auth.uid() AND is_admin = true
    )
);

CREATE POLICY "System can insert analytics" 
ON public.admin_analytics_events FOR INSERT 
WITH CHECK (true);

-- 6. Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_credits 
        WHERE user_id = auth.uid() AND is_admin = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to get admin analytics
CREATE OR REPLACE FUNCTION get_admin_analytics()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM public.user_credits),
        'paid_users', (SELECT COUNT(*) FROM public.user_credits WHERE tier = 'pro'),
        'free_users', (SELECT COUNT(*) FROM public.user_credits WHERE tier = 'starter'),
        'total_flows', (SELECT COUNT(*) FROM public.flows),
        'total_runs', (SELECT COUNT(*) FROM public.run_history),
        'successful_runs', (SELECT COUNT(*) FROM public.run_history WHERE status = 'success'),
        'total_credits_used', (SELECT COALESCE(SUM(credits_used), 0) FROM public.run_history),
        'users_last_7_days', (
            SELECT COUNT(*) FROM public.user_credits 
            WHERE created_at > NOW() - INTERVAL '7 days'
        ),
        'users_last_30_days', (
            SELECT COUNT(*) FROM public.user_credits 
            WHERE created_at > NOW() - INTERVAL '30 days'
        ),
        'runs_last_7_days', (
            SELECT COUNT(*) FROM public.run_history 
            WHERE created_at > NOW() - INTERVAL '7 days'
        ),
        'runs_last_30_days', (
            SELECT COUNT(*) FROM public.run_history 
            WHERE created_at > NOW() - INTERVAL '30 days'
        ),
        'mrr_estimate', (
            SELECT COUNT(*) * 1799 FROM public.user_credits WHERE tier = 'pro'
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to get users list for admin
CREATE OR REPLACE FUNCTION get_admin_users(
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_search TEXT DEFAULT NULL,
    p_tier TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    SELECT jsonb_build_object(
        'users', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'user_id', uc.user_id,
                    'email', au.email,
                    'full_name', uc.full_name,
                    'handle', uc.handle,
                    'balance', uc.balance,
                    'tier', uc.tier,
                    'flow_limit', uc.flow_limit,
                    'is_admin', uc.is_admin,
                    'created_at', uc.created_at,
                    'last_reset_date', uc.last_reset_date,
                    'flow_count', (SELECT COUNT(*) FROM public.flows WHERE user_id = uc.user_id),
                    'run_count', (SELECT COUNT(*) FROM public.run_history WHERE user_id = uc.user_id)
                )
            ), '[]'::jsonb)
            FROM public.user_credits uc
            LEFT JOIN auth.users au ON uc.user_id = au.id
            WHERE 
                (p_search IS NULL OR 
                 au.email ILIKE '%' || p_search || '%' OR 
                 uc.full_name ILIKE '%' || p_search || '%' OR
                 uc.handle ILIKE '%' || p_search || '%')
                AND (p_tier IS NULL OR uc.tier = p_tier)
            ORDER BY uc.created_at DESC
            LIMIT p_limit
            OFFSET p_offset
        ),
        'total', (
            SELECT COUNT(*)
            FROM public.user_credits uc
            LEFT JOIN auth.users au ON uc.user_id = au.id
            WHERE 
                (p_search IS NULL OR 
                 au.email ILIKE '%' || p_search || '%' OR 
                 uc.full_name ILIKE '%' || p_search || '%' OR
                 uc.handle ILIKE '%' || p_search || '%')
                AND (p_tier IS NULL OR uc.tier = p_tier)
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- DONE! After running this script:
-- 1. Find your user_id in auth.users table
-- 2. Run: UPDATE public.user_credits SET is_admin = true WHERE user_id = 'YOUR_USER_ID';
-- =============================================================================
