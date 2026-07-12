-- Migration: Add credit_cost column to admin_nodes table
-- Run this in Supabase SQL Editor

-- Add credit_cost column with default value of 1
ALTER TABLE admin_nodes 
ADD COLUMN IF NOT EXISTS credit_cost INTEGER DEFAULT 1 NOT NULL;

-- Update existing nodes to have a default cost of 1
UPDATE admin_nodes SET credit_cost = 1 WHERE credit_cost IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN admin_nodes.credit_cost IS 'Number of credits deducted when this node is executed';
