-- ============================================================================
-- BLUPE Webhook Template SQL Statements
-- Run these in Supabase SQL Editor to add webhook-focused workflow templates
-- Created: 2025-12-12
-- ============================================================================

-- Template 1: Stripe Payment Handler
-- Triggered by Stripe webhooks to process payments and notify team
INSERT INTO admin_templates (
    id, name, description, category, is_active, is_featured,
    nodes, edges, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Stripe Payment Webhook Handler',
    'Automatically process Stripe payment events: log to Google Sheets, notify team on Slack, and send thank-you email to customers.',
    'Sales',
    true,
    true,
    '[
        {"id": "webhook", "type": "webhook", "position": {"x": 50, "y": 300}, "data": {"label": "Stripe Payment", "type": "webhook", "variableName": "stripe"}},
        {"id": "condition", "type": "condition", "position": {"x": 350, "y": 300}, "data": {"label": "Payment Succeeded?", "type": "condition", "condition": "stripe.type === \"payment_intent.succeeded\""}},
        {"id": "llm", "type": "llm", "position": {"x": 650, "y": 150}, "data": {"label": "Generate Thank You", "type": "llm", "provider": "gemini", "model": "gemini-2.5-flash", "content": "Write a brief, warm thank-you message for a customer who just made a purchase of ${{stripe.data.object.amount / 100}}. Keep it under 50 words.", "variableName": "thanks_msg"}},
        {"id": "email", "type": "email", "position": {"x": 950, "y": 100}, "data": {"label": "Send Thank You", "type": "email", "emailTo": "{{stripe.data.object.receipt_email}}", "emailSubject": "Thank you for your purchase!", "content": "{{thanks_msg}}"}},
        {"id": "sheets", "type": "sheets", "position": {"x": 950, "y": 250}, "data": {"label": "Log to Sheet", "type": "sheets", "sheetOperation": "append", "content": "[\"{{stripe.data.object.id}}\", \"{{stripe.data.object.amount}}\", \"{{stripe.data.object.receipt_email}}\", \"{{_webhook.timestamp}}\"]"}},
        {"id": "slack", "type": "slack", "position": {"x": 950, "y": 400}, "data": {"label": "Notify Sales", "type": "slack", "slackChannel": "#sales", "content": "💰 New payment received!\\nAmount: ${{stripe.data.object.amount / 100}}\\nCustomer: {{stripe.data.object.receipt_email}}"}}
    ]',
    '[
        {"id": "e1", "source": "webhook", "target": "condition", "animated": true},
        {"id": "e2", "source": "condition", "target": "llm", "sourceHandle": "true", "animated": true},
        {"id": "e3", "source": "llm", "target": "email", "animated": true},
        {"id": "e4", "source": "condition", "target": "sheets", "sourceHandle": "true"},
        {"id": "e5", "source": "condition", "target": "slack", "sourceHandle": "true"}
    ]',
    NOW(),
    NOW()
);

-- Template 2: GitHub PR Review Bot
-- Triggered by GitHub webhooks to auto-review PRs with AI
INSERT INTO admin_templates (
    id, name, description, category, is_active, is_featured,
    nodes, edges, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'GitHub PR Review Bot',
    'Automatically review pull requests using AI when opened on GitHub. Analyzes code changes and posts review feedback.',
    'Dev',
    true,
    true,
    '[
        {"id": "webhook", "type": "webhook", "position": {"x": 50, "y": 300}, "data": {"label": "GitHub PR Event", "type": "webhook", "variableName": "github"}},
        {"id": "condition", "type": "condition", "position": {"x": 350, "y": 300}, "data": {"label": "PR Opened?", "type": "condition", "condition": "github.action === \"opened\" || github.action === \"synchronize\""}},
        {"id": "api", "type": "api_call", "position": {"x": 650, "y": 300}, "data": {"label": "Fetch Diff", "type": "api_call", "url": "{{github.pull_request.diff_url}}", "method": "GET", "headers": "{\"Accept\": \"application/vnd.github.v3.diff\"}", "variableName": "diff"}},
        {"id": "reasoning", "type": "reasoning", "position": {"x": 950, "y": 300}, "data": {"label": "Review Code", "type": "reasoning", "provider": "openai", "model": "gpt-4o", "reasoningGoal": "Review this code diff for: 1) Bugs or potential issues, 2) Security concerns, 3) Code style improvements. Be constructive.", "reasoningContext": "PR Title: {{github.pull_request.title}}\\nDiff:\\n{{diff}}", "thinkingStyle": "chain-of-thought", "variableName": "review"}},
        {"id": "slack", "type": "slack", "position": {"x": 1250, "y": 300}, "data": {"label": "Post Review", "type": "slack", "slackChannel": "#code-reviews", "content": "🔍 AI Review for PR: {{github.pull_request.title}}\\nRepo: {{github.repository.full_name}}\\n\\n{{review.answer}}"}}
    ]',
    '[
        {"id": "e1", "source": "webhook", "target": "condition", "animated": true},
        {"id": "e2", "source": "condition", "target": "api", "sourceHandle": "true", "animated": true},
        {"id": "e3", "source": "api", "target": "reasoning", "animated": true},
        {"id": "e4", "source": "reasoning", "target": "slack", "animated": true}
    ]',
    NOW(),
    NOW()
);

