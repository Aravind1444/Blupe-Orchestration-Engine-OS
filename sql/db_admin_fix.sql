-- =============================================================================
-- BLUPE ADMIN CONSOLE - FIX SCRIPT
-- =============================================================================
-- Run this AFTER the initial db_admin_migration.sql
-- This fixes the missing created_at column and seeds existing templates
-- =============================================================================

-- 1. Add created_at column to user_credits if it doesn't exist
ALTER TABLE public.user_credits 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Update existing rows to have created_at from updated_at if null
UPDATE public.user_credits 
SET created_at = COALESCE(created_at, last_reset_date, updated_at, NOW());

-- 3. Replace the analytics function with a safer version
CREATE OR REPLACE FUNCTION get_admin_analytics()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM public.user_credits),
        'paid_users', (SELECT COUNT(*) FROM public.user_credits WHERE tier = 'pro'),
        'free_users', (SELECT COUNT(*) FROM public.user_credits WHERE tier = 'starter'),
        'total_flows', (SELECT COUNT(*) FROM public.flows),
        'total_runs', (SELECT COUNT(*) FROM public.run_history),
        'successful_runs', (SELECT COUNT(*) FROM public.run_history WHERE status = 'success'),
        'total_credits_used', (SELECT COALESCE(SUM(credits_used), 0) FROM public.run_history),
        'users_last_7_days', (
            SELECT COUNT(*) FROM public.user_credits 
            WHERE COALESCE(created_at, updated_at) > NOW() - INTERVAL '7 days'
        ),
        'users_last_30_days', (
            SELECT COUNT(*) FROM public.user_credits 
            WHERE COALESCE(created_at, updated_at) > NOW() - INTERVAL '30 days'
        ),
        'runs_last_7_days', (
            SELECT COUNT(*) FROM public.run_history 
            WHERE created_at > NOW() - INTERVAL '7 days'
        ),
        'runs_last_30_days', (
            SELECT COUNT(*) FROM public.run_history 
            WHERE created_at > NOW() - INTERVAL '30 days'
        ),
        'mrr_estimate', (
            SELECT COUNT(*) * 1799 FROM public.user_credits WHERE tier = 'pro'
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Replace get_admin_users function with fixed version
CREATE OR REPLACE FUNCTION get_admin_users(
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_search TEXT DEFAULT NULL,
    p_tier TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    SELECT jsonb_build_object(
        'users', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'user_id', uc.user_id,
                    'email', au.email,
                    'full_name', uc.full_name,
                    'handle', uc.handle,
                    'balance', uc.balance,
                    'tier', uc.tier,
                    'flow_limit', uc.flow_limit,
                    'is_admin', uc.is_admin,
                    'created_at', COALESCE(uc.created_at, uc.updated_at),
                    'last_reset_date', uc.last_reset_date,
                    'flow_count', (SELECT COUNT(*) FROM public.flows WHERE user_id = uc.user_id),
                    'run_count', (SELECT COUNT(*) FROM public.run_history WHERE user_id = uc.user_id)
                )
            ), '[]'::jsonb)
            FROM public.user_credits uc
            LEFT JOIN auth.users au ON uc.user_id = au.id
            WHERE 
                (p_search IS NULL OR 
                 au.email ILIKE '%' || p_search || '%' OR 
                 uc.full_name ILIKE '%' || p_search || '%' OR
                 uc.handle ILIKE '%' || p_search || '%')
                AND (p_tier IS NULL OR uc.tier = p_tier)
            ORDER BY COALESCE(uc.created_at, uc.updated_at) DESC
            LIMIT p_limit
            OFFSET p_offset
        ),
        'total', (
            SELECT COUNT(*)
            FROM public.user_credits uc
            LEFT JOIN auth.users au ON uc.user_id = au.id
            WHERE 
                (p_search IS NULL OR 
                 au.email ILIKE '%' || p_search || '%' OR 
                 uc.full_name ILIKE '%' || p_search || '%' OR
                 uc.handle ILIKE '%' || p_search || '%')
                AND (p_tier IS NULL OR uc.tier = p_tier)
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. SEED EXISTING TEMPLATES INTO admin_templates TABLE
-- =============================================================================

-- Clear existing templates to avoid duplicates (optional - remove if you want to keep existing)
-- DELETE FROM public.admin_templates;

-- Insert all existing templates
INSERT INTO public.admin_templates (id, name, description, category, nodes, edges, is_active, is_featured)
VALUES 
    -- Marketing Templates
    (gen_random_uuid(), 'AI LinkedIn Post Generator', 'Generate viral LinkedIn posts from a simple topic.', 'Marketing',
     '[{"id":"start","type":"start","position":{"x":50,"y":300},"data":{"label":"Start","type":"start"}},{"id":"input","type":"input","position":{"x":250,"y":150},"data":{"label":"Topic","type":"input","content":"Future of AI Agents","variableName":"topic"}},{"id":"llm","type":"llm","position":{"x":550,"y":250},"data":{"label":"Write Post","type":"llm","provider":"gemini","model":"gemini-2.0-flash-exp","content":"Write a LinkedIn post about {{topic}}. Use emojis and short paragraphs.","variableName":"post"}},{"id":"output","type":"output","position":{"x":900,"y":300},"data":{"label":"Result","type":"output"}}]'::jsonb,
     '[{"id":"e1","source":"start","target":"llm","animated":true},{"id":"e2","source":"input","target":"llm","animated":true},{"id":"e3","source":"llm","target":"output","animated":true}]'::jsonb,
     true, true),

    (gen_random_uuid(), 'SEO Blog Writer', 'Create SEO-optimized articles with outline approval.', 'Marketing',
     '[{"id":"input","type":"input","position":{"x":100,"y":300},"data":{"label":"Keyword","type":"input","content":"Enterprise Automation","variableName":"kw"}},{"id":"outline","type":"llm","position":{"x":400,"y":300},"data":{"label":"Gen Outline","type":"llm","provider":"anthropic","model":"claude-3-sonnet-20240229","content":"Outline for: {{kw}}","variableName":"outline"}},{"id":"approve","type":"approval","position":{"x":700,"y":300},"data":{"label":"Approve","type":"approval","approvalMessage":"Review: {{outline}}"}},{"id":"write","type":"llm","position":{"x":1000,"y":300},"data":{"label":"Write Article","type":"llm","provider":"openai","model":"gpt-4o","content":"Write full article: {{outline}}"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"outline","animated":true},{"id":"e2","source":"outline","target":"approve","animated":true},{"id":"e3","source":"approve","target":"write","animated":true}]'::jsonb,
     true, false),

    (gen_random_uuid(), 'Brand Mention Monitor', 'Analyze brand sentiment from RSS feed.', 'Marketing',
     '[{"id":"rss","type":"rss","position":{"x":100,"y":100},"data":{"label":"News Feed","type":"rss","url":"https://news.google.com/rss/search?q=OpenAI","variableName":"news"}},{"id":"batch","type":"batch","position":{"x":100,"y":300},"data":{"label":"Analyze Sentiment","type":"batch","batchInputVariable":"news.items","batchPrompt":"Sentiment of: {{item.title}}? (Positive/Negative)","variableName":"sentiments"}},{"id":"email","type":"email","position":{"x":100,"y":500},"data":{"label":"Report","type":"email","emailTo":"pr@company.com","emailSubject":"Daily Sentiment","content":"{{sentiments}}"}}]'::jsonb,
     '[{"id":"e1","source":"rss","target":"batch"},{"id":"e2","source":"batch","target":"email"}]'::jsonb,
     true, false),

    -- Sales Templates
    (gen_random_uuid(), 'Inbound Lead Scorer', 'Score leads via Webhook & route hot ones to Slack.', 'Sales',
     '[{"id":"hook","type":"webhook","position":{"x":50,"y":300},"data":{"label":"New Lead","type":"webhook","variableName":"lead"}},{"id":"score","type":"llm","position":{"x":350,"y":300},"data":{"label":"Score","type":"llm","content":"Score lead 0-100: {{lead}}","variableName":"score"}},{"id":"router","type":"router","position":{"x":650,"y":300},"data":{"label":"Check Score","type":"router","content":"{{score}} > 80 ? HOT : COLD"}},{"id":"slack","type":"slack","position":{"x":950,"y":200},"data":{"label":"Sales Alert","type":"slack","slackChannel":"#sales","content":"HOT LEAD: {{lead.email}}"}},{"id":"sheet","type":"sheets","position":{"x":950,"y":400},"data":{"label":"Archive","type":"sheets","sheetId":"leads_db"}}]'::jsonb,
     '[{"id":"e1","source":"hook","target":"score"},{"id":"e2","source":"score","target":"router"},{"id":"e3","source":"router","target":"slack","sourceHandle":"HOT"},{"id":"e4","source":"router","target":"sheet","sourceHandle":"default"}]'::jsonb,
     true, true),

    (gen_random_uuid(), 'Cold Email Personalizer', 'Enrich prospect data and send personalized intro.', 'Sales',
     '[{"id":"input","type":"input","position":{"x":50,"y":200},"data":{"label":"Prospect","type":"input","content":"john@example.com","variableName":"email"}},{"id":"enrich","type":"api_call","position":{"x":300,"y":200},"data":{"label":"Enrich Data","type":"api_call","url":"https://api.enrich.com?email={{email}}","variableName":"data"}},{"id":"draft","type":"llm","position":{"x":550,"y":200},"data":{"label":"Draft Email","type":"llm","content":"Draft intro for {{data.name}} at {{data.company}}","variableName":"body"}},{"id":"send","type":"email","position":{"x":800,"y":200},"data":{"label":"Send","type":"email","emailTo":"{{email}}","content":"{{body}}"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"enrich"},{"id":"e2","source":"enrich","target":"draft"},{"id":"e3","source":"draft","target":"send"}]'::jsonb,
     true, false),

    -- HR Templates
    (gen_random_uuid(), 'Resume Screener', 'Extract skills from PDF resumes text.', 'HR',
     '[{"id":"input","type":"input","position":{"x":50,"y":200},"data":{"label":"Resume Text","type":"input","content":"Paste text...","variableName":"resume"}},{"id":"extract","type":"llm","position":{"x":300,"y":200},"data":{"label":"Extract Skills","type":"llm","content":"List top 5 skills: {{resume}}","variableName":"skills"}},{"id":"save","type":"sheets","position":{"x":550,"y":200},"data":{"label":"Save Candidate","type":"sheets","content":"[{{skills}}]"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"extract"},{"id":"e2","source":"extract","target":"save"}]'::jsonb,
     true, false),

    (gen_random_uuid(), 'Employee Onboarding', 'Send welcome kit and create accounts.', 'HR',
     '[{"id":"hook","type":"webhook","position":{"x":50,"y":200},"data":{"label":"New Hire","type":"webhook","variableName":"emp"}},{"id":"email","type":"email","position":{"x":300,"y":100},"data":{"label":"Welcome Email","type":"email","emailTo":"{{emp.email}}","content":"Welcome to the team!"}},{"id":"slack","type":"slack","position":{"x":300,"y":300},"data":{"label":"IT Ticket","type":"slack","content":"Create account for {{emp.name}}"}}]'::jsonb,
     '[{"id":"e1","source":"hook","target":"email"},{"id":"e2","source":"hook","target":"slack"}]'::jsonb,
     true, false),

    -- Dev Templates
    (gen_random_uuid(), 'Error Log Classifier', 'Classify logs and alert on Critical issues.', 'Dev',
     '[{"id":"input","type":"input","position":{"x":50,"y":200},"data":{"label":"Error Log","type":"input","content":"Error 500: Database timeout","variableName":"log"}},{"id":"classify","type":"llm","position":{"x":300,"y":200},"data":{"label":"Classify","type":"llm","content":"Severity (Critical/Warning/Info): {{log}}","variableName":"severity"}},{"id":"cond","type":"condition","position":{"x":550,"y":200},"data":{"label":"Is Critical?","type":"condition","condition":"severity === Critical"}},{"id":"alert","type":"slack","position":{"x":800,"y":100},"data":{"label":"PagerDuty","type":"slack","content":"CRITICAL: {{log}}"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"classify"},{"id":"e2","source":"classify","target":"cond"},{"id":"e3","source":"cond","target":"alert","sourceHandle":"true"}]'::jsonb,
     true, true),

    (gen_random_uuid(), 'Daily Standup Bot', 'Collect standups via scheduled form.', 'Dev',
     '[{"id":"sched","type":"schedule","position":{"x":50,"y":200},"data":{"label":"9am Daily","type":"schedule","cronExpression":"0 9 * * 1-5"}},{"id":"form","type":"form_trigger","position":{"x":300,"y":200},"data":{"label":"Standup Form","type":"form_trigger","formFields":[{"id":"1","label":"Yesterday","type":"textarea"},{"id":"2","label":"Today","type":"textarea"},{"id":"3","label":"Blockers","type":"textarea"}]}},{"id":"post","type":"slack","position":{"x":550,"y":200},"data":{"label":"Post Summary","type":"slack","slackChannel":"#standups"}}]'::jsonb,
     '[{"id":"e1","source":"sched","target":"form"},{"id":"e2","source":"form","target":"post"}]'::jsonb,
     true, false),

    -- Personal Templates
    (gen_random_uuid(), 'Daily AI Journal', 'Reflect on your day with AI prompts.', 'Personal',
     '[{"id":"sched","type":"schedule","position":{"x":50,"y":200},"data":{"label":"8pm Daily","type":"schedule","cronExpression":"0 20 * * *"}},{"id":"prompt","type":"llm","position":{"x":300,"y":200},"data":{"label":"Gen Prompt","type":"llm","content":"Generate a reflective journal prompt for today.","variableName":"prompt"}},{"id":"email","type":"email","position":{"x":550,"y":200},"data":{"label":"Send Prompt","type":"email","emailTo":"me@example.com","content":"{{prompt}}"}}]'::jsonb,
     '[{"id":"e1","source":"sched","target":"prompt"},{"id":"e2","source":"prompt","target":"email"}]'::jsonb,
     true, false),

    (gen_random_uuid(), 'Recipe Generator', 'Generate recipes from available ingredients.', 'Personal',
     '[{"id":"input","type":"input","position":{"x":50,"y":200},"data":{"label":"Ingredients","type":"input","content":"chicken, rice, garlic","variableName":"ingredients"}},{"id":"recipe","type":"llm","position":{"x":300,"y":200},"data":{"label":"Create Recipe","type":"llm","content":"Create a recipe using: {{ingredients}}","variableName":"recipe"}},{"id":"output","type":"output","position":{"x":550,"y":200},"data":{"label":"Recipe","type":"output"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"recipe"},{"id":"e2","source":"recipe","target":"output"}]'::jsonb,
     true, false)

ON CONFLICT DO NOTHING;

-- =============================================================================
-- 6. SEED EXISTING NODE TYPES INTO admin_nodes TABLE
-- =============================================================================

INSERT INTO public.admin_nodes (node_type, display_name, description, category, icon_name, color, is_active, execution_type)
VALUES 
    -- Triggers
    ('start', 'Start', 'Entry point for the workflow', 'Triggers', 'Play', '#10b981', true, 'javascript'),
    ('form_trigger', 'Form Trigger', 'Collect input via a web form', 'Triggers', 'FileText', '#6366f1', true, 'javascript'),
    ('webhook', 'Webhook', 'Receive data via HTTP webhook', 'Triggers', 'Globe', '#8b5cf6', true, 'javascript'),
    ('schedule', 'Schedule', 'Run on a cron schedule', 'Triggers', 'Clock', '#f59e0b', true, 'javascript'),
    
    -- AI
    ('llm', 'AI / LLM', 'Process with AI language models', 'AI', 'Brain', '#ec4899', true, 'llm_prompt'),
    ('ai_vision', 'AI Vision', 'Analyze images with AI', 'AI', 'Eye', '#f43f5e', true, 'llm_prompt'),
    ('reasoning', 'Reasoning', 'Chain-of-thought reasoning', 'AI', 'Lightbulb', '#a855f7', true, 'llm_prompt'),
    ('batch', 'Batch AI', 'Process multiple items with AI', 'AI', 'Layers', '#d946ef', true, 'llm_prompt'),
    
    -- Logic
    ('condition', 'Condition', 'Branch based on condition', 'Logic', 'GitBranch', '#14b8a6', true, 'javascript'),
    ('router', 'Router', 'Switch/case routing', 'Logic', 'Split', '#06b6d4', true, 'javascript'),
    ('javascript', 'JavaScript', 'Run custom JavaScript code', 'Logic', 'Code', '#eab308', true, 'javascript'),
    ('wait', 'Wait', 'Delay execution', 'Logic', 'Timer', '#64748b', true, 'javascript'),
    ('approval', 'Approval', 'Human-in-the-loop approval', 'Logic', 'UserCheck', '#22c55e', true, 'javascript'),
    
    -- Integrations
    ('api_call', 'API Call', 'Make HTTP API requests', 'Integrations', 'Globe', '#3b82f6', true, 'api_call'),
    ('rss', 'RSS Feed', 'Read RSS feed items', 'Integrations', 'Rss', '#f97316', true, 'api_call'),
    ('slack', 'Slack', 'Send messages to Slack', 'Integrations', 'MessageSquare', '#e11d48', true, 'api_call'),
    ('email', 'Email', 'Send emails via SMTP', 'Integrations', 'Mail', '#0ea5e9', true, 'api_call'),
    ('sheets', 'Google Sheets', 'Read/write to Google Sheets', 'Integrations', 'Table', '#22c55e', true, 'api_call'),
    ('web_search', 'Web Search', 'Search the web', 'Integrations', 'Search', '#6366f1', true, 'api_call'),
    
    -- Data/Utils
    ('json', 'JSON', 'Parse, stringify, or pick JSON', 'Data', 'Braces', '#64748b', true, 'javascript'),
    ('math', 'Math', 'Mathematical operations', 'Data', 'Calculator', '#8b5cf6', true, 'javascript'),
    ('text', 'Text', 'Text transformations', 'Data', 'Type', '#14b8a6', true, 'javascript'),
    
    -- IO
    ('input', 'Input', 'User input variable', 'IO', 'TextCursor', '#3b82f6', true, 'javascript'),
    ('note', 'Note', 'Documentation note', 'IO', 'StickyNote', '#fbbf24', true, 'javascript'),
    ('output', 'Output', 'Display output result', 'IO', 'Eye', '#10b981', true, 'javascript')

ON CONFLICT (node_type) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    icon_name = EXCLUDED.icon_name,
    color = EXCLUDED.color;

-- =============================================================================
-- DONE! Admin console should now work correctly.
-- =============================================================================
