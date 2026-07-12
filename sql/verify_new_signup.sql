-- Verify New User Signup
-- After creating a new test account, run these queries to verify everything worked

-- 1. Check if the new user exists and has a user_credits record
SELECT 
    u.email,
    u.created_at as signup_time,
    uc.balance,
    uc.tier,
    uc.flow_limit,
    uc.full_name,
    uc.created_at as credits_created_at
FROM auth.users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.email = 'YOUR_NEW_EMAIL_HERE@example.com'  -- Replace with the new email you used
ORDER BY u.created_at DESC
LIMIT 1;

-- Expected result: 
-- - The user should exist
-- - user_credits columns should NOT be NULL
-- - balance should be 50
-- - tier should be 'starter'
-- - flow_limit should be 10

-- 2. If user_credits is NULL (trigger didn't fire), manually create it:
INSERT INTO user_credits (user_id, balance, tier, flow_limit, full_name)
SELECT 
    u.id,
    50,
    'starter',
    10,
    split_part(u.email, '@', 1)
FROM auth.users u
WHERE u.email = 'YOUR_NEW_EMAIL_HERE@example.com'
ON CONFLICT (user_id) DO NOTHING;
