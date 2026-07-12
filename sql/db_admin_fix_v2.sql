-- =============================================================================
-- BLUPE ADMIN CONSOLE - FIX SCRIPT V2
-- =============================================================================
-- Run this in Supabase SQL Editor to fix all issues
-- This replaces db_admin_fix.sql with corrected functions
-- =============================================================================

-- 1. Add created_at column to user_credits if it doesn't exist
ALTER TABLE public.user_credits 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Update existing rows to have created_at from updated_at if null
UPDATE public.user_credits 
SET created_at = COALESCE(created_at, last_reset_date, updated_at, NOW());

-- 3. Replace the analytics function with chart-friendly version
CREATE OR REPLACE FUNCTION get_admin_analytics()
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    daily_users JSONB;
    daily_runs JSONB;
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- Get daily user signups for last 30 days
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d.day::date, 'count', COALESCE(u.cnt, 0))), '[]'::jsonb)
    INTO daily_users
    FROM generate_series(NOW() - INTERVAL '30 days', NOW(), INTERVAL '1 day') AS d(day)
    LEFT JOIN (
        SELECT DATE(COALESCE(created_at, updated_at)) as signup_date, COUNT(*) as cnt
        FROM public.user_credits
        WHERE COALESCE(created_at, updated_at) > NOW() - INTERVAL '30 days'
        GROUP BY signup_date
    ) u ON d.day::date = u.signup_date;

    -- Get daily runs for last 30 days
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d.day::date, 'count', COALESCE(r.cnt, 0))), '[]'::jsonb)
    INTO daily_runs
    FROM generate_series(NOW() - INTERVAL '30 days', NOW(), INTERVAL '1 day') AS d(day)
    LEFT JOIN (
        SELECT DATE(created_at) as run_date, COUNT(*) as cnt
        FROM public.run_history
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY run_date
    ) r ON d.day::date = r.run_date;

    SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM public.user_credits),
        'paid_users', (SELECT COUNT(*) FROM public.user_credits WHERE tier = 'pro'),
        'free_users', (SELECT COUNT(*) FROM public.user_credits WHERE tier = 'starter'),
        'total_flows', (SELECT COUNT(*) FROM public.flows),
        'total_runs', (SELECT COUNT(*) FROM public.run_history),
        'successful_runs', (SELECT COUNT(*) FROM public.run_history WHERE status = 'success'),
        'failed_runs', (SELECT COUNT(*) FROM public.run_history WHERE status = 'failed'),
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
        'credits_last_7_days', (
            SELECT COALESCE(SUM(credits_used), 0) FROM public.run_history 
            WHERE created_at > NOW() - INTERVAL '7 days'
        ),
        'credits_last_30_days', (
            SELECT COALESCE(SUM(credits_used), 0) FROM public.run_history 
            WHERE created_at > NOW() - INTERVAL '30 days'
        ),
        'mrr_estimate', (
            SELECT COUNT(*) * 1799 FROM public.user_credits WHERE tier = 'pro'
        ),
        'avg_runs_per_user', (
            SELECT ROUND(AVG(run_count)::numeric, 1) FROM (
                SELECT COUNT(*) as run_count FROM public.run_history GROUP BY user_id
            ) sub
        ),
        'daily_users', daily_users,
        'daily_runs', daily_runs
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. FIXED get_admin_users function (no subqueries in jsonb_agg)
CREATE OR REPLACE FUNCTION get_admin_users(
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_search TEXT DEFAULT NULL,
    p_tier TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    user_list JSONB;
    total_count INTEGER;
BEGIN
    -- Check if user is admin
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required';
    END IF;

    -- First, get total count
    SELECT COUNT(*) INTO total_count
    FROM public.user_credits uc
    LEFT JOIN auth.users au ON uc.user_id = au.id
    WHERE 
        (p_search IS NULL OR 
         au.email ILIKE '%' || p_search || '%' OR 
         uc.full_name ILIKE '%' || p_search || '%' OR
         uc.handle ILIKE '%' || p_search || '%')
        AND (p_tier IS NULL OR uc.tier = p_tier);

    -- Then get user list with explicit selection (no subqueries in aggregation)
    SELECT COALESCE(jsonb_agg(user_row ORDER BY user_row->>'created_at' DESC), '[]'::jsonb)
    INTO user_list
    FROM (
        SELECT jsonb_build_object(
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
            'flow_count', fc.flow_count,
            'run_count', rc.run_count
        ) as user_row
        FROM public.user_credits uc
        LEFT JOIN auth.users au ON uc.user_id = au.id
        LEFT JOIN (
            SELECT user_id, COUNT(*) as flow_count 
            FROM public.flows 
            GROUP BY user_id
        ) fc ON fc.user_id = uc.user_id
        LEFT JOIN (
            SELECT user_id, COUNT(*) as run_count 
            FROM public.run_history 
            GROUP BY user_id
        ) rc ON rc.user_id = uc.user_id
        WHERE 
            (p_search IS NULL OR 
             au.email ILIKE '%' || p_search || '%' OR 
             uc.full_name ILIKE '%' || p_search || '%' OR
             uc.handle ILIKE '%' || p_search || '%')
            AND (p_tier IS NULL OR uc.tier = p_tier)
        ORDER BY COALESCE(uc.created_at, uc.updated_at) DESC
        LIMIT p_limit
        OFFSET p_offset
    ) sub;

    SELECT jsonb_build_object(
        'users', user_list,
        'total', total_count
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. DELETE OLD TEMPLATES AND RESEED ALL
-- =============================================================================
DELETE FROM public.admin_templates;

-- Insert ALL templates from templates.ts
INSERT INTO public.admin_templates (name, description, category, nodes, edges, is_active, is_featured)
VALUES 
    -- Marketing Templates
    ('AI LinkedIn Post Generator', 'Generate viral LinkedIn posts from a simple topic.', 'Marketing',
     '[{"id":"start","type":"start","position":{"x":50,"y":300},"data":{"label":"Start","type":"start"}},{"id":"input","type":"input","position":{"x":250,"y":150},"data":{"label":"Topic","type":"input","content":"Future of AI Agents","variableName":"topic"}},{"id":"llm","type":"llm","position":{"x":550,"y":250},"data":{"label":"Write Post","type":"llm","provider":"gemini","model":"gemini-2.0-flash-exp","content":"Write a LinkedIn post about {{topic}}. Use emojis and short paragraphs.","variableName":"post"}},{"id":"output","type":"output","position":{"x":900,"y":300},"data":{"label":"Result","type":"output"}}]'::jsonb,
     '[{"id":"e1","source":"start","target":"llm","animated":true},{"id":"e2","source":"input","target":"llm","animated":true},{"id":"e3","source":"llm","target":"output","animated":true}]'::jsonb,
     true, true),

    ('SEO Blog Writer', 'Create SEO-optimized articles with outline approval.', 'Marketing',
     '[{"id":"input","type":"input","position":{"x":100,"y":300},"data":{"label":"Keyword","type":"input","content":"Enterprise Automation","variableName":"kw"}},{"id":"outline","type":"llm","position":{"x":400,"y":300},"data":{"label":"Gen Outline","type":"llm","provider":"anthropic","model":"claude-3-sonnet-20240229","content":"Outline for: {{kw}}","variableName":"outline"}},{"id":"approve","type":"approval","position":{"x":700,"y":300},"data":{"label":"Approve","type":"approval","approvalMessage":"Review: {{outline}}"}},{"id":"write","type":"llm","position":{"x":1000,"y":300},"data":{"label":"Write Article","type":"llm","provider":"openai","model":"gpt-4o","content":"Write full article: {{outline}}"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"outline","animated":true},{"id":"e2","source":"outline","target":"approve","animated":true},{"id":"e3","source":"approve","target":"write","animated":true}]'::jsonb,
     true, false),

    ('Brand Mention Monitor', 'Analyze brand sentiment from RSS feed.', 'Marketing',
     '[{"id":"rss","type":"rss","position":{"x":100,"y":100},"data":{"label":"News Feed","type":"rss","url":"https://news.google.com/rss/search?q=OpenAI","variableName":"news"}},{"id":"batch","type":"batch","position":{"x":100,"y":300},"data":{"label":"Analyze Sentiment","type":"batch","batchInputVariable":"news.items","batchPrompt":"Sentiment of: {{item.title}}? (Positive/Negative)","variableName":"sentiments"}},{"id":"email","type":"email","position":{"x":100,"y":500},"data":{"label":"Report","type":"email","emailTo":"pr@company.com","emailSubject":"Daily Sentiment","content":"{{sentiments}}"}}]'::jsonb,
     '[{"id":"e1","source":"rss","target":"batch"},{"id":"e2","source":"batch","target":"email"}]'::jsonb,
     true, false),
     
    ('AI Research Agent', 'Autonomous research agent with web search and reasoning.', 'Marketing',
     '[{"id":"input","type":"input","position":{"x":50,"y":300},"data":{"label":"Research Topic","type":"input","content":"Latest AI trends 2024","variableName":"topic"}},{"id":"search","type":"web_search","position":{"x":350,"y":300},"data":{"label":"Web Search","type":"web_search","searchQuery":"{{topic}}","variableName":"results"}},{"id":"reason","type":"reasoning","position":{"x":650,"y":300},"data":{"label":"Analyze","type":"reasoning","reasoningGoal":"Analyze search results for {{topic}}","thinkingStyle":"chain-of-thought","variableName":"analysis"}},{"id":"report","type":"llm","position":{"x":950,"y":300},"data":{"label":"Generate Report","type":"llm","content":"Create report: {{analysis.answer}}","variableName":"final"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"search"},{"id":"e2","source":"search","target":"reason"},{"id":"e3","source":"reason","target":"report"}]'::jsonb,
     true, true),
     
    ('Market Research Automation', 'Search market data, reason about trends, generate insights.', 'Marketing',
     '[{"id":"input","type":"input","position":{"x":50,"y":300},"data":{"label":"Market","type":"input","content":"SaaS automation","variableName":"market"}},{"id":"search","type":"web_search","position":{"x":350,"y":300},"data":{"label":"Search Trends","type":"web_search","searchQuery":"{{market}} market trends","variableName":"trends"}},{"id":"reason","type":"reasoning","position":{"x":650,"y":300},"data":{"label":"Market Analysis","type":"reasoning","reasoningGoal":"Identify growth opportunities","variableName":"analysis"}},{"id":"report","type":"llm","position":{"x":950,"y":300},"data":{"label":"Create Report","type":"llm","content":"Executive report: {{analysis.answer}}","variableName":"presentation"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"search"},{"id":"e2","source":"search","target":"reason"},{"id":"e3","source":"reason","target":"report"}]'::jsonb,
     true, false),
     
    ('Content Creation Pipeline', 'Research, reason, batch generate content.', 'Marketing',
     '[{"id":"input","type":"input","position":{"x":50,"y":300},"data":{"label":"Topics","type":"input","content":"[\"AI agents\",\"Automation\"]","variableName":"topics"}},{"id":"batch","type":"batch","position":{"x":350,"y":300},"data":{"label":"Research Each","type":"batch","batchInputVariable":"topics","batchPrompt":"Research: {{item}}"}},{"id":"reason","type":"reasoning","position":{"x":650,"y":300},"data":{"label":"Strategy","type":"reasoning","reasoningGoal":"Determine content angles","variableName":"strategy"}},{"id":"write","type":"batch","position":{"x":950,"y":300},"data":{"label":"Write Articles","type":"batch","batchInputVariable":"topics","batchPrompt":"Write article about {{item}}"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"batch"},{"id":"e2","source":"batch","target":"reason"},{"id":"e3","source":"reason","target":"write"}]'::jsonb,
     true, false),

    -- Sales Templates
    ('Inbound Lead Scorer', 'Score leads via Webhook & route hot ones to Slack.', 'Sales',
     '[{"id":"hook","type":"webhook","position":{"x":50,"y":300},"data":{"label":"New Lead","type":"webhook","variableName":"lead"}},{"id":"score","type":"llm","position":{"x":350,"y":300},"data":{"label":"Score","type":"llm","content":"Score lead 0-100: {{lead}}","variableName":"score"}},{"id":"router","type":"router","position":{"x":650,"y":300},"data":{"label":"Check Score","type":"router","content":"{{score}} > 80 ? HOT : COLD"}},{"id":"slack","type":"slack","position":{"x":950,"y":200},"data":{"label":"Sales Alert","type":"slack","slackChannel":"#sales","content":"HOT LEAD: {{lead.email}}"}},{"id":"sheet","type":"sheets","position":{"x":950,"y":400},"data":{"label":"Archive","type":"sheets"}}]'::jsonb,
     '[{"id":"e1","source":"hook","target":"score"},{"id":"e2","source":"score","target":"router"},{"id":"e3","source":"router","target":"slack","sourceHandle":"HOT"},{"id":"e4","source":"router","target":"sheet","sourceHandle":"default"}]'::jsonb,
     true, true),

    ('Cold Email Personalizer', 'Enrich prospect data and send personalized intro.', 'Sales',
     '[{"id":"input","type":"input","position":{"x":50,"y":200},"data":{"label":"Prospect","type":"input","content":"john@example.com","variableName":"email"}},{"id":"enrich","type":"api_call","position":{"x":300,"y":200},"data":{"label":"Enrich Data","type":"api_call","url":"https://api.enrich.com?email={{email}}","variableName":"data"}},{"id":"draft","type":"llm","position":{"x":550,"y":200},"data":{"label":"Draft Email","type":"llm","content":"Draft intro for {{data.name}} at {{data.company}}","variableName":"body"}},{"id":"send","type":"email","position":{"x":800,"y":200},"data":{"label":"Send","type":"email","emailTo":"{{email}}","content":"{{body}}"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"enrich"},{"id":"e2","source":"enrich","target":"draft"},{"id":"e3","source":"draft","target":"send"}]'::jsonb,
     true, false),
     
    ('Competitive Intelligence Bot', 'Monitor competitors and track strategy.', 'Sales',
     '[{"id":"schedule","type":"schedule","position":{"x":50,"y":300},"data":{"label":"Daily 9AM","type":"schedule","cronExpression":"0 9 * * *"}},{"id":"search1","type":"web_search","position":{"x":350,"y":200},"data":{"label":"Search Competitor A","type":"web_search","searchQuery":"Competitor A news","variableName":"comp_a"}},{"id":"search2","type":"web_search","position":{"x":350,"y":400},"data":{"label":"Search Competitor B","type":"web_search","searchQuery":"Competitor B updates","variableName":"comp_b"}},{"id":"reason","type":"reasoning","position":{"x":650,"y":300},"data":{"label":"Strategic Analysis","type":"reasoning","reasoningGoal":"Identify threats and opportunities","variableName":"insights"}},{"id":"slack","type":"slack","position":{"x":950,"y":300},"data":{"label":"Alert Team","type":"slack","slackChannel":"#strategy","content":"{{insights.answer}}"}}]'::jsonb,
     '[{"id":"e1","source":"schedule","target":"search1"},{"id":"e2","source":"schedule","target":"search2"},{"id":"e3","source":"search1","target":"reason"},{"id":"e4","source":"search2","target":"reason"},{"id":"e5","source":"reason","target":"slack"}]'::jsonb,
     true, false),
     
    ('Lead Enrichment Engine', 'Read leads, search web for data, score and segment.', 'Sales',
     '[{"id":"read","type":"sheets","position":{"x":50,"y":300},"data":{"label":"Read Leads","type":"sheets","sheetOperation":"read","variableName":"leads"}},{"id":"batch","type":"batch","position":{"x":350,"y":300},"data":{"label":"Enrich Data","type":"batch","batchInputVariable":"leads","batchPrompt":"Search: {{item.company}}","variableName":"data"}},{"id":"score","type":"batch","position":{"x":650,"y":300},"data":{"label":"Score Fit","type":"batch","batchInputVariable":"data","batchPrompt":"Score lead 0-100: {{item}}","variableName":"scores"}},{"id":"router","type":"router","position":{"x":950,"y":300},"data":{"label":"Segment","type":"router","content":"{{scores}} > 80 ? HOT : COLD"}}]'::jsonb,
     '[{"id":"e1","source":"read","target":"batch"},{"id":"e2","source":"batch","target":"score"},{"id":"e3","source":"score","target":"router"}]'::jsonb,
     true, false),
     
    ('Invoice OCR', 'Extract invoice totals from images.', 'Sales',
     '[{"id":"in","type":"input","position":{"x":50,"y":200},"data":{"label":"Image URL","type":"input"}},{"id":"vis","type":"ai_vision","position":{"x":300,"y":200},"data":{"label":"Extract Total","type":"ai_vision","content":"What is the total?","variableName":"total"}},{"id":"sheet","type":"sheets","position":{"x":550,"y":200},"data":{"label":"Save","type":"sheets","content":"[{{total}}]"}}]'::jsonb,
     '[{"id":"e1","source":"in","target":"vis"},{"id":"e2","source":"vis","target":"sheet"}]'::jsonb,
     true, false),

    -- HR Templates
    ('Resume Screener', 'Extract skills from PDF resumes text.', 'HR',
     '[{"id":"input","type":"input","position":{"x":50,"y":200},"data":{"label":"Resume Text","type":"input","content":"Paste text...","variableName":"resume"}},{"id":"extract","type":"llm","position":{"x":300,"y":200},"data":{"label":"Extract Skills","type":"llm","content":"List top 5 skills: {{resume}}","variableName":"skills"}},{"id":"save","type":"sheets","position":{"x":550,"y":200},"data":{"label":"Save Candidate","type":"sheets","content":"[{{skills}}]"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"extract"},{"id":"e2","source":"extract","target":"save"}]'::jsonb,
     true, false),

    ('Employee Onboarding', 'Send welcome kit and create accounts.', 'HR',
     '[{"id":"hook","type":"webhook","position":{"x":50,"y":200},"data":{"label":"New Hire","type":"webhook","variableName":"emp"}},{"id":"email","type":"email","position":{"x":300,"y":100},"data":{"label":"Welcome Email","type":"email","emailTo":"{{emp.email}}","content":"Welcome to the team!"}},{"id":"slack","type":"slack","position":{"x":300,"y":300},"data":{"label":"IT Ticket","type":"slack","content":"Create account for {{emp.name}}"}}]'::jsonb,
     '[{"id":"e1","source":"hook","target":"email"},{"id":"e2","source":"hook","target":"slack"}]'::jsonb,
     true, false),
     
    ('Candidate Scorer', 'Score candidate resumes against job requirements.', 'HR',
     '[{"id":"input","type":"input","position":{"x":50,"y":200},"data":{"label":"Resume","type":"input","variableName":"resume"}},{"id":"job","type":"input","position":{"x":50,"y":400},"data":{"label":"Job Desc","type":"input","variableName":"job"}},{"id":"reason","type":"reasoning","position":{"x":350,"y":300},"data":{"label":"Score Fit","type":"reasoning","reasoningGoal":"Score resume fit for job 0-100","variableName":"score"}},{"id":"output","type":"output","position":{"x":650,"y":300},"data":{"label":"Score","type":"output"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"reason"},{"id":"e2","source":"job","target":"reason"},{"id":"e3","source":"reason","target":"output"}]'::jsonb,
     true, false),

    -- Dev Templates
    ('Error Log Classifier', 'Classify logs and alert on Critical issues.', 'Dev',
     '[{"id":"input","type":"input","position":{"x":50,"y":200},"data":{"label":"Error Log","type":"input","content":"Error 500: Database timeout","variableName":"log"}},{"id":"classify","type":"llm","position":{"x":300,"y":200},"data":{"label":"Classify","type":"llm","content":"Severity (Critical/Warning/Info): {{log}}","variableName":"severity"}},{"id":"cond","type":"condition","position":{"x":550,"y":200},"data":{"label":"Is Critical?","type":"condition","condition":"severity === Critical"}},{"id":"alert","type":"slack","position":{"x":800,"y":100},"data":{"label":"PagerDuty","type":"slack","content":"CRITICAL: {{log}}"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"classify"},{"id":"e2","source":"classify","target":"cond"},{"id":"e3","source":"cond","target":"alert","sourceHandle":"true"}]'::jsonb,
     true, true),

    ('Daily Standup Bot', 'Collect standups via scheduled form.', 'Dev',
     '[{"id":"sched","type":"schedule","position":{"x":50,"y":200},"data":{"label":"9am Daily","type":"schedule","cronExpression":"0 9 * * 1-5"}},{"id":"form","type":"form_trigger","position":{"x":300,"y":200},"data":{"label":"Standup Form","type":"form_trigger","formFields":[{"id":"1","label":"Yesterday","type":"textarea"},{"id":"2","label":"Today","type":"textarea"},{"id":"3","label":"Blockers","type":"textarea"}]}},{"id":"post","type":"slack","position":{"x":550,"y":200},"data":{"label":"Post Summary","type":"slack","slackChannel":"#standups"}}]'::jsonb,
     '[{"id":"e1","source":"sched","target":"form"},{"id":"e2","source":"form","target":"post"}]'::jsonb,
     true, false),
     
    ('Data Cleaner', 'Format phone numbers via JS.', 'Dev',
     '[{"id":"in","type":"input","position":{"x":50,"y":200},"data":{"label":"Phone","type":"input","content":"(555) 123-4567"}},{"id":"js","type":"javascript","position":{"x":300,"y":200},"data":{"label":"Format","type":"javascript","content":"return input.replace(/\\D/g, \"\")"}},{"id":"out","type":"output","position":{"x":550,"y":200},"data":{"label":"Clean","type":"output"}}]'::jsonb,
     '[{"id":"e1","source":"in","target":"js"},{"id":"e2","source":"js","target":"out"}]'::jsonb,
     true, false),
     
    ('Hello World', 'Simple starting point.', 'Dev',
     '[{"id":"start","type":"start","position":{"x":50,"y":200},"data":{"label":"Start","type":"start"}},{"id":"log","type":"javascript","position":{"x":300,"y":200},"data":{"label":"Log","type":"javascript","content":"console.log(\"Hello!\")"}}]'::jsonb,
     '[{"id":"e1","source":"start","target":"log"}]'::jsonb,
     true, false),

    -- Personal Templates
    ('Daily AI Journal', 'Reflect on your day with AI prompts.', 'Personal',
     '[{"id":"sched","type":"schedule","position":{"x":50,"y":200},"data":{"label":"8pm Daily","type":"schedule","cronExpression":"0 20 * * *"}},{"id":"prompt","type":"llm","position":{"x":300,"y":200},"data":{"label":"Gen Prompt","type":"llm","content":"Generate a reflective journal prompt.","variableName":"prompt"}},{"id":"email","type":"email","position":{"x":550,"y":200},"data":{"label":"Send Prompt","type":"email","emailTo":"me@example.com","content":"{{prompt}}"}}]'::jsonb,
     '[{"id":"e1","source":"sched","target":"prompt"},{"id":"e2","source":"prompt","target":"email"}]'::jsonb,
     true, false),

    ('Recipe Generator', 'Generate recipes from available ingredients.', 'Personal',
     '[{"id":"input","type":"input","position":{"x":50,"y":200},"data":{"label":"Ingredients","type":"input","content":"chicken, rice, garlic","variableName":"ingredients"}},{"id":"recipe","type":"llm","position":{"x":300,"y":200},"data":{"label":"Create Recipe","type":"llm","content":"Create a recipe using: {{ingredients}}","variableName":"recipe"}},{"id":"output","type":"output","position":{"x":550,"y":200},"data":{"label":"Recipe","type":"output"}}]'::jsonb,
     '[{"id":"e1","source":"input","target":"recipe"},{"id":"e2","source":"recipe","target":"output"}]'::jsonb,
     true, false),
     
    ('Daily Joke Email', 'Start your day with a laugh.', 'Personal',
     '[{"id":"sched","type":"schedule","position":{"x":50,"y":200},"data":{"label":"8 AM","type":"schedule"}},{"id":"joke","type":"llm","position":{"x":300,"y":200},"data":{"label":"Tell Joke","type":"llm","content":"Tell me a tech joke","variableName":"joke"}},{"id":"mail","type":"email","position":{"x":550,"y":200},"data":{"label":"Email","type":"email","content":"{{joke}}"}}]'::jsonb,
     '[{"id":"e1","source":"sched","target":"joke"},{"id":"e2","source":"joke","target":"mail"}]'::jsonb,
     true, false),

    -- Other Templates
    ('Support Ticket Router', 'Classify and route support tickets.', 'Other',
     '[{"id":"in","type":"input","position":{"x":50,"y":200},"data":{"label":"Ticket","type":"input","content":"Payment failed"}},{"id":"llm","type":"llm","position":{"x":300,"y":200},"data":{"label":"Classify","type":"llm","content":"Classify: {{in}} (Billing/Tech)","variableName":"cat"}},{"id":"sw","type":"router","position":{"x":550,"y":200},"data":{"label":"Route","type":"router","content":"{{cat}}"}}]'::jsonb,
     '[{"id":"e1","source":"in","target":"llm"},{"id":"e2","source":"llm","target":"sw"}]'::jsonb,
     true, false),
     
    ('Angry Customer Alert', 'Detect angry emails and alert manager.', 'Other',
     '[{"id":"hook","type":"webhook","position":{"x":50,"y":200},"data":{"label":"Email In","type":"webhook","variableName":"msg"}},{"id":"llm","type":"llm","position":{"x":300,"y":200},"data":{"label":"Sentiment","type":"llm","content":"Is this angry? {{msg}}","variableName":"mood"}},{"id":"cond","type":"condition","position":{"x":550,"y":200},"data":{"label":"Angry?","type":"condition","condition":"{{mood}} == Yes"}},{"id":"alert","type":"slack","position":{"x":800,"y":100},"data":{"label":"Alert Manager","type":"slack","content":"Angry customer: {{msg}}"}}]'::jsonb,
     '[{"id":"e1","source":"hook","target":"llm"},{"id":"e2","source":"llm","target":"cond"},{"id":"e3","source":"cond","target":"alert","sourceHandle":"true"}]'::jsonb,
     true, false),
     
    ('Meeting Summarizer', 'Convert transcript to bullet points.', 'Other',
     '[{"id":"in","type":"input","position":{"x":50,"y":200},"data":{"label":"Transcript","type":"input"}},{"id":"llm","type":"llm","position":{"x":300,"y":200},"data":{"label":"Summarize","type":"llm","content":"Bullet points: {{in}}"}},{"id":"not","type":"note","position":{"x":550,"y":200},"data":{"label":"Notes","type":"note","content":"{{llm.output}}"}}]'::jsonb,
     '[{"id":"e1","source":"in","target":"llm"},{"id":"e2","source":"llm","target":"not"}]'::jsonb,
     true, false),
     
    ('Customer Feedback Analyzer', 'Batch process feedback and identify patterns.', 'Other',
     '[{"id":"sheet","type":"sheets","position":{"x":50,"y":300},"data":{"label":"Read Feedback","type":"sheets","sheetOperation":"read","variableName":"feedback"}},{"id":"batch","type":"batch","position":{"x":350,"y":300},"data":{"label":"Analyze Each","type":"batch","batchInputVariable":"feedback","batchPrompt":"Categorize: {{item}}","variableName":"categories"}},{"id":"reason","type":"reasoning","position":{"x":650,"y":300},"data":{"label":"Find Patterns","type":"reasoning","reasoningGoal":"Identify top 3 issues","variableName":"priorities"}},{"id":"slack","type":"slack","position":{"x":950,"y":300},"data":{"label":"Alert Product","type":"slack","content":"{{priorities.answer}}"}}]'::jsonb,
     '[{"id":"e1","source":"sheet","target":"batch"},{"id":"e2","source":"batch","target":"reason"},{"id":"e3","source":"reason","target":"slack"}]'::jsonb,
     true, false);

-- =============================================================================
-- 6. SEED/UPDATE ALL NODE TYPES
-- =============================================================================
DELETE FROM public.admin_nodes;

INSERT INTO public.admin_nodes (node_type, display_name, description, category, icon_name, color, is_active, execution_type, config_schema)
VALUES 
    -- Triggers
    ('start', 'Start', 'Entry point for the workflow', 'Triggers', 'Play', '#10b981', true, 'javascript', '{}'),
    ('form_trigger', 'Form Trigger', 'Collect input via a web form', 'Triggers', 'FileText', '#6366f1', true, 'javascript', 
     '{"formTitle":{"type":"text","label":"Form Title"},"formDescription":{"type":"text","label":"Description"},"formFields":{"type":"json","label":"Form Fields (JSON Array)"}}'::jsonb),
    ('webhook', 'Webhook', 'Receive data via HTTP webhook', 'Triggers', 'Globe', '#8b5cf6', true, 'javascript',
     '{"variableName":{"type":"text","label":"Output Variable Name"}}'::jsonb),
    ('schedule', 'Schedule', 'Run on a cron schedule', 'Triggers', 'Clock', '#f59e0b', true, 'javascript',
     '{"cronExpression":{"type":"text","label":"Cron Expression"},"scheduleActive":{"type":"boolean","label":"Active"}}'::jsonb),
    
    -- AI
    ('llm', 'AI / LLM', 'Process with AI language models', 'AI', 'Brain', '#ec4899', true, 'llm_prompt',
     '{"provider":{"type":"select","label":"Provider","options":["gemini","anthropic","openai","groq"]},"model":{"type":"text","label":"Model"},"content":{"type":"textarea","label":"Prompt"},"temperature":{"type":"number","label":"Temperature"},"maxTokens":{"type":"number","label":"Max Tokens"},"systemInstruction":{"type":"textarea","label":"System Instruction"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('ai_vision', 'AI Vision', 'Analyze images with AI', 'AI', 'Eye', '#f43f5e', true, 'llm_prompt',
     '{"imageUrl":{"type":"text","label":"Image URL"},"content":{"type":"textarea","label":"Prompt"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('reasoning', 'Reasoning', 'Chain-of-thought reasoning', 'AI', 'Lightbulb', '#a855f7', true, 'llm_prompt',
     '{"reasoningGoal":{"type":"textarea","label":"Reasoning Goal"},"thinkingStyle":{"type":"select","label":"Thinking Style","options":["step-by-step","tree-of-thought","chain-of-thought"]},"maxIterations":{"type":"number","label":"Max Iterations"},"reasoningContext":{"type":"textarea","label":"Context"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('batch', 'Batch AI', 'Process multiple items with AI', 'AI', 'Layers', '#d946ef', true, 'llm_prompt',
     '{"batchInputVariable":{"type":"text","label":"Input Array Variable"},"batchPrompt":{"type":"textarea","label":"Prompt Template (use {{item}})"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    
    -- Logic
    ('condition', 'Condition', 'Branch based on condition', 'Logic', 'GitBranch', '#14b8a6', true, 'javascript',
     '{"condition":{"type":"text","label":"Condition Expression"}}'::jsonb),
    ('router', 'Router', 'Switch/case routing', 'Logic', 'Split', '#06b6d4', true, 'javascript',
     '{"content":{"type":"text","label":"Route Expression"},"routes":{"type":"json","label":"Route Names (JSON Array)"}}'::jsonb),
    ('javascript', 'JavaScript', 'Run custom JavaScript code', 'Logic', 'Code', '#eab308', true, 'javascript',
     '{"content":{"type":"textarea","label":"JavaScript Code"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('wait', 'Wait', 'Delay execution', 'Logic', 'Timer', '#64748b', true, 'javascript',
     '{"waitTimeMs":{"type":"number","label":"Wait Time (ms)"}}'::jsonb),
    ('approval', 'Approval', 'Human-in-the-loop approval', 'Logic', 'UserCheck', '#22c55e', true, 'javascript',
     '{"approvalMessage":{"type":"textarea","label":"Approval Message"},"approvers":{"type":"text","label":"Approvers (comma-separated)"}}'::jsonb),
    
    -- Integrations
    ('api_call', 'API Call', 'Make HTTP API requests', 'Integrations', 'Globe', '#3b82f6', true, 'api_call',
     '{"url":{"type":"text","label":"URL"},"method":{"type":"select","label":"Method","options":["GET","POST","PUT","DELETE","PATCH"]},"headers":{"type":"textarea","label":"Headers (JSON)"},"body":{"type":"textarea","label":"Body (JSON)"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('rss', 'RSS Feed', 'Read RSS feed items', 'Integrations', 'Rss', '#f97316', true, 'api_call',
     '{"url":{"type":"text","label":"RSS Feed URL"},"rssItemLimit":{"type":"number","label":"Item Limit"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('slack', 'Slack', 'Send messages to Slack', 'Integrations', 'MessageSquare', '#e11d48', true, 'api_call',
     '{"slackChannel":{"type":"text","label":"Channel"},"content":{"type":"textarea","label":"Message Content"}}'::jsonb),
    ('email', 'Email', 'Send emails via SMTP', 'Integrations', 'Mail', '#0ea5e9', true, 'api_call',
     '{"emailTo":{"type":"text","label":"To"},"emailSubject":{"type":"text","label":"Subject"},"content":{"type":"textarea","label":"Body"}}'::jsonb),
    ('sheets', 'Google Sheets', 'Read/write to Google Sheets', 'Integrations', 'Table', '#22c55e', true, 'api_call',
     '{"sheetId":{"type":"text","label":"Sheet ID"},"sheetOperation":{"type":"select","label":"Operation","options":["append","read"]},"sheetRange":{"type":"text","label":"Range (for read)"},"content":{"type":"textarea","label":"Row Data (JSON for append)"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('web_search', 'Web Search', 'Search the web', 'Integrations', 'Search', '#6366f1', true, 'api_call',
     '{"webQuery":{"type":"text","label":"Search Query"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('mcp', 'MCP', 'Model Context Protocol integration', 'Integrations', 'Plug', '#8b5cf6', true, 'api_call',
     '{"mcpServer":{"type":"text","label":"MCP Server URL"},"mcpTool":{"type":"text","label":"Tool Name"},"mcpParams":{"type":"textarea","label":"Parameters (JSON)"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    
    -- Data/Utils
    ('json', 'JSON', 'Parse, stringify, or pick JSON', 'Data', 'Braces', '#64748b', true, 'javascript',
     '{"jsonOperation":{"type":"select","label":"Operation","options":["parse","stringify","pick"]},"jsonKey":{"type":"text","label":"Key (for pick)"},"content":{"type":"textarea","label":"JSON Input"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('math', 'Math', 'Mathematical operations', 'Data', 'Calculator', '#8b5cf6', true, 'javascript',
     '{"mathExpression":{"type":"text","label":"Expression"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    ('text', 'Text', 'Text transformations', 'Data', 'Type', '#14b8a6', true, 'javascript',
     '{"textOperation":{"type":"select","label":"Operation","options":["uppercase","lowercase","trim","split","join","replace"]},"textSeparator":{"type":"text","label":"Separator"},"content":{"type":"textarea","label":"Text Input"},"variableName":{"type":"text","label":"Output Variable"}}'::jsonb),
    
    -- IO
    ('input', 'Input', 'User input variable', 'IO', 'TextCursor', '#3b82f6', true, 'javascript',
     '{"content":{"type":"textarea","label":"Default Value"},"variableName":{"type":"text","label":"Variable Name"}}'::jsonb),
    ('note', 'Note', 'Documentation note', 'IO', 'StickyNote', '#fbbf24', true, 'javascript',
     '{"content":{"type":"textarea","label":"Note Content"}}'::jsonb),
    ('output', 'Output', 'Display output result', 'IO', 'Eye', '#10b981', true, 'javascript',
     '{"content":{"type":"text","label":"Output Label"}}'::jsonb);

-- =============================================================================
-- DONE! Run this script in Supabase SQL Editor.
-- =============================================================================
