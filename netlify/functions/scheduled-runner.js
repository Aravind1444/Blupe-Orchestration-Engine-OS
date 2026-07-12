// Netlify Scheduled Function: CRON Runner
// Runs scheduled workflows server-side
// Requires: netlify.toml config with schedule

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export async function handler(event, context) {
    // Only allow scheduled invocations
    if (!context.scheduled && process.env.NODE_ENV !== 'development') {
        return {
            statusCode: 403,
            body: JSON.stringify({ error: 'This function only runs on schedule' })
        };
    }

    console.log('[Scheduled Runner] Starting scheduled job check...');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        console.error('[Scheduled Runner] Missing Supabase credentials');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    try {
        // Fetch flows with active schedules
        // Note: This assumes a schedule_config column or we check content.nodes
        const { data: flows, error } = await supabase
            .from('flows')
            .select('id, name, user_id, content')
            .not('content', 'is', null);

        if (error) throw error;

        const now = new Date();
        const currentMinute = now.getMinutes();
        const currentHour = now.getHours();
        let triggeredCount = 0;

        for (const flow of flows || []) {
            const nodes = flow.content?.nodes || [];
            
            // Find schedule nodes that are active
            const scheduleNodes = nodes.filter(n => 
                n.type === 'schedule' && 
                n.data?.scheduleActive === true &&
                n.data?.cronExpression
            );

            for (const schedNode of scheduleNodes) {
                const cronExp = schedNode.data.cronExpression;
                
                // Simple cron check for now (only checks minute and hour for basic schedules)
                // Format: minute hour day month weekday
                const parts = cronExp.split(/\s+/);
                if (parts.length !== 5) continue;

                const [cronMin, cronHour] = parts;
                
                // Check if should run this minute (simplified check)
                const minMatch = cronMin === '*' || cronMin === String(currentMinute) || 
                    (cronMin.startsWith('*/') && currentMinute % parseInt(cronMin.slice(2)) === 0);
                const hourMatch = cronHour === '*' || cronHour === String(currentHour);

                if (minMatch && hourMatch) {
                    console.log(`[Scheduled Runner] Triggering flow: ${flow.name} (${flow.id})`);
                    
                    // Here you would call your workflow executor
                    // For now, just log and record the trigger
                    await supabase.from('run_history').insert({
                        flow_id: flow.id,
                        user_id: flow.user_id,
                        status: 'scheduled_trigger',
                        triggered_by: 'Netlify Scheduled Function',
                        logs: [{ 
                            nodeId: schedNode.id, 
                            message: `Scheduled trigger at ${now.toISOString()}`,
                            timestamp: now.getTime()
                        }]
                    });

                    triggeredCount++;
                }
            }
        }

        console.log(`[Scheduled Runner] Complete. Triggered ${triggeredCount} flows.`);

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                success: true, 
                triggered: triggeredCount,
                timestamp: now.toISOString()
            })
        };

    } catch (err) {
        console.error('[Scheduled Runner] Error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message })
        };
    }
}

// Export config for Netlify Scheduled Functions
export const config = {
    schedule: '@hourly' // Runs every hour; change to "* * * * *" for every minute (Netlify Pro required)
};
