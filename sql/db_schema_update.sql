-- 1. Ensure user_credits has correct default and structure
CREATE TABLE IF NOT EXISTS public.user_credits (
    user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
    balance INTEGER DEFAULT 500,
    tier TEXT DEFAULT 'starter', -- 'starter' | 'pro'
    flow_limit INTEGER DEFAULT 10,
    full_name TEXT,
    avatar_url TEXT,
    handle TEXT UNIQUE,
    plan_type TEXT DEFAULT 'starter',
    last_reset_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix the default balance constraint if it exists and is wrong
ALTER TABLE public.user_credits ALTER COLUMN balance SET DEFAULT 500;

-- 2. Ensure flows table exists
CREATE TABLE IF NOT EXISTS public.flows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    content JSONB DEFAULT '{}',
    is_published BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Run History Table (Critical for Logs)
CREATE TABLE IF NOT EXISTS public.run_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    flow_id UUID REFERENCES public.flows(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    status TEXT, -- 'success' | 'error'
    duration INTEGER,
    total_cost NUMERIC,
    credits_used INTEGER,
    logs JSONB,
    triggered_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User Secrets for BYOK/Pro
CREATE TABLE IF NOT EXISTS public.user_secrets (
    user_id UUID REFERENCES auth.users(id),
    key_name TEXT,
    value TEXT, -- Encrypted or plain depending on implementation (assuming plain for demo/MVP)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, key_name)
);

-- 5. RPC Functions needed by the app

-- Deduct Credits
CREATE OR REPLACE FUNCTION deduct_credits(amount INTEGER)
RETURNS VOID AS $$
DECLARE
    current_balance INTEGER;
BEGIN
    SELECT balance INTO current_balance FROM user_credits WHERE user_id = auth.uid();
    
    IF current_balance IS NULL THEN
        INSERT INTO user_credits (user_id, balance) VALUES (auth.uid(), 500 - amount); -- Fixed 50 -> 500
    ELSE
        UPDATE user_credits SET balance = GREATEST(0, balance - amount) WHERE user_id = auth.uid();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update User Profile
CREATE OR REPLACE FUNCTION update_user_profile(handle TEXT, full_name TEXT, avatar_url TEXT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_credits (user_id, handle, full_name, avatar_url, balance)
    VALUES (auth.uid(), handle, full_name, avatar_url, 500)
    ON CONFLICT (user_id) DO UPDATE
    SET 
        handle = COALESCE(EXCLUDED.handle, user_credits.handle),
        full_name = COALESCE(EXCLUDED.full_name, user_credits.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, user_credits.avatar_url),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Charge Flow Owner (For public runs)
CREATE OR REPLACE FUNCTION charge_flow_owner(p_flow_id UUID, p_amount INTEGER)
RETURNS VOID AS $$
DECLARE
    owner_id UUID;
BEGIN
    SELECT user_id INTO owner_id FROM flows WHERE id = p_flow_id;
    
    IF owner_id IS NOT NULL THEN
        UPDATE user_credits 
        SET balance = GREATEST(0, balance - p_amount) 
        WHERE user_id = owner_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RLS Policies (Basic)
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own credits" ON public.user_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own credits" ON public.user_credits FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own flows" ON public.flows FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert flows" ON public.flows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own flows" ON public.flows FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own flows" ON public.flows FOR DELETE USING (auth.uid() = user_id);
-- Allow public access to published flows
CREATE POLICY "Public flows are viewable by everyone" ON public.flows FOR SELECT USING (is_published = true);

ALTER TABLE public.run_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own history" ON public.run_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON public.run_history FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Allow inserting history for public flows (anonymous/guest users via server function usually, but for client-side:)
CREATE POLICY "Anon can insert history" ON public.run_history FOR INSERT WITH CHECK (true); 

-- 7. Fix Global Logs View Relation
-- Ensure foreign key exists for the join query `flows(name)`
-- This matches the standard constraint: flow_id REFERENCES flows(id)
-- If Supabase says "Could not find relationship", try reloading the schema in Supabase dashboard.
