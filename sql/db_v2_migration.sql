-- ============================================================================
-- BLUPE V2 Database Migration
-- Run this in Supabase SQL Editor BEFORE deploying V2 code changes
-- Created: 2025-12-12
-- ============================================================================

-- ============================================================================
-- 1. WEBHOOK SUPPORT - Enable flows to receive external HTTP requests
-- ============================================================================

-- Add webhook configuration columns to flows table
ALTER TABLE flows ADD COLUMN IF NOT EXISTS webhook_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS webhook_api_key TEXT;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS webhook_response_mode TEXT DEFAULT 'async';

-- Index for quick webhook lookups
CREATE INDEX IF NOT EXISTS idx_flows_webhook_enabled ON flows(id) WHERE webhook_enabled = TRUE;

-- Webhook execution queue (for async processing)
CREATE TABLE IF NOT EXISTS webhook_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID REFERENCES flows(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error_message TEXT
);

-- Index for processing pending webhooks
CREATE INDEX IF NOT EXISTS idx_webhook_queue_pending ON webhook_queue(status, created_at) 
WHERE status = 'pending';

-- Webhook rate limiting table (extends existing public_flow_requests pattern)
CREATE TABLE IF NOT EXISTS webhook_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL,
    client_ip TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_rate_limits 
ON webhook_rate_limits(flow_id, client_ip, created_at DESC);

-- Rate limit check function for webhooks (100 requests/hour per flow per IP)
CREATE OR REPLACE FUNCTION check_webhook_rate_limit(
    p_flow_id UUID,
    p_client_ip TEXT,
    p_limit INTEGER DEFAULT 100,
    p_window_hours INTEGER DEFAULT 1
)
RETURNS BOOLEAN AS $$
DECLARE
    request_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO request_count
    FROM webhook_rate_limits
    WHERE flow_id = p_flow_id
      AND client_ip = p_client_ip
      AND created_at > NOW() - (p_window_hours || ' hours')::INTERVAL;
    
    IF request_count < p_limit THEN
        INSERT INTO webhook_rate_limits (flow_id, client_ip)
        VALUES (p_flow_id, p_client_ip);
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_webhook_rate_limit TO anon;
GRANT EXECUTE ON FUNCTION check_webhook_rate_limit TO authenticated;

-- ============================================================================
-- 2. OAUTH CONNECTIONS - Store OAuth tokens for integrations
-- ============================================================================

-- OAuth connections table (stores tokens for Google, Slack, HubSpot, etc.)
CREATE TABLE IF NOT EXISTS oauth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'google', 'slack', 'hubspot', 'stripe'
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[], -- Array of granted scopes
    account_email TEXT, -- Connected account email for display
    account_name TEXT, -- Display name (e.g., workspace name for Slack)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user_provider 
ON oauth_connections(user_id, provider);

-- OAuth states table (for CSRF protection during OAuth flow)
CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    return_url TEXT,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup of expired states
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- RLS Policies for OAuth tables
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Users can only view their own OAuth connections
DROP POLICY IF EXISTS "Users can view own connections" ON oauth_connections;
CREATE POLICY "Users can view own connections" ON oauth_connections
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own connections" ON oauth_connections;
CREATE POLICY "Users can insert own connections" ON oauth_connections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own connections" ON oauth_connections;
CREATE POLICY "Users can update own connections" ON oauth_connections
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own connections" ON oauth_connections;
CREATE POLICY "Users can delete own connections" ON oauth_connections
    FOR DELETE USING (auth.uid() = user_id);

-- OAuth states: service role only (handled by Netlify functions)
-- No policies needed as these are managed server-side

-- ============================================================================
-- 3. PUBLIC TEMPLATES - Shareable workflow templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS public_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_flow_id UUID REFERENCES flows(id) ON DELETE SET NULL,
    creator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'Other', -- Sales, Marketing, Dev, HR, Personal, Other
    nodes JSONB NOT NULL,
    edges JSONB NOT NULL,
    tags TEXT[], -- Search tags
    install_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for template discovery
CREATE INDEX IF NOT EXISTS idx_public_templates_active 
ON public_templates(is_active, install_count DESC);

CREATE INDEX IF NOT EXISTS idx_public_templates_category 
ON public_templates(category) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_public_templates_featured 
ON public_templates(is_featured, created_at DESC) WHERE is_active = TRUE;

-- RLS for templates - viewable by anyone, editable by creator
ALTER TABLE public_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active templates" ON public_templates;
CREATE POLICY "Anyone can view active templates" ON public_templates
    FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Creators can manage own templates" ON public_templates;
CREATE POLICY "Creators can manage own templates" ON public_templates
    FOR ALL USING (auth.uid() = creator_user_id);

-- Function to increment install count
CREATE OR REPLACE FUNCTION increment_template_installs(p_template_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public_templates 
    SET install_count = install_count + 1,
        updated_at = NOW()
    WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_template_installs TO authenticated;

-- ============================================================================
-- 4. CLEANUP FUNCTIONS
-- ============================================================================

-- Cleanup expired OAuth states (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
    DELETE FROM oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old webhook rate limit records (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_webhook_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM webhook_rate_limits WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup processed webhooks (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhooks()
RETURNS void AS $$
BEGIN
    DELETE FROM webhook_queue 
    WHERE created_at < NOW() - INTERVAL '7 days'
      AND status IN ('completed', 'failed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE webhook_queue IS 'Queue for async webhook processing';
COMMENT ON TABLE oauth_connections IS 'Stores OAuth tokens for third-party integrations';
COMMENT ON TABLE oauth_states IS 'Temporary CSRF state tokens during OAuth flow';
COMMENT ON TABLE public_templates IS 'Shareable workflow templates';

COMMENT ON COLUMN flows.webhook_enabled IS 'Whether this flow accepts inbound webhook requests';
COMMENT ON COLUMN flows.webhook_api_key IS 'Optional API key for webhook authentication';
COMMENT ON COLUMN flows.webhook_response_mode IS 'async (immediate 200) or sync (wait for result)';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

SELECT 'V2 Migration Complete! Tables created:' AS status;
SELECT 
    'webhook_queue' AS table_name, 
    (SELECT COUNT(*) FROM webhook_queue) AS row_count
UNION ALL SELECT 'oauth_connections', (SELECT COUNT(*) FROM oauth_connections)
UNION ALL SELECT 'oauth_states', (SELECT COUNT(*) FROM oauth_states)
UNION ALL SELECT 'public_templates', (SELECT COUNT(*) FROM public_templates)
UNION ALL SELECT 'webhook_rate_limits', (SELECT COUNT(*) FROM webhook_rate_limits);
