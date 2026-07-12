-- =============================================================================
-- FIX PAUSED EXECUTIONS RLS POLICIES
-- Run this in your Supabase SQL Editor to allow client-side runs to save state
-- =============================================================================

-- Option 1: Completely disable RLS on this table (Recommended for simple setups)
ALTER TABLE paused_executions DISABLE ROW LEVEL SECURITY;

-- Option 2: Alternatively, keep RLS enabled but add public policies
-- ALTER TABLE paused_executions ENABLE ROW LEVEL SECURITY;
-- 
-- DROP POLICY IF EXISTS "Allow public insert" ON paused_executions;
-- CREATE POLICY "Allow public insert" ON paused_executions FOR INSERT TO anon, authenticated WITH CHECK (true);
-- 
-- DROP POLICY IF EXISTS "Allow public select" ON paused_executions;
-- CREATE POLICY "Allow public select" ON paused_executions FOR SELECT TO anon, authenticated USING (true);
-- 
-- DROP POLICY IF EXISTS "Allow public update" ON paused_executions;
-- CREATE POLICY "Allow public update" ON paused_executions FOR UPDATE TO anon, authenticated USING (true);
