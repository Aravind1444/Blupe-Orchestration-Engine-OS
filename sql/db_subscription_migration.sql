-- Add subscription_end_date column to user_credits table
-- This tracks when a Pro subscription expires (30 days from payment)
-- Run this in your Supabase SQL Editor

ALTER TABLE public.user_credits 
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;

-- Optional: Add a comment to the column
COMMENT ON COLUMN public.user_credits.subscription_end_date IS 
  'ISO date when Pro subscription expires. NULL for Starter users or lifetime plans.';