-- Template 3: Lead Capture Form Handler
-- Process form submissions, enrich with web search, score with AI, and route
INSERT INTO admin_templates (
    id, name, description, category, is_active, is_featured,
    nodes, edges, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Lead Capture & Enrichment',
    'Process incoming form submissions via webhook: enrich leads with web search, score them with AI, and route hot leads to sales.',
    'Sales',
    true,
    true,
    '[
        {"id": "webhook", "type": "webhook", "position": {"x": 50, "y": 300}, "data": {"label": "Form Submission", "type": "webhook", "variableName": "lead"}},
        {"id": "search", "type": "web_search", "position": {"x": 350, "y": 300}, "data": {"label": "Enrich Company", "type": "web_search", "searchQuery": "{{lead.company}} company information employees funding", "variableName": "company_info"}},
        {"id": "llm", "type": "llm", "position": {"x": 650, "y": 300}, "data": {"label": "Score Lead", "type": "llm", "provider": "gemini", "model": "gemini-2.5-flash", "content": "Score this lead from 0-100 based on fit. Return ONLY a number.\\n\\nLead: {{lead.name}}, {{lead.email}}, {{lead.company}}\\nCompany Intel: {{company_info}}", "variableName": "score"}},
        {"id": "router", "type": "router", "position": {"x": 950, "y": 300}, "data": {"label": "Route by Score", "type": "router", "content": "parseInt(score) >= 80 ? \"HOT\" : parseInt(score) >= 50 ? \"WARM\" : \"COLD\""}},
        {"id": "slack", "type": "slack", "position": {"x": 1250, "y": 150}, "data": {"label": "Alert Sales", "type": "slack", "slackChannel": "#sales-leads", "content": "🔥 HOT LEAD!\\n{{lead.name}} at {{lead.company}}\\nEmail: {{lead.email}}\\nScore: {{score}}\\nIntel: {{company_info}}"}},
        {"id": "sheets", "type": "sheets", "position": {"x": 1250, "y": 300}, "data": {"label": "Save to CRM", "type": "sheets", "sheetOperation": "append", "content": "[\"{{lead.name}}\", \"{{lead.email}}\", \"{{lead.company}}\", \"{{score}}\", \"{{_webhook.timestamp}}\"]"}},
        {"id": "email", "type": "email", "position": {"x": 1250, "y": 450}, "data": {"label": "Auto-Reply", "type": "email", "emailTo": "{{lead.email}}", "emailSubject": "Thanks for reaching out!", "content": "Hi {{lead.name}},\\n\\nThanks for your interest! We will be in touch soon.\\n\\nBest,\\nThe Team"}}
    ]',
    '[
        {"id": "e1", "source": "webhook", "target": "search", "animated": true},
        {"id": "e2", "source": "search", "target": "llm", "animated": true},
        {"id": "e3", "source": "llm", "target": "router", "animated": true},
        {"id": "e4", "source": "router", "target": "slack", "sourceHandle": "HOT"},
        {"id": "e5", "source": "router", "target": "sheets", "sourceHandle": "default"},
        {"id": "e6", "source": "router", "target": "email", "sourceHandle": "default"}
    ]',
    NOW(),
    NOW()
);

