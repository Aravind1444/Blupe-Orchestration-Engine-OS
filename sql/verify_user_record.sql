-- Check if user_credits record exists for test user
-- Run this query in Supabase SQL Editor

SELECT 
    u.id as user_id,
    u.email,
    uc.balance,
    uc.tier,
    uc.full_name,
    uc.created_at
FROM auth.users u
LEFT JOIN user_credits uc ON uc.user_id = u.id
WHERE u.email = 'test@blupe.space';

-- If the above shows NULL values for user_credits columns, 
-- it means the record doesn't exist. Run this to create it manually:

INSERT INTO user_credits (user_id, balance, tier, flow_limit)
SELECT 
    u.id,
    50,
    'starter',
    10
FROM auth.users u
WHERE u.email = 'test@blupe.space'
ON CONFLICT (user_id) DO NOTHING;

-- After inserting, verify it was created:
SELECT * FROM user_credits uc
JOIN auth.users u ON u.id = uc.user_id
WHERE u.email = 'test@blupe.space';
