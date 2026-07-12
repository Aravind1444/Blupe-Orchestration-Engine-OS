-- ============================================================================
-- BLUPE DATABASE PERFORMANCE AND RETENTION OPTIMIZATIONS
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. PERFORMANCE INDEXES
-- ============================================================================

-- Index for run_history queries (user lookup + date sorting)
CREATE INDEX IF NOT EXISTS idx_run_history_user_created 
ON run_history(user_id, created_at DESC);

-- Index for flows queries (user lookup + last updated)
CREATE INDEX IF NOT EXISTS idx_flows_user_updated 
ON flows(user_id, updated_at DESC);

-- Index for user_credits lookups
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id 
ON user_credits(user_id);

-- ============================================================================
-- 2. LOG RETENTION CLEANUP FUNCTION
-- ============================================================================
-- Deletes logs older than 30 days (Pro max retention)
-- Free users are filtered at query time to 3 days
-- Run via Supabase Dashboard > SQL Editor or scheduled job

CREATE OR REPLACE FUNCTION cleanup_old_run_history()
RETURNS TABLE(deleted_count INT) AS $$
DECLARE
    count_deleted INT;
BEGIN
    DELETE FROM run_history 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS count_deleted = ROW_COUNT;
    
    RETURN QUERY SELECT count_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_old_run_history() TO authenticated;

-- ============================================================================
-- 3. MANUAL CLEANUP QUERY (Alternative to function)
-- ============================================================================
-- You can run this manually in the SQL Editor periodically:
-- 
-- DELETE FROM run_history WHERE created_at < NOW() - INTERVAL '30 days';

-- ============================================================================
-- 4. OPTIONAL: Scheduled cleanup using pg_cron (if enabled)
-- ============================================================================
-- Uncomment if you have pg_cron extension enabled:
-- 
-- SELECT cron.schedule(
--     'cleanup-old-logs',           -- Job name
--     '0 3 * * *',                  -- Run at 3 AM daily
--     'SELECT cleanup_old_run_history()'
-- );

-- ============================================================================
-- 5. VERIFY INDEXES WERE CREATED
-- ============================================================================
-- SELECT indexname FROM pg_indexes WHERE tablename = 'run_history';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'flows';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'user_credits';
