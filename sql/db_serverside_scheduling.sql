-- ============================================
-- Server-Side Scheduling Migration
-- BLOOPE v2.1 - pg_cron + pg_net Integration
-- ============================================
-- 
-- This migration enables server-side workflow scheduling using PostgreSQL
-- native extensions. Schedules will run even when the browser is closed.
--
-- PREREQUISITES:
-- 1. Run the vault secret commands manually with your actual values
-- 2. This requires Supabase Pro plan for pg_cron extension
--
-- ============================================

-- 1. Enable required extensions
-- Note: pg_cron is only available on Supabase Pro plans
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- 2. VAULT SECRETS SETUP (RUN MANUALLY)
-- ============================================
-- Replace these with your actual values and run separately:
--
-- SELECT vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'supabase_project_url');
-- SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'supabase_service_key');
--
-- To verify secrets were created:
-- SELECT name FROM vault.secrets;
-- ============================================

-- 3. Create table to track active flow schedules
CREATE TABLE IF NOT EXISTS flow_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    cron_expression TEXT NOT NULL,
    cron_job_id BIGINT, -- The pg_cron job ID
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(flow_id)
);

-- Enable RLS
ALTER TABLE flow_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own schedules" ON flow_schedules;
CREATE POLICY "Users can view own schedules" 
    ON flow_schedules FOR SELECT 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own schedules" ON flow_schedules;
CREATE POLICY "Users can manage own schedules" 
    ON flow_schedules FOR ALL 
    USING (auth.uid() = user_id);

-- Service role can manage all schedules (for Edge Function updates)
DROP POLICY IF EXISTS "Service role full access" ON flow_schedules;
CREATE POLICY "Service role full access"
    ON flow_schedules FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- 4. Function to create/update a cron job for a flow
-- ============================================
CREATE OR REPLACE FUNCTION upsert_flow_schedule(
    p_flow_id UUID,
    p_cron_expression TEXT,
    p_is_active BOOLEAN DEFAULT true
)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_job_id BIGINT;
    v_existing_job_id BIGINT;
    v_job_name TEXT;
    v_project_url TEXT;
    v_service_key TEXT;
    v_sql TEXT;
BEGIN
    -- Get current user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Verify flow belongs to user
    IF NOT EXISTS (SELECT 1 FROM flows WHERE id = p_flow_id AND user_id = v_user_id) THEN
        RETURN json_build_object('success', false, 'error', 'Flow not found or access denied');
    END IF;
    
    -- Validate cron expression (basic check)
    IF p_cron_expression IS NULL OR length(p_cron_expression) < 5 THEN
        RETURN json_build_object('success', false, 'error', 'Invalid cron expression');
    END IF;
    
    -- Get secrets from vault
    SELECT decrypted_secret INTO v_project_url 
    FROM vault.decrypted_secrets WHERE name = 'supabase_project_url';
    
    SELECT decrypted_secret INTO v_service_key 
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_key';
    
    IF v_project_url IS NULL OR v_service_key IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Vault secrets not configured. Please contact administrator.');
    END IF;
    
    -- Check for existing schedule
    SELECT cron_job_id INTO v_existing_job_id 
    FROM flow_schedules WHERE flow_id = p_flow_id;
    
    -- Unschedule existing job if present
    IF v_existing_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_existing_job_id);
    END IF;
    
    v_job_name := 'flow_' || p_flow_id::text;
    v_job_id := NULL;
    
    IF p_is_active THEN
        -- Build the SQL command for pg_cron
        -- This calls pg_net to POST to the Edge Function
        v_sql := format(
            $SQL$
            SELECT net.http_post(
                url := '%s/functions/v1/execute-flow',
                headers := '{"Content-Type": "application/json", "Authorization": "Bearer %s"}'::jsonb,
                body := '{"type": "scheduled", "flowId": "%s", "payload": {"_schedule": {"cron": "%s", "triggered_at": "%s"}}}'::jsonb
            ) AS request_id;
            $SQL$,
            v_project_url,
            v_service_key,
            p_flow_id::text,
            p_cron_expression,
            now()::text
        );
        
        -- Schedule the cron job
        SELECT cron.schedule(v_job_name, p_cron_expression, v_sql) INTO v_job_id;
    END IF;
    
    -- Upsert flow_schedules record
    INSERT INTO flow_schedules (flow_id, user_id, cron_expression, cron_job_id, is_active)
    VALUES (p_flow_id, v_user_id, p_cron_expression, v_job_id, p_is_active)
    ON CONFLICT (flow_id) DO UPDATE SET
        cron_expression = p_cron_expression,
        cron_job_id = v_job_id,
        is_active = p_is_active,
        updated_at = now();
    
    RETURN json_build_object(
        'success', true,
        'job_id', v_job_id,
        'job_name', v_job_name,
        'is_active', p_is_active,
        'cron_expression', p_cron_expression
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================
-- 5. Function to delete a flow schedule
-- ============================================
CREATE OR REPLACE FUNCTION delete_flow_schedule(p_flow_id UUID)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_job_id BIGINT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    
    -- Get existing job ID
    SELECT cron_job_id INTO v_job_id 
    FROM flow_schedules 
    WHERE flow_id = p_flow_id AND user_id = v_user_id;
    
    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;
    
    DELETE FROM flow_schedules WHERE flow_id = p_flow_id AND user_id = v_user_id;
    
    RETURN json_build_object('success', true, 'deleted', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================
-- 6. Function to get flow schedule status
-- ============================================
CREATE OR REPLACE FUNCTION get_flow_schedule(p_flow_id UUID)
RETURNS JSON
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_result RECORD;
BEGIN
    SELECT * INTO v_result FROM flow_schedules WHERE flow_id = p_flow_id;
    
    IF v_result.id IS NULL THEN
        RETURN json_build_object('exists', false);
    END IF;
    
    RETURN json_build_object(
        'exists', true,
        'cron_expression', v_result.cron_expression,
        'is_active', v_result.is_active,
        'last_run_at', v_result.last_run_at,
        'run_count', v_result.run_count,
        'error_count', v_result.error_count,
        'created_at', v_result.created_at
    );
END;
$$;

-- ============================================
-- 7. Function to update last run info (called by Edge Function)
-- ============================================
CREATE OR REPLACE FUNCTION update_schedule_run(
    p_flow_id UUID,
    p_success BOOLEAN,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE flow_schedules
    SET 
        last_run_at = now(),
        run_count = run_count + 1,
        error_count = CASE WHEN p_success THEN error_count ELSE error_count + 1 END,
        last_error = CASE WHEN p_success THEN NULL ELSE p_error END,
        updated_at = now()
    WHERE flow_id = p_flow_id;
END;
$$;

-- ============================================
-- 8. Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_flow_schedules_flow_id ON flow_schedules(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_schedules_is_active ON flow_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_flow_schedules_user_id ON flow_schedules(user_id);

-- ============================================
-- 9. Grant necessary permissions
-- ============================================
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================
-- Check extensions are enabled:
-- SELECT * FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');
--
-- Check vault secrets exist:
-- SELECT name FROM vault.secrets WHERE name IN ('supabase_project_url', 'supabase_service_key');
--
-- Check flow_schedules table:
-- SELECT * FROM flow_schedules;
--
-- Check cron jobs:
-- SELECT * FROM cron.job WHERE jobname LIKE 'flow_%';
-- ============================================
