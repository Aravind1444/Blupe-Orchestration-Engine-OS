
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
for (const k in envConfig) {
  process.env[k] = envConfig[k];
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkLogs() {
  console.log('Checking logs for flow failures...');

  // 1. Check most recent run_history for failure
  const { data: runs, error: runError } = await supabase
    .from('run_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (runError) {
    console.error('Error fetching run_history:', runError);
  } else {
    console.log('--- Last 5 Run History Entries ---');
    runs.forEach(run => {
        console.log(`[${run.created_at}] Status: ${run.status}`);
        if (run.status === 'failed') {
            console.log('Logs:', JSON.stringify(run.logs, null, 2));
        }
    });
  }

  // 2. Check execution_logs (if accessed separately)
  const { data: logs, error: logError } = await supabase
    .from('execution_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (logError) {
      console.error('Error fetching execution_logs:', logError);
  } else {
      console.log('--- Last 10 Execution Logs ---');
      logs.forEach(l => {
          if (l.status === 'error') {
            console.log(`[${l.created_at}] Node: ${l.node_type} (${l.node_id}) Error: ${l.error}`);
            console.log('Output/Input:', l.input, l.output);
          }
      });
  }
}

checkLogs();
