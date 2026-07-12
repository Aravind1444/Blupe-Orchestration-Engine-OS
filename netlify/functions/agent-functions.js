// Netlify Serverless Function: Agent Function Calling
// Provides native function calling support for Gemini and Anthropic
// SECURITY: requires authentication + server-side credit metering

import { requireUser } from './utils/auth.js';
import { enforceBilling } from './utils/billing.js';
import { createClient } from '@supabase/supabase-js';
import { getCorsHeaders } from './utils/cors.js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_KEY || ''
);

export async function handler(event, context) {
    const corsHeaders = getCorsHeaders(event, true);
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const authResult = await requireUser(event);
    if (authResult.error) {
        return {
            statusCode: authResult.status || 401,
            headers: corsHeaders,
            body: JSON.stringify({ error: authResult.error })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { provider = 'gemini', apiKey } = body;

        if (authResult.user && authResult.user.id !== 'service_role') {
            const { data: allowed, error: rateLimitError } = await supabase.rpc('check_user_rate_limit', {
                p_user_id: authResult.user.id,
                p_endpoint: 'agent-functions',
                p_max_requests: 60,
                p_window_minutes: 60
            });
            if (!rateLimitError && allowed === false) {
                return {
                    statusCode: 429,
                    headers: corsHeaders,
                    body: JSON.stringify({ error: 'Too many requests. Rate limit exceeded.' })
                };
            }
        }

        const billingResult = await enforceBilling(authResult, 'llm', body);
        if (!billingResult.allowed) {
            return {
                statusCode: billingResult.statusCode || 402,
                headers: corsHeaders,
                body: JSON.stringify({ error: billingResult.error })
            };
        }

        const key = apiKey ||
            (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
            (process.env.GEMINI_API_KEY || process.env.API_KEY));

        if (!key) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: `Missing API Key for ${provider}` })
            };
        }

        if (provider === 'anthropic') {
            return await handleAnthropic(body, key);
        } else {
            return await handleGemini(body, key);
        }

    } catch (error) {
        console.error('[Agent Functions] Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: error.message })
        };
    }
};

/**
 * Validates and fixes plan steps to ensure atomicity.
 * Splits compound steps (e.g. "Do X and then Do Y") into separate steps.
 */
function validateAndFixPlan(steps) {
    if (!Array.isArray(steps)) return [];
    
    const flatSteps = [];
    for (const step of steps) {
        // Remove numbering if model included it (e.g. "1. Step")
        let cleanStep = step.replace(/^\d+\.\s*/, '').trim();
        
        // Split on explicitly compound signals " and then ", " and also "
        // We do NOT split on just " and " because it's too aggressive (e.g. "Research AI and ML")
        const subSteps = cleanStep.split(/ and then |; | followed by /i);
        
        subSteps.forEach(s => {
            const sTrim = s.trim();
            if (sTrim.length > 3) flatSteps.push(sTrim);
        });
    }
    return flatSteps;
}

