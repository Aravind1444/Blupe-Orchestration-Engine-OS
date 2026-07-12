-- Performance Indexes for BLOOPE
-- Run this SQL in your Supabase SQL Editor to improve query performance

-- ============================================================================
-- RUN_HISTORY INDEXES
-- ============================================================================

-- Index for run_history queries by user_id (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_run_history_user_id 
  ON public.run_history(user_id);

-- Index for run_history by flow_id (used in flow-specific history)
CREATE INDEX IF NOT EXISTS idx_run_history_flow_id 
  ON public.run_history(flow_id);

-- Composite index for the most common query: user's history ordered by time
CREATE INDEX IF NOT EXISTS idx_run_history_user_created 
  ON public.run_history(user_id, created_at DESC);

-- ============================================================================
-- FLOWS INDEXES
-- ============================================================================

-- Index for flows by user_id
CREATE INDEX IF NOT EXISTS idx_flows_user_id 
  ON public.flows(user_id);

-- Composite index for flows ordered by updated_at (dashboard listing)
CREATE INDEX IF NOT EXISTS idx_flows_user_updated 
  ON public.flows(user_id, updated_at DESC);

-- ============================================================================
-- USER_CREDITS INDEXES
-- ============================================================================

-- Primary key already exists on user_id, but ensure it's indexed
-- (Usually automatic, but explicit for clarity)

-- Index for tier-based queries (admin analytics)
CREATE INDEX IF NOT EXISTS idx_user_credits_tier 
  ON public.user_credits(tier);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- After running the above, verify indexes with:
-- SELECT indexname, tablename FROM pg_indexes 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('run_history', 'flows', 'user_credits');