-- Template 4: Typeform/Generic Form to Email Digest
-- Simple form processing with AI summary
INSERT INTO admin_templates (
    id, name, description, category, is_active, is_featured,
    nodes, edges, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Form Response Digest',
    'Collect form responses via webhook, summarize with AI, and send daily digest to your inbox.',
    'Marketing',
    true,
    false,
    '[
        {"id": "webhook", "type": "webhook", "position": {"x": 50, "y": 300}, "data": {"label": "Form Response", "type": "webhook", "variableName": "form"}},
        {"id": "sheets", "type": "sheets", "position": {"x": 350, "y": 200}, "data": {"label": "Log Response", "type": "sheets", "sheetOperation": "append", "content": "[\"{{form.email}}\", \"{{form.feedback}}\", \"{{_webhook.timestamp}}\"]"}},
        {"id": "llm", "type": "llm", "position": {"x": 350, "y": 400}, "data": {"label": "Analyze Sentiment", "type": "llm", "provider": "gemini", "model": "gemini-2.5-flash", "content": "Analyze the sentiment of this feedback (Positive/Neutral/Negative) and provide a 1-line summary:\\n\\n{{form.feedback}}", "variableName": "analysis"}},
        {"id": "condition", "type": "condition", "position": {"x": 650, "y": 400}, "data": {"label": "Negative?", "type": "condition", "condition": "analysis.toLowerCase().includes(\"negative\")"}},
        {"id": "slack", "type": "slack", "position": {"x": 950, "y": 350}, "data": {"label": "Alert Team", "type": "slack", "slackChannel": "#support", "content": "⚠️ Negative feedback received!\\nFrom: {{form.email}}\\nAnalysis: {{analysis}}"}}
    ]',
    '[
        {"id": "e1", "source": "webhook", "target": "sheets", "animated": true},
        {"id": "e2", "source": "webhook", "target": "llm", "animated": true},
        {"id": "e3", "source": "llm", "target": "condition", "animated": true},
        {"id": "e4", "source": "condition", "target": "slack", "sourceHandle": "true"}
    ]',
    NOW(),
    NOW()
);

-- Template 5: HubSpot Lead Handler via Webhook
-- When a new lead comes in, create/update in HubSpot
INSERT INTO admin_templates (
    id, name, description, category, is_active, is_featured,
    nodes, edges, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Webhook to HubSpot CRM',
    'Receive leads via webhook and automatically create or update contacts in HubSpot CRM with AI-enriched data.',
    'Sales',
    true,
    true,
    '[
        {"id": "webhook", "type": "webhook", "position": {"x": 50, "y": 300}, "data": {"label": "Incoming Lead", "type": "webhook", "variableName": "lead"}},
        {"id": "search", "type": "web_search", "position": {"x": 350, "y": 200}, "data": {"label": "Research Company", "type": "web_search", "searchQuery": "{{lead.company}} website linkedin industry", "variableName": "research"}},
        {"id": "llm", "type": "llm", "position": {"x": 650, "y": 300}, "data": {"label": "Extract Info", "type": "llm", "provider": "gemini", "model": "gemini-2.5-flash", "content": "Based on this research, extract: company industry, company size (small/medium/large), and a 1-line company description. Format as JSON: {\"industry\": \"...\", \"size\": \"...\", \"description\": \"...\"}\\n\\n{{research}}", "variableName": "enriched"}},
        {"id": "hubspot", "type": "hubspot", "position": {"x": 950, "y": 300}, "data": {"label": "Create Contact", "type": "hubspot", "hubspotOperation": "create_contact", "hubspotEmail": "{{lead.email}}", "hubspotProperties": "{\"firstname\": \"{{lead.name}}\", \"company\": \"{{lead.company}}\", \"industry\": \"{{enriched.industry}}\"}"}},
        {"id": "slack", "type": "slack", "position": {"x": 1250, "y": 300}, "data": {"label": "Notify Team", "type": "slack", "slackChannel": "#leads", "content": "✅ New contact added to HubSpot:\\n{{lead.name}} ({{lead.email}})\\nCompany: {{lead.company}} ({{enriched.size}})\\nIndustry: {{enriched.industry}}"}}
    ]',
    '[
        {"id": "e1", "source": "webhook", "target": "search", "animated": true},
        {"id": "e2", "source": "search", "target": "llm", "animated": true},
        {"id": "e3", "source": "llm", "target": "hubspot", "animated": true},
        {"id": "e4", "source": "hubspot", "target": "slack", "animated": true}
    ]',
    NOW(),
    NOW()
);

-- ============================================================================
-- VERIFICATION QUERY
-- Run this after inserting to verify templates were added
-- ============================================================================
SELECT 
    id, 
    name, 
    category, 
    is_featured,
    created_at
FROM admin_templates 
WHERE name LIKE '%Webhook%' 
   OR name LIKE '%Stripe%'
   OR name LIKE '%GitHub%'
   OR name LIKE '%Lead Capture%'
   OR name LIKE '%Form Response%'
   OR name LIKE '%HubSpot%'
ORDER BY is_featured DESC, created_at DESC;
