-- Diagnostic Query to Check Database State
-- Run this in Supabase SQL Editor to verify everything is set up correctly

-- 1. Check if user_credits record exists for test user
SELECT 
    uc.*,
    u.email,
    u.created_at as user_created_at
FROM auth.users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.email = 'test@blupe.space';

-- 2. List all tables in public schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 3. Check if RLS is enabled and list policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. Check if RPC functions exist
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('deduct_credits', 'reset_monthly_credits', 'charge_flow_owner', 'update_user_profile', 'handle_new_user')
ORDER BY routine_name;

-- 5. Check if trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'auth'
AND trigger_name = 'on_auth_user_created';
