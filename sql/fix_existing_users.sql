-- Fix for Existing Test User
-- Run this SQL in your Supabase SQL Editor to create user_credits for existing users

-- This creates user_credits records for ALL existing auth users that don't have one yet
INSERT INTO user_credits (user_id, balance, tier, flow_limit, full_name, avatar_url)
SELECT 
    u.id,
    50 as balance,
    'starter' as tier,
    10 as flow_limit,
    COALESCE(
        u.raw_user_meta_data->>'full_name', 
        u.raw_user_meta_data->>'name', 
        split_part(u.email, '@', 1)
    ) as full_name,
    COALESCE(
        u.raw_user_meta_data->>'avatar_url', 
        u.raw_user_meta_data->>'picture'
    ) as avatar_url
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM user_credits uc WHERE uc.user_id = u.id
);

-- Verify the record was created
SELECT 
    uc.user_id, 
    uc.balance, 
    uc.tier, 
    uc.full_name,
    u.email
FROM user_credits uc
JOIN auth.users u ON u.id = uc.user_id
WHERE u.email = 'test@blupe.space';
