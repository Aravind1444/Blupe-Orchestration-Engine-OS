# Webhook Queue Table for Supabase Realtime

This SQL creates the `webhook_queue` table with Realtime enabled for auto-execution of flows when webhooks are received.

## Run this in Supabase SQL Editor:

```sql
-- Drop existing table if needed (WARNING: this deletes all data)
-- DROP TABLE IF EXISTS webhook_queue;

-- Create webhook_queue table
CREATE TABLE IF NOT EXISTS webhook_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error_message TEXT
);

-- Create index for faster lookups by flow_id and status
CREATE INDEX IF NOT EXISTS idx_webhook_queue_flow_status 
ON webhook_queue(flow_id, status);

-- Create index for cleanup queries (old processed entries)
CREATE INDEX IF NOT EXISTS idx_webhook_queue_created_at 
ON webhook_queue(created_at);

-- Enable Row Level Security
ALTER TABLE webhook_queue ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (for Netlify functions)
CREATE POLICY "Service role full access" ON webhook_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Users can view their own flow's queue entries
CREATE POLICY "Users can view own flow queue" ON webhook_queue
    FOR SELECT
    TO authenticated
    USING (
        flow_id IN (
            SELECT id FROM flows WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can update status of their own flow's queue entries
CREATE POLICY "Users can update own flow queue" ON webhook_queue
    FOR UPDATE
    TO authenticated
    USING (
        flow_id IN (
            SELECT id FROM flows WHERE user_id = auth.uid()
        )
    );

-- ============================================
-- ENABLE REALTIME FOR THIS TABLE
-- ============================================
-- This is the critical step for auto-execution to work!

-- Add table to Supabase Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE webhook_queue;

-- ============================================
-- OPTIONAL: Cleanup function for old queue entries
-- ============================================

-- Function to clean up processed entries older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_old_webhook_queue()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webhook_queue 
    WHERE status IN ('completed', 'failed') 
    AND created_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFICATION
-- ============================================
-- Run these to verify setup:

-- Check table exists:
-- SELECT * FROM webhook_queue LIMIT 1;

-- Check realtime is enabled:
-- SELECT * FROM pg_publication_tables WHERE tablename = 'webhook_queue';

-- Test insert (replace with real flow_id):
-- INSERT INTO webhook_queue (flow_id, payload) 
-- VALUES ('your-flow-uuid', '{"test": true}'::jsonb);
```

## After Running

1. The table will be created with proper indexes and RLS policies
2. Realtime is enabled via `ALTER PUBLICATION supabase_realtime ADD TABLE webhook_queue`
3. Your flows will auto-execute when webhooks arrive (while open in editor)

## Testing

1. Open a flow with a Webhook node in the editor
2. Enable webhook in the toolbar (link icon)
3. Send a curl request to your webhook URL
4. The flow should auto-execute with the payload
