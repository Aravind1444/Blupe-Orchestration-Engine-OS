-- =============================================================================
-- SQL: DELETE old admin_nodes entries (now built-in NodeTypes)
-- Run this ONLY if you previously ran the INSERT statements
-- =============================================================================

-- Delete the old admin_nodes entries (these are now built-in nodes)
DELETE FROM admin_nodes 
WHERE node_type IN ('agent', 'deep_research', 'extract_url', 'crawl_site');

-- Verify deletion
SELECT node_type, display_name FROM admin_nodes 
WHERE node_type IN ('agent', 'deep_research', 'extract_url', 'crawl_site');
-- Should return 0 rows
