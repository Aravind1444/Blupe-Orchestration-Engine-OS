-- Rate Limiting Table for Public Flow Requests
-- Run this in Supabase SQL Editor

-- Create table to track public flow requests for rate limiting
CREATE TABLE IF NOT EXISTS public_flow_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL,
    client_ip TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_public_flow_rate 
ON public_flow_requests(flow_id, client_ip, created_at DESC);

-- Function to check rate limit (returns true if allowed, false if rate limited)
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_flow_id UUID,
    p_client_ip TEXT,
    p_max_requests INTEGER DEFAULT 50,
    p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
    request_count INTEGER;
BEGIN
    -- Count requests from this IP for this flow in the time window
    SELECT COUNT(*)
    INTO request_count
    FROM public_flow_requests
    WHERE flow_id = p_flow_id
      AND client_ip = p_client_ip
      AND created_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL;
    
    -- If under limit, log this request and return true
    IF request_count < p_max_requests THEN
        INSERT INTO public_flow_requests (flow_id, client_ip)
        VALUES (p_flow_id, p_client_ip);
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to the function for the anon role (public access)
GRANT EXECUTE ON FUNCTION check_rate_limit TO anon;
GRANT EXECUTE ON FUNCTION check_rate_limit TO authenticated;

-- Cleanup function: delete records older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_rate_limit_records()
RETURNS void AS $$
BEGIN
    DELETE FROM public_flow_requests 
    WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Schedule cleanup (run manually or via pg_cron if available)
-- SELECT cleanup_rate_limit_records();

COMMENT ON TABLE public_flow_requests IS 'Tracks public flow requests for rate limiting';
COMMENT ON FUNCTION check_rate_limit IS 'Checks and logs rate limit for public flow requests. Returns TRUE if request is allowed.';
