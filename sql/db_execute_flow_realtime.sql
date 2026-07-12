-- Migration: db_execute_flow_realtime
-- Optimizes execution logs table for fast frontend querying and configures realtime listeners

-- 1. Index for chronologically querying logs under specific runs
CREATE INDEX IF NOT EXISTS idx_execution_logs_run_created 
ON public.execution_logs(run_id, created_at);

-- 2. Add table to Supabase Realtime publication conditionally
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
              AND schemaname = 'public' 
              AND tablename = 'execution_logs'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE execution_logs;
            RAISE NOTICE 'Added execution_logs to supabase_realtime publication';
        ELSE
            RAISE NOTICE 'execution_logs is already part of supabase_realtime publication';
        END IF;
    ELSE
        RAISE NOTICE 'supabase_realtime publication does not exist';
    END IF;
END $$;