// ============================================================================
// ANTHROPIC HANDLER
// ============================================================================
async function handleAnthropic(body, apiKey) {
    const { mode, goal, plan, currentStep, observations, failedAttempts, context: agentContext, tools, model } = body;
    
    // claude-sonnet-4-5 for agent planning and orchestration
    let claudeModel = model || 'claude-sonnet-4-5';
    
    console.log(`[Agent Functions] Anthropic mode=${mode}, model=${claudeModel}`);

    // Construct Messages & System Prompt
    let finalSystemPrompt = '';
    let userMessageContent = '';
    let anthropicTools = [];

    if (mode === 'plan') {
        finalSystemPrompt = `You are a detailed planning assistant. Break down the goal into granular steps.
AVAILABLE TOOLS:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

RULES:
1. Break goal into atomic, single-purpose steps.
2. ONE tool per step. NO compound steps.
3. Order: Research → synthesize_report → declare_artifact → Delivery (email/slack)
4. If the goal requires DELIVERING content (email, report, summary):
   a) Include a synthesize_report step (NOT llm_call) to produce a validated report artifact
   b) Include a declare_artifact step with the artifact_id returned by synthesize_report
   c) Include a send_email/send_slack step that references the artifact by ID
5. Use 'submit_plan' tool.`;

        userMessageContent = `GOAL: ${goal}\n\nCreate a detailed execution plan.`;
        
        anthropicTools = [{
            name: 'submit_plan',
            description: 'Submit the generated execution plan.',
            input_schema: {
                type: 'object',
                properties: {
                    steps: {
                        type: 'array',
                        description: 'Ordered list of atomic steps',
                        items: { type: 'string' }
                    }
                },
                required: ['steps']
            }
        }];

    } else if (mode === 'decide') {
        // Build Tools
        anthropicTools = tools.map(tool => ({
            name: tool.name,
            description: `${tool.description}\nWHEN TO USE: ${tool.whenToUse}\n(Cost: ${tool.creditCost})`,
            input_schema: buildParameterSchema(tool.inputSchema) 
        }));

        // Add FINISH - allow when on last step or beyond
        const canFinish = currentStep > plan.length;
        anthropicTools.push({
            name: 'FINISH',
            description: canFinish 
                ? 'Call this ONLY when goal is fully achieved.'
                : `DO NOT CALL THIS yet. Complete step ${currentStep}/${plan.length} first.`,
            input_schema: {
                type: 'object',
                properties: {
                    final_answer: { type: 'string', description: 'Comprehensive answer' }
                },
                required: ['final_answer']
            }
        });

        const planDisplay = plan.map((step, i) => 
            `${i + 1}. ${step}${i + 1 === currentStep ? ' ← CURRENT STEP' : (i + 1 < currentStep ? ' ✓ DONE' : '')}`
        ).join('\n');

        const observationsDisplay = observations.length > 0
            ? observations.map(o => `Step ${o.iteration} [${o.action}]: ${o.observation}`).join('\n')
            : 'None yet';

        finalSystemPrompt = `You are a tool selection agent.
You are on step ${currentStep} of ${plan.length}.
Execute step ${currentStep} now.
Do NOT call FINISH until all steps are done.`;

        userMessageContent = `<Goal>${goal}</Goal>
<Plan>
${planDisplay}
</Plan>
<Observations>
${observationsDisplay}
</Observations>
${failedAttempts.length ? `<Failed>\n${JSON.stringify(failedAttempts)}\n</Failed>` : ''}
<Context>
${typeof agentContext === 'string' ? agentContext : JSON.stringify(agentContext || {}, null, 2).substring(0, 1000)}
</Context>
Execute step ${currentStep}.`;
    }

    // Call Anthropic API
    try {
        console.log(`[Agent Functions] Calling Anthropic API with ${anthropicTools.length} tools`);
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: claudeModel,
                max_tokens: 1024,
                system: finalSystemPrompt,
                messages: [{ role: 'user', content: userMessageContent }],
                tools: anthropicTools,
                tool_choice: { type: 'any' } // Force tool use
            })
        });

        console.log(`[Agent Functions] Anthropic API Response Status: ${response.status}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Agent Functions] Anthropic API Error: ${response.status}`, errorText);
            throw new Error(`Anthropic API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log(`[Agent Functions] ===== FULL ANTHROPIC RESPONSE =====`);
        console.log(JSON.stringify(data, null, 2));
        console.log(`[Agent Functions] ===== END =====`);
        
        // Check structure
        if (!data.content || !Array.isArray(data.content)) {
            throw new Error(`Invalid response structure: ${JSON.stringify(data)}`);
        }
        
        // Parse Response
        const toolUse = data.content?.find(c => c.type === 'tool_use');
        
        if (!toolUse) {
            const contentTypes = data.content.map(c => c.type).join(', ');
            console.error(`[Agent Functions] NO TOOL_USE! Got: ${contentTypes}`);
            throw new Error(`Anthropic returned no tool_use. Stop: ${data.stop_reason}. Content types: ${contentTypes}`);
        }
        
        console.log(`[Agent Functions] ✓ Selected tool: ${toolUse.name}`);
        
        if (mode === 'plan') {
            let planArray = [goal];
            if (toolUse && toolUse.name === 'submit_plan' && toolUse.input.steps) {
                planArray = validateAndFixPlan(toolUse.input.steps);
            }
            console.log(`[Agent Functions] Plan result:`, planArray);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ plan: planArray, credits: 4 })
            };
        } else {
            if (toolUse) {
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({
                        tool: toolUse.name,
                        input: toolUse.input,
                        isFinal: toolUse.name === 'FINISH',
                        finalAnswer: toolUse.name === 'FINISH' ? toolUse.input.final_answer : null,
                        reasoning: `[Claude] Selected ${toolUse.name}`,
                        credits: 6,
                        native: true
                    })
                };
            }
            
            // Fallback
             return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    tool: 'error_no_tool_selected',
                    input: {},
                    isFinal: false,
                    reasoning: 'Claude did not return a tool use block.',
                    credits: 1,
                    native: false
                })
            };
        }

    } catch (e) {
        console.error(`[Agent Functions] Anthropic Handler Failed:`, e);
        throw new Error(`Anthropic Handler Failed: ${e.message}`);
    }
}

// ============================================================================
// GEMINI HANDLER (Legacy/Default)
// ============================================================================
async function handleGemini(body, apiKey) {
    const { mode, goal, plan, currentStep, observations, failedAttempts, context: agentContext, tools, model } = body;
    const geminiModel = model || 'gemini-3.1-flash-lite-preview';

    if (mode === 'plan') {
         const systemPrompt = `You are a detailed planning assistant. Your goal is to break down the user's request into a logical, step-by-step execution plan using the available tools.

AVAILABLE TOOLS:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

RULES:
1. Break the goal down into granular, ATOMIC, single-purpose steps.
2. Each step must use exactly one tool.
3. Order: Research → synthesize_report → declare_artifact → Delivery (email/slack)
4. If the goal requires DELIVERING content (email, report, summary):
   a) Include a synthesize_report step (NOT llm_call) to produce a validated report artifact
   b) Include a declare_artifact step with the artifact_id returned by synthesize_report
   c) Include a send_email/send_slack step that references the artifact by ID
