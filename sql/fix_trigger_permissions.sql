-- FIX: Grant proper permissions for trigger function and RLS bypass
-- Run this in Supabase SQL Editor

-- 1. First, let's recreate the trigger function with proper permissions
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER -- This allows the function to bypass RLS
SET search_path = public
AS $$
BEGIN
    -- Insert user_credits record, bypassing RLS because of SECURITY DEFINER
    INSERT INTO public.user_credits (
        user_id, 
        balance, 
        tier, 
        flow_limit, 
        full_name, 
        avatar_url
    )
    VALUES (
        NEW.id,
        50,
        'starter',
        10,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name', 
            NEW.raw_user_meta_data->>'name', 
            split_part(NEW.email, '@', 1)
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url', 
            NEW.raw_user_meta_data->>'picture'
        )
    )
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the auth operation
    RAISE WARNING 'Failed to create user_credits for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- 3. Grant necessary permissions to the function owner
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- 4. Now manually create the user_credits record for the existing test user
-- This ensures the test user can log in immediately
INSERT INTO user_credits (user_id, balance, tier, flow_limit, full_name)
SELECT 
    u.id,
    50,
    'starter',
    10,
    split_part(u.email, '@', 1)
FROM auth.users u
WHERE u.email = 'test@blupe.space'
ON CONFLICT (user_id) 
DO UPDATE SET
    balance = COALESCE(user_credits.balance, 50),
    tier = COALESCE(user_credits.tier, 'starter'),
    flow_limit = COALESCE(user_credits.flow_limit, 10);

-- 5. Verify the record was created
SELECT 
    uc.user_id,
    uc.balance,
    uc.tier,
    uc.flow_limit,
    u.email
FROM user_credits uc
JOIN auth.users u ON u.id = uc.user_id
WHERE u.email = 'test@blupe.space';

-- Expected output: Should show one row with the test user's details
