-- =============================================================================
-- PAUSED EXECUTIONS SETUP (ASYNC HITL)
-- Run this in Supabase SQL Editor to enable Human-in-the-Loop workflows
-- =============================================================================

CREATE TABLE IF NOT EXISTS paused_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL,
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    resume_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    context_snapshot JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('paused', 'resumed', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    resumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_paused_executions_token ON paused_executions(resume_token);
CREATE INDEX IF NOT EXISTS idx_paused_executions_flow ON paused_executions(flow_id);
CREATE INDEX IF NOT EXISTS idx_paused_executions_run ON paused_executions(run_id);

ALTER TABLE paused_executions DISABLE ROW LEVEL SECURITY;

-- Add webhook URL to flows for HITL delivery (optional, can be passed in payload later)
ALTER TABLE flows ADD COLUMN IF NOT EXISTS hitl_webhook_url TEXT;