5. NO compound steps - split them!

You MUST call the 'submit_plan' function with your list of steps.`;

            const userPrompt = `GOAL: ${goal}

Create a detailed execution plan.`;

            // Define the output schema for the plan
            const planTools = [{
                name: 'submit_plan',
                description: 'Submit the generated execution plan.',
                parameters: {
                    type: 'object',
                    properties: {
                        steps: {
                            type: 'array',
                            description: 'Ordered list of steps to execute the goal',
                            items: {
                                type: 'string',
                                description: 'Description of a single step (e.g., \"Search for X using web_search\")'
                            }
                        }
                    },
                    required: ['steps']
                }
            }];

            // Call Gemini with output coercion via tools
            const apiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: systemPrompt + '\n\n' + userPrompt }]
                        }],
                        tools: [{ function_declarations: planTools }],
                        tool_config: { function_calling_config: { mode: 'ANY' } },
                        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
                    })
                }
            );

            if (!apiRes.ok) throw new Error(`Gemini Plan API Error: ${await apiRes.text()}`);

            const data = await apiRes.json();
            const candidate = data.candidates?.[0];
            const parts = candidate?.content?.parts || [];
            const functionCall = parts.find(p => p.functionCall);

            let planArray = [goal];
            if (functionCall && functionCall.functionCall.name === 'submit_plan') {
                const args = functionCall.functionCall.args;
                if (args && Array.isArray(args.steps)) planArray = validateAndFixPlan(args.steps);
            } else {
                 const textPart = parts.find(p => p.text);
                 if (textPart) {
                    const lines = textPart.text.split('\n').filter(l => /^\d+\./.test(l.trim()));
                    if (lines.length > 0) planArray = validateAndFixPlan(lines.map(l => l.replace(/^\d+\.\s*/, '').trim()));
                 }
            }

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ plan: planArray, credits: 4 })
            };
    }

    if (mode === 'decide') {
        // Build Gemini function declarations
        const functionDeclarations = tools.map(tool => ({
            name: tool.name,
            description: `${tool.description}\nWHEN TO USE: ${tool.whenToUse}\n(Cost: ${tool.creditCost})`,
            parameters: buildParameterSchema(tool.inputSchema)
        }));

        const canFinish = currentStep > plan.length;
        functionDeclarations.push({
            name: 'FINISH',
            description: canFinish 
                ? 'Call this ONLY because you are on the final step AND the goal has been fully achieved.'
                : `DO NOT CALL THIS. You are on step ${currentStep} of ${plan.length}. Complete the remaining steps first.`,
            parameters: {
                type: 'object',
                properties: {
                    final_answer: { type: 'string', description: 'The complete answer' }
                },
                required: ['final_answer']
            }
        });

        const planDisplay = plan.map((step, i) => 
            `${i + 1}. ${step}${i + 1 === currentStep ? ' ← CURRENT STEP' : (i + 1 < currentStep ? ' ✓ DONE' : '')}`
        ).join('\n');

        const observationsDisplay = observations.length > 0
            ? observations.map(o => `Step ${o.iteration} [${o.action}]: ${o.observation}`).join('\n')
            : 'None yet';

        const failedDisplay = failedAttempts.length > 0
            ? failedAttempts.map(a => `- ${a.tool}: ${a.error || 'failed'}`).join('\n')
            : '';

        const systemPrompt = `You are a tool selection agent executing a multi-step plan.
