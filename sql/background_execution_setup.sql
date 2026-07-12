-- =============================================================================
-- BACKGROUND EXECUTION SETUP
-- Run this in Supabase SQL Editor to enable server-side workflow execution
-- =============================================================================

-- 1. Schedule Queue Table (for cron job executions)
CREATE TABLE IF NOT EXISTS schedule_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    scheduled_for TIMESTAMPTZ NOT NULL,
    cron_expression TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error_message TEXT,
    result JSONB
);

-- Index for efficient pending job queries
CREATE INDEX IF NOT EXISTS idx_schedule_queue_pending 
    ON schedule_queue(status, scheduled_for) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_schedule_queue_flow 
    ON schedule_queue(flow_id);

-- 2. Add execution_mode column to flows table
ALTER TABLE flows ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'server';
COMMENT ON COLUMN flows.execution_mode IS 'client = browser execution, server = Edge Function execution';

-- 3. Add schedule_enabled column to flows table
ALTER TABLE flows ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT false;

-- 4. Disable RLS on queue tables (Edge Functions need direct access)
ALTER TABLE schedule_queue DISABLE ROW LEVEL SECURITY;

-- Ensure webhook_queue also has RLS disabled
ALTER TABLE webhook_queue DISABLE ROW LEVEL SECURITY;

-- 5. Function to get flows due for scheduled execution
CREATE OR REPLACE FUNCTION get_due_schedules()
RETURNS TABLE (
    flow_id UUID,
    flow_name TEXT,
    user_id UUID,
    nodes JSONB,
    edges JSONB,
    cron_expression TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.id AS flow_id,
        f.name AS flow_name,
        f.user_id,
        f.content->'nodes' AS nodes,
        f.content->'edges' AS edges,
        (schedule_node.data->>'cronExpression')::TEXT AS cron_expression
    FROM flows f
    CROSS JOIN LATERAL jsonb_array_elements(f.content->'nodes') AS schedule_node
    WHERE schedule_node.data->>'type' = 'schedule'
      AND f.schedule_enabled = true
      AND (schedule_node.data->>'cronExpression') IS NOT NULL
      AND f.execution_mode = 'server';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to process webhook queue (called by Edge Function)
CREATE OR REPLACE FUNCTION get_pending_webhooks(limit_count INT DEFAULT 10)
RETURNS TABLE (
    queue_id UUID,
    flow_id UUID,
    flow_name TEXT,
    user_id UUID,
    nodes JSONB,
    edges JSONB,
    payload JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        wq.id AS queue_id,
        wq.flow_id,
        f.name AS flow_name,
        f.user_id,
        f.content->'nodes' AS nodes,
        f.content->'edges' AS edges,
        wq.payload,
        wq.created_at
    FROM webhook_queue wq
    JOIN flows f ON f.id = wq.flow_id
    WHERE wq.status = 'pending'
      AND f.execution_mode = 'server'
    ORDER BY wq.created_at ASC
    LIMIT limit_count
    FOR UPDATE OF wq SKIP LOCKED;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create execution_logs table for detailed server-side logging
CREATE TABLE IF NOT EXISTS execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL,
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    node_type TEXT,
    status TEXT NOT NULL,
    input JSONB,
    output JSONB,
    error TEXT,
    duration_ms INT,
    credits_used INT DEFAULT 0,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_run ON execution_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_flow ON execution_logs(flow_id);

-- Enable RLS and add policies
ALTER TABLE execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own execution logs" ON public.execution_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert execution logs" ON public.execution_logs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update execution logs" ON public.execution_logs
    FOR UPDATE USING (true);

-- =============================================================================
-- OPTIONAL: pg_cron for Supabase Pro users
-- This schedules a job to poll for due schedules every minute
-- =============================================================================

-- Enable pg_cron extension (requires Supabase Pro)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule polling job (uncomment if using pg_cron)
-- SELECT cron.schedule(
--     'process-schedules',
--     '* * * * *',  -- Every minute
--     $$SELECT net.http_post(
--         url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/execute-flow',
--         headers := '{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
--         body := '{"type": "schedule"}'::jsonb
--     )$$
-- );

-- =============================================================================
-- SUCCESS! Now deploy the Supabase Edge Function
-- =============================================================================