CRITICAL RULES:
1. You are on step ${currentStep} of ${plan.length}. Execute the CURRENT STEP.
2. Do NOT call FINISH until you have completed ALL steps.
3. If a step requires sending email/slack, you MUST do it before finishing.
4. Use previous observations to inform your tool inputs.
5. DO NOT repeat failed attempts.

You have ${plan.length - currentStep + 1} steps remaining. Execute step ${currentStep} now.`;

        const userPrompt = `<Goal>${goal}</Goal>
<Plan>
${planDisplay}
</Plan>
<PreviousObservations>
${observationsDisplay}
</PreviousObservations>
${failedDisplay ? `<FailedAttempts>\n${failedDisplay}\nDO NOT retry these.\n</FailedAttempts>` : ''}
<Context>
${typeof agentContext === 'string' ? agentContext : JSON.stringify(agentContext || {}, null, 2).substring(0, 1500)}
</Context>
Execute step ${currentStep}: "${plan[currentStep - 1] || 'Complete the goal'}"`;

        const apiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
                    tools: [{ function_declarations: functionDeclarations }],
                    tool_config: { function_calling_config: { mode: 'ANY' } },
                    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 }
                })
            }
        );

        if (!apiRes.ok) throw new Error(`Gemini API Error: ${await apiRes.text()}`);

        const data = await apiRes.json();
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const functionCall = parts.find(p => p.functionCall);

        if (functionCall) {
            const { name, args } = functionCall.functionCall;
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    tool: name,
                    input: args,
                    isFinal: name === 'FINISH',
                    finalAnswer: name === 'FINISH' ? args?.final_answer : null,
                    reasoning: `Selected ${name}`,
                    credits: 6,
                    native: true
                })
            };
        }

        // Fallback
        const textPart = parts.find(p => p.text);
        const fallbackText = textPart?.text || 'No response';
        const jsonMatch = fallbackText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                    body: JSON.stringify({
                        tool: parsed.tool || 'error_no_tool_selected',
                        input: parsed.input || {},
                        isFinal: parsed.tool === 'FINISH' || parsed.is_final === true,
                        finalAnswer: parsed.final_answer || null,
                        reasoning: parsed.reasoning || fallbackText,
                        credits: 6,
                        native: false
                    })
                };
            } catch (e) {}
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({
                tool: 'error_no_tool_selected',
                input: {},
                isFinal: false,
                finalAnswer: null,
                reasoning: `Model error: No function call. Content: ${fallbackText.substring(0, 100)}...`,
                credits: 1,
                native: false
            })
        };
    }
}

/**
 * Build parameter schema compatible with both Gemini and Anthropic
 */
function buildParameterSchema(inputSchema) {
    const properties = {};
    const required = [];

    for (const [key, desc] of Object.entries(inputSchema)) {
        const descStr = String(desc).toLowerCase();
        let type = 'string';
        if (descStr.includes('number') || descStr.includes('integer')) type = 'number';
        else if (descStr.includes('boolean')) type = 'boolean';
        else if (descStr.includes('array') || descStr.includes('list')) type = 'array';
        else if (descStr.includes('object')) type = 'object';

        const propDef = { type, description: desc };

        if (type === 'array') {
            propDef.items = { type: 'string' }; // Required for Gemini
        }

        properties[key] = propDef;
        if (!descStr.includes('optional')) required.push(key);
    }

    return { type: 'object', properties, required };
}
