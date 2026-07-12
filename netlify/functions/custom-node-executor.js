import { createClient } from '@supabase/supabase-js';
import nodeCrypto from 'node:crypto';
import AdmZip from 'adm-zip';
import { requireUser } from './utils/auth.js';
import { enforceBilling } from './utils/billing.js';
import { decrypt } from './secrets.js';
import { getCorsHeaders } from './utils/cors.js';

const BUILT_IN_NODE_TYPES = new Set([
  'start', 'form_trigger', 'webhook', 'schedule', 'gemini', 'llm', 'ai_vision',
  'reasoning', 'agent', 'batch', 'condition', 'router', 'javascript', 'wait',
  'approval', 'api_call', 'rss', 'slack', 'email', 'sheets', 'web_search',
  'deep_research', 'extract_url', 'crawl_site', 'mcp', 'hubspot', 'stripe',
  'json', 'math', 'text', 'input', 'note', 'output'
]);

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Blupe-Custom-Node-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const getEffectiveNodeType = (node) => node?.data?.type || node?.type || '';

// Flows embed a snapshot of the node definition at drag time, so admin_nodes
// template updates never reach existing flows on their own. Nodes that came
// from a definition (marked by customDefinitionId) are re-resolved by
// node_type at execution time; lookup is by node_type rather than id because
// re-seeding a definition deletes and re-inserts the row with a new id.
const definitionCache = new Map();
const DEFINITION_CACHE_TTL_MS = 60 * 1000;

const resolveCurrentDefinition = async (nodeType) => {
  if (!supabase || !nodeType) return null;

  const cached = definitionCache.get(nodeType);
  if (cached && cached.expires > Date.now()) return cached.definition;

  const { data, error } = await supabase
    .from('admin_nodes')
    .select('execution_type, execution_config, credit_cost, is_active')
    .eq('node_type', nodeType)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[CustomNode] Failed to resolve definition for "${nodeType}":`, error.message);
    return null;
  }

  definitionCache.set(nodeType, { definition: data || null, expires: Date.now() + DEFINITION_CACHE_TTL_MS });
  return data || null;
};

const getSiteUrl = () => {
  return (process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '');
};

const resolvePrimaryString = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && !Array.isArray(val)) {
    if (typeof val.answer === 'string') return val.answer;
    if (typeof val.text === 'string') return val.text;
    if (typeof val.summary === 'string') return val.summary;
    if (typeof val.content === 'string') return val.content;
    return JSON.stringify(val);
  }
  return String(val);
};

const interpolateVariables = (template, context, secrets) => {
  if (template === null || template === undefined) return template;
  if (typeof template !== 'string') return template;
  if (!template) return '';

  if (template.startsWith('{{') && template.endsWith('}}') && (template.match(/\{\{/g) || []).length === 1) {
    const key = template.slice(2, -2).trim();
    if (key.startsWith('env.')) return secrets[key.replace('env.', '')] || template;
    if (Object.prototype.hasOwnProperty.call(context, key)) return resolvePrimaryString(context[key]);

    const parts = key.split('.');
    if (parts.length > 1) {
      let current = context;
      for (const part of parts) {
        if (current === undefined || current === null) break;
        current = current[part];
      }
      if (current !== undefined) return resolvePrimaryString(current);
    }
  }

  return template.replace(/\{\{(.*?)\}\}/g, (_, rawKey) => {
    const key = rawKey.trim();
    if (key.startsWith('env.')) return secrets[key.replace('env.', '')] || `{{${key}}}`;
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return resolvePrimaryString(context[key]);
    }

    const parts = key.split('.');
    if (parts.length > 1) {
      let current = context;
      for (const part of parts) {
        if (current === undefined || current === null) return `{{${key}}}`;
        current = current[part];
      }
      return current !== undefined
        ? resolvePrimaryString(current)
        : `{{${key}}}`;
    }

    return `{{${key}}}`;
  });
};

const deepInterpolate = (value, context, secrets) => {
  if (Array.isArray(value)) return value.map(item => deepInterpolate(item, context, secrets));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepInterpolate(item, context, secrets)])
    );
  }
  return interpolateVariables(value, context, secrets);
};

const getNestedValue = (value, path) => {
  if (!path) return value;
  return path.split('.').reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, value);
};

const getProviderApiKey = (provider, secrets) => {
  let apiKey = secrets.API_KEY;
  if (provider === 'openai') apiKey = secrets.OPENAI_API_KEY || apiKey;
  if (provider === 'anthropic') apiKey = secrets.ANTHROPIC_API_KEY || apiKey;
  if (provider === 'groq') apiKey = secrets.GROQ_API_KEY || apiKey;
  if (provider === 'gemini') apiKey = secrets.GEMINI_API_KEY || apiKey;
  return apiKey;
};

const filterSecretsForSandbox = (code, secrets, capabilities = []) => {
  const filtered = {};
  if (!secrets || typeof secrets !== 'object') return filtered;

  // 1. Check capabilities for required secrets
  if (capabilities.includes('llm')) {
    for (const key of ['API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY']) {
      if (secrets[key] !== undefined) {
        filtered[key] = secrets[key];
      }
    }
  }
  if (capabilities.includes('sarvam')) {
    for (const key of ['SARVAM_API_KEY', 'SARVAM_SUBSCRIPTION_KEY']) {
      if (secrets[key] !== undefined) {
        filtered[key] = secrets[key];
      }
    }
  }

  // 2. Scan code for explicit references to secrets.KEY_NAME or secrets['KEY_NAME']
  if (code && typeof code === 'string') {
    const wordPattern = /\bsecrets\b/;
    if (wordPattern.test(code)) {
      let matchedAny = false;
      for (const [key, value] of Object.entries(secrets)) {
        const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const pattern = new RegExp(`secrets(?:\\s*\\.\\s*${escapedKey}|\\s*\\[\\s*['"\` ]\\s*${escapedKey}\\s*['"\` ]\\s*\\])`, 'i');
        if (pattern.test(code)) {
          filtered[key] = value;
          matchedAny = true;
        }
      }
      // If "secrets" word is present but no static key is explicitly matched,
      // fall back to passing all keys to preserve dynamic access compatibility.
      if (!matchedAny) {
        Object.assign(filtered, secrets);
      }
    }
  }

  return filtered;
};


const loadSecrets = async (ownerId) => {
  if (!supabase || !ownerId) return {};

  const { data } = await supabase
    .from('user_secrets')
    .select('key_name, value')
    .eq('user_id', ownerId);

  const secrets = {};
  for (const row of data || []) {
    const val = decrypt(row.value);
    if (val === '[Decryption Failed]') {
      throw new Error(`Decryption failed for secret "${row.key_name}". Please verify that SECRETS_MASTER_KEY is correctly configured and matches in both Netlify and Supabase dashboards.`);
    }
    secrets[row.key_name] = val;
  }
  return secrets;
};

const resolveSecretsOwnerId = async (authResult, flowId) => {
  if (authResult.user.id === 'service_role') {
    if (!flowId || !supabase) return null;
    const { data: flow } = await supabase.from('flows').select('user_id').eq('id', flowId).single();
    return flow?.user_id || null;
  }
  if (authResult.user.role === 'flow_owner') {
    return authResult.user.id;
  }
  if (flowId && supabase) {
    const { data: flow } = await supabase.from('flows').select('user_id').eq('id', flowId).maybeSingle();
    if (flow && flow.user_id !== authResult.user.id) {
      throw new Error('Not authorized to load secrets for this flow');
    }
  }
  return authResult.user.id;
};

const executeApiCallNode = async ({ node, context, secrets, executionConfig, customConfig }) => {
  const mergedConfig = deepInterpolate(customConfig || {}, context, secrets);
  const requestConfig = deepInterpolate(executionConfig.request || executionConfig.requestTemplate || {}, context, secrets);
  const url = requestConfig.url || executionConfig.url || executionConfig.endpoint || mergedConfig.url;
  const method = (requestConfig.method || executionConfig.method || mergedConfig.method || 'POST').toUpperCase();

  if (!url) {
    throw new Error('Custom API node is missing execution_config.url or execution_config.endpoint');
  }

  const headers = {
    ...(deepInterpolate(executionConfig.headers || {}, context, secrets)),
    ...(requestConfig.headers || {}),
  };
  const authType = executionConfig.authType || mergedConfig.authType;
  if (authType === 'bearer' && mergedConfig.accessToken) {
    headers.Authorization = `Bearer ${mergedConfig.accessToken}`;
  }
  if (authType === 'api_key') {
    headers[executionConfig.authHeader || 'X-API-Key'] = mergedConfig.apiKey || mergedConfig.accessToken || '';
  }

  let body = requestConfig.body;
  if (body === undefined && executionConfig.body !== undefined) {
    body = deepInterpolate(executionConfig.body, context, secrets);
  }
  if (body === undefined && mergedConfig.body !== undefined) {
    body = mergedConfig.body;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined || method === 'GET'
      ? undefined
      : (typeof body === 'string' ? body : JSON.stringify(body)),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`Custom API node failed: ${response.status} ${response.statusText}`);
  }

  return getNestedValue(payload, executionConfig.responsePath);
};

const executeJavascriptNode = async ({ context, secrets, executionConfig, customConfig }) => {
  const cloudRunUrl = process.env.CLOUD_RUN_CUSTOM_NODE_URL;
  if (!cloudRunUrl) {
    throw new Error('JavaScript execution requires a configured secure Sandbox runtime. Local execution is not allowed.');
  }

  const code = executionConfig.code || executionConfig.script;
  if (!code) {
    throw new Error('Custom JavaScript node is missing execution_config.code');
  }

  const resolvedSecrets = { ...(secrets || {}) };
  if (process.env.SARVAM_API_KEY && !resolvedSecrets.SARVAM_API_KEY) {
    resolvedSecrets.SARVAM_API_KEY = process.env.SARVAM_API_KEY;
  }

  const response = await fetch(cloudRunUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Blupe-Custom-Node-Secret': (() => {
        const s = process.env.CLOUD_RUN_CUSTOM_NODE_SECRET || process.env.BLUPE_CUSTOM_NODE_SECRET;
        if (!s) throw new Error('Custom node sandbox secret is not configured');
        return s;
      })(),
    },
    body: JSON.stringify({
      code,
      timeoutMs: Math.min(Math.max(Number(executionConfig.timeoutMs || 5000), 100), 30000),
      capabilities: ['json', 'crypto', 'log'],
      context,
      secrets: filterSecretsForSandbox(code, resolvedSecrets, ['json', 'crypto', 'log']),
      config: deepInterpolate(customConfig || {}, context, resolvedSecrets),
      llmEndpoint: `${getSiteUrl()}/api/llm`,
      llmDefaults: {
        provider: 'gemini',
        model: 'gemini-3.1-flash-lite-preview',
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Sandbox execution failed');
  }
  return payload.output;
};

const buildSarvamHelper = (secrets) => {
  const apiKey = (secrets && (secrets.SARVAM_API_KEY || secrets.SARVAM_SUBSCRIPTION_KEY)) || process.env.SARVAM_API_KEY;

  const getHeaders = () => {
    if (!apiKey) {
      throw new Error("Missing Sarvam API Key. Please add SARVAM_API_KEY to your secrets, or configure it on the platform.");
    }
    return {
      'api-subscription-key': apiKey,
      'Content-Type': 'application/json'
    };
  };

  return {
    translate: async (params) => {
      const extractCleanText = (textVal) => {
        if (!textVal) return '';
        if (typeof textVal === 'string') {
          const trimmed = textVal.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
              textVal = JSON.parse(trimmed);
            } catch (e) {}
          }
        }
        if (Array.isArray(textVal)) {
          if (textVal.length === 0) return '';
          return extractCleanText(textVal[0]);
        }
        if (typeof textVal === 'object' && textVal !== null) {
          const priorityKeys = [
            'translated_text',
            'translatedText',
            'transcript',
            'text',
            'output',
            'content',
            'message',
            'input',
            'result'
          ];
          for (const key of priorityKeys) {
            if (textVal[key] !== undefined && textVal[key] !== null) {
              return extractCleanText(textVal[key]);
            }
          }
          for (const val of Object.values(textVal)) {
            if (typeof val === 'string' && val.trim() !== '') {
              return val;
            }
          }
          return JSON.stringify(textVal);
        }
        return String(textVal);
      };

      const inputText = extractCleanText(params.input || params.text || '');

      const response = await fetch('https://api.sarvam.ai/translate', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          input: inputText,
          source_language_code: params.source_language_code || params.sourceLanguageCode || 'en-IN',
          target_language_code: params.target_language_code || params.targetLanguageCode || 'hi-IN',
          speaker_gender: params.speaker_gender || params.speakerGender || 'Female',
          mode: params.mode || 'formal',
          model: params.model || 'mayura:v1'
        })
      });
      if (!response.ok) {
        throw new Error(`Sarvam Translate API failed: ${response.status} - ${await response.text()}`);
      }
      const data = await response.json();
      return data;
    },
    textToSpeech: async (params) => {
      const extractCleanText = (textVal) => {
        if (!textVal) return '';
        if (typeof textVal === 'string') {
          const trimmed = textVal.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
              textVal = JSON.parse(trimmed);
            } catch (e) {}
          }
        }
        if (Array.isArray(textVal)) {
          if (textVal.length === 0) return '';
          return extractCleanText(textVal[0]);
        }
        if (typeof textVal === 'object' && textVal !== null) {
          const priorityKeys = [
            'translated_text',
            'translatedText',
            'transcript',
            'text',
            'output',
            'content',
            'message',
            'input',
            'result'
          ];
          for (const key of priorityKeys) {
            if (textVal[key] !== undefined && textVal[key] !== null) {
              return extractCleanText(textVal[key]);
            }
          }
          for (const val of Object.values(textVal)) {
            if (typeof val === 'string' && val.trim() !== '') {
              return val;
            }
          }
          return JSON.stringify(textVal);
        }
        return String(textVal);
      };

      const model = params.model || 'bulbul:v3';
      const textVal = extractCleanText(params.text || params.input || '');

      const requestBody = {
        text: textVal,
        speaker: params.speaker || 'shubh',
        target_language_code: params.target_language_code || params.targetLanguageCode || 'hi-IN',
        model: model,
        pace: params.pace ?? 1.0,
        audio_format: params.audio_format || params.audioFormat || 'wav'
      };

      if (model === 'bulbul:v2' && params.pitch !== undefined) {
        requestBody.pitch = params.pitch;
      }

      const response = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        throw new Error(`Sarvam TTS API failed: ${response.status} - ${await response.text()}`);
      }
      const data = await response.json();
      return { audio_content: data.audio_content || (data.audios && data.audios[0]) };
    },
    speechToText: async (params) => {
      const formData = new FormData();
      
      let fileBlob;
      let filename = 'audio.wav';
      
      if (params.file) {
        if (typeof params.file === 'string') {
          if (params.file.startsWith('http://') || params.file.startsWith('https://')) {
            const fileRes = await fetch(params.file);
            fileBlob = await fileRes.blob();
            filename = params.file.split('/').pop()?.split('?')[0] || 'audio.wav';
          } else if (params.file.includes('base64,')) {
            const base64Data = params.file.split('base64,')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            fileBlob = new Blob([buffer], { type: params.contentType || 'audio/wav' });
          } else {
            const buffer = Buffer.from(params.file, 'base64');
            fileBlob = new Blob([buffer], { type: params.contentType || 'audio/wav' });
          }
        } else {
          fileBlob = params.file;
        }
      } else {
        throw new Error("Missing 'file' parameter containing audio URL or Base64 data.");
      }
      
      formData.append('file', fileBlob, filename);
      formData.append('model', params.model || 'saaras:v3');
      if (params.language_code || params.languageCode) {
        formData.append('language_code', params.language_code || params.languageCode);
      }
      if (params.mode) {
        formData.append('mode', params.mode);
      }
      
      const response = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
          'api-subscription-key': apiKey
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Sarvam STT API failed: ${response.status} - ${await response.text()}`);
      }
      const data = await response.json();
      return data;
    },
    chat: async (params) => {
      const messages = params.messages || [{ role: 'user', content: params.prompt }];
      const response = await fetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: params.model || 'sarvam-2b',
          messages,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.max_tokens || params.maxTokens || 1024
        })
      });
      if (!response.ok) {
        throw new Error(`Sarvam Chat API failed: ${response.status} - ${await response.text()}`);
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content || data;
    },
    digitizeDocument: async (params) => {
      const log = params.log || console.log;
      const fileUrl = params.fileUrl || params.file_url;
      if (!fileUrl) {
        throw new Error("Missing 'fileUrl' parameter.");
      }
      
      const languageCode = params.languageCode || params.language_code || 'en-IN';
      const outputFormat = params.outputFormat || params.output_format || 'md';
      
      log(`Downloading file from URL: ${fileUrl}...`);
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) {
        throw new Error(`Failed to download file from URL: ${fileRes.status} - ${await fileRes.text()}`);
      }
      const fileBlob = await fileRes.blob();
      const filename = fileUrl.split('/').pop()?.split('?')[0] || 'document.pdf';
      
      log('Creating digitization job...');
      const createRes = await fetch('https://api.sarvam.ai/doc-digitization/job/v1', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          language_code: languageCode,
          output_format: outputFormat === 'md' ? 'markdown' : outputFormat
        })
      });
      if (!createRes.ok) {
        throw new Error(`Failed to create digitization job: ${createRes.status} - ${await createRes.text()}`);
      }
      const createData = await createRes.json();
      const jobId = createData.job_id;
      log(`Job created successfully. Job ID: ${jobId}`);
      
      log('Getting upload URL...');
      const uploadUrlRes = await fetch('https://api.sarvam.ai/doc-digitization/job/v1/upload-files', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          job_id: jobId,
          files: [filename]
        })
      });
      if (!uploadUrlRes.ok) {
        throw new Error(`Failed to get upload URL: ${uploadUrlRes.status} - ${await uploadUrlRes.text()}`);
      }
      const uploadUrlData = await uploadUrlRes.json();
      const uploadUrl = uploadUrlData.files?.[0]?.upload_url;
      if (!uploadUrl) {
        throw new Error("No upload URL returned from Sarvam API.");
      }
      
      log('Uploading file to storage...');
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': fileBlob.type || 'application/pdf'
        },
        body: fileBlob
      });
      if (!uploadRes.ok) {
        throw new Error(`Failed to upload file to storage: ${uploadRes.status} - ${await uploadRes.text()}`);
      }
      log('File uploaded successfully.');
      
      log('Starting digitization job...');
      const startRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({})
      });
      if (!startRes.ok) {
        throw new Error(`Failed to start digitization job: ${startRes.status} - ${await startRes.text()}`);
      }
      log('Job started successfully.');
      
      log('Polling job status...');
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes max
      let jobStatus = 'pending';
      let downloadUrl = '';
      
      while (attempts < maxAttempts) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/status`, {
          method: 'GET',
          headers: getHeaders()
        });
        if (!statusRes.ok) {
          log(`Warning: failed to fetch status: ${statusRes.status}. Retrying...`);
          continue;
        }
        
        const statusData = await statusRes.json();
        jobStatus = statusData.status || 'pending';
        log(`Polling status: ${jobStatus}`);
        
        if (jobStatus === 'completed') {
          downloadUrl = statusData.download_url || `https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/download-files`;
          break;
        } else if (jobStatus === 'failed') {
          throw new Error(`Sarvam digitization job failed: ${statusData.error_message || 'Unknown error'}`);
        }
      }
      
      if (jobStatus !== 'completed') {
        throw new Error("Timeout waiting for Sarvam document digitization job to complete.");
      }
      
      log('Downloading output archive...');
      const downloadRes = await fetch(downloadUrl, {
        method: 'GET',
        headers: getHeaders()
      });
      if (!downloadRes.ok) {
        throw new Error(`Failed to download output files: ${downloadRes.status} - ${await downloadRes.text()}`);
      }
      
      const downloadBuf = Buffer.from(await downloadRes.arrayBuffer());
      log('Parsing output ZIP archive...');
      const zip = new AdmZip(downloadBuf);
      const zipEntries = zip.getEntries();
      let parsedText = '';
      let structuredData = null;
      
      for (const entry of zipEntries) {
        const name = entry.entryName.toLowerCase();
        if (name.endsWith('.md') || name.endsWith('.html')) {
          parsedText = entry.getData().toString('utf8');
        } else if (name.endsWith('.json')) {
          try {
            structuredData = JSON.parse(entry.getData().toString('utf8'));
          } catch (e) {
            log(`Warning: failed to parse output JSON: ${e.message}`);
          }
        }
      }
      
      return { text: parsedText };
    }
  };
};


const executeLlmPromptNode = async ({ node, context, secrets, executionConfig, customConfig }) => {
  const mergedConfig = deepInterpolate(customConfig || {}, context, secrets);
  const provider = executionConfig.provider || mergedConfig.provider || node.data.provider || 'gemini';
  const model = executionConfig.model || mergedConfig.model || node.data.model || 'gemini-3.1-flash-lite-preview';
  const prompt = interpolateVariables(
    executionConfig.prompt || executionConfig.promptTemplate || mergedConfig.prompt || node.data.content || '',
    context,
    secrets,
  );
  const system = executionConfig.system
    ? interpolateVariables(executionConfig.system, context, secrets)
    : undefined;
  const apiKey = getProviderApiKey(provider, secrets);

  const response = await fetch(`${getSiteUrl()}/api/llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model,
      prompt,
      system,
      temperature: executionConfig.temperature ?? mergedConfig.temperature,
      maxTokens: executionConfig.maxTokens ?? mergedConfig.maxTokens,
      apiKey,
    }),
  });

  if (!response.ok) {
    throw new Error(`Custom LLM node failed: ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.text || payload.response || payload;
};

const executePluginNode = async ({ node, context, secrets, executionConfig, customConfig }) => {
  const cloudRunUrl = process.env.CLOUD_RUN_CUSTOM_NODE_URL;
  if (!cloudRunUrl) {
    throw new Error('Admin-authored plugins (plugin_js) can only be executed in the secure Cloud Run sandbox.');
  }

  // Ensure secrets object exists and inject platform key if needed
  const resolvedSecrets = { ...(secrets || {}) };
  if (process.env.SARVAM_API_KEY && !resolvedSecrets.SARVAM_API_KEY) {
    resolvedSecrets.SARVAM_API_KEY = process.env.SARVAM_API_KEY;
  }

  const response = await fetch(cloudRunUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Blupe-Custom-Node-Secret': (() => {
        const s = process.env.CLOUD_RUN_CUSTOM_NODE_SECRET || process.env.BLUPE_CUSTOM_NODE_SECRET;
        if (!s) throw new Error('Custom node sandbox secret is not configured');
        return s;
      })(),
    },
    body: JSON.stringify({
      code: executionConfig.code || executionConfig.script,
      timeoutMs: executionConfig.timeoutMs,
      capabilities: executionConfig.capabilities || [],
      context,
      secrets: filterSecretsForSandbox(executionConfig.code || executionConfig.script, resolvedSecrets, executionConfig.capabilities || []),
      config: deepInterpolate(customConfig || {}, context, resolvedSecrets),
      llmEndpoint: `${getSiteUrl()}/api/llm`,
      llmDefaults: {
        provider: executionConfig.provider || customConfig.provider || 'gemini',
        model: executionConfig.model || customConfig.model || 'gemini-3.1-flash-lite-preview',
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Cloud Run custom node execution failed');
  }
  return payload.output;
};

export async function handler(event) {
  const corsHeaders = getCorsHeaders(event, true);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Enforce authentication
  const authResult = await requireUser(event);
  if (authResult.error) {
    return {
      statusCode: authResult.status || 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: authResult.error }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const node = body.node;
    const context = body.context || {};
    const nodeType = getEffectiveNodeType(node);

    if (!node || !nodeType) {
      throw new Error('Missing node payload');
    }
    if (BUILT_IN_NODE_TYPES.has(nodeType)) {
      throw new Error(`Node type "${nodeType}" is built-in and must not be executed through the custom executor`);
    }

    let executionType = node.data?.customExecutionType;
    let executionConfig = node.data?.customExecutionConfig || {};
    let definitionCreditCost = null;
    const customConfig = node.data?.customConfig || {};

    // If guest runner, validate that they are executing the exact node configured in the published flow
    if (authResult.user.role === 'flow_owner') {
      if (!body.flowId) {
        throw new Error('Flow ID is required for guest execution');
      }
      const { data: flow, error: flowError } = await supabase
        .from('flows')
        .select('content')
        .eq('id', body.flowId)
        .single();
      
      if (flowError || !flow) {
        throw new Error('Failed to verify flow structure');
      }
      
      const dbNode = (flow.content?.nodes || []).find(n => n.id === node.id);
      if (!dbNode) {
        throw new Error('Node not found in flow structure');
      }
      
      const dbCode = dbNode.data?.customExecutionConfig?.code || dbNode.data?.customExecutionConfig?.script || '';
      const reqCode = executionConfig.code || executionConfig.script || '';
      
      if (dbCode !== reqCode || dbNode.data?.customExecutionType !== executionType) {
        throw new Error('Access denied: modified execution payload detected');
      }
    }

    // Definition-based nodes execute the current admin_nodes template rather
    // than the snapshot embedded in the flow. One-off nodes (no
    // customDefinitionId, e.g. agent JS tools) keep their inline code.
    if (node.data?.customDefinitionId) {
      const currentDefinition = await resolveCurrentDefinition(nodeType);
      if (currentDefinition && currentDefinition.execution_type) {
        executionType = currentDefinition.execution_type;
        executionConfig = currentDefinition.execution_config || {};
        definitionCreditCost = currentDefinition.credit_cost;
      }
    }

    let creditsUsed = Math.max(0, Number(definitionCreditCost ?? node.data?.customCreditCost ?? 1));
    const ownerId = await resolveSecretsOwnerId(authResult, body.flowId);
    const providedSecrets = body.secrets && Object.keys(body.secrets).length > 0 ? body.secrets : null;
    const secrets = providedSecrets && authResult.user.id !== 'service_role'
      ? providedSecrets
      : await loadSecrets(ownerId);

    // Dynamic credit cost for the Sarvam AI Master Node (when using platform keys)
    if (nodeType === 'sarvam_ai') {
      const capability = customConfig.capability || 'Translate';
      if (capability === 'Translate') creditsUsed = 8;
      else if (capability === 'Text-to-Speech') creditsUsed = 30;
      else if (capability === 'Speech-to-Text') creditsUsed = 12;
      else if (capability === 'Chat') creditsUsed = 20;
      else if (capability === 'Document Digitization') creditsUsed = 30;
    }

    // BYOK pricing override: if user provided their own key for Sarvam AI, charge a flat 1 credit
    const isSarvamNode = nodeType.startsWith('sarvam_');
    const isByok = secrets && (secrets.SARVAM_API_KEY || secrets.SARVAM_SUBSCRIPTION_KEY);
    if (isSarvamNode && isByok) {
      creditsUsed = 1;
    }

    // Server-side metering
    const billingResult = await enforceBilling(authResult, 'mcp-proxy', body);
    if (!billingResult.allowed) {
      return {
        statusCode: billingResult.statusCode || 402,
        headers: corsHeaders,
        body: JSON.stringify({ error: billingResult.error }),
      };
    }
    if (creditsUsed > 2 && authResult.user.id !== 'service_role' && supabase) {
      const extra = creditsUsed - 2;
      let extraError = null;
      if (authResult.user.role === 'flow_owner' && authResult.user.flowId) {
        const r = await supabase.rpc('charge_flow_owner', { p_flow_id: authResult.user.flowId, p_amount: extra });
        extraError = r.error;
      } else {
        const r = await supabase.rpc('deduct_credits_v2', { p_user_id: authResult.user.id, p_amount: extra });
        if (r.error || r.data === false) extraError = r.error || new Error('Insufficient credits');
      }
      if (extraError) {
        return {
          statusCode: 402,
          headers: corsHeaders,
          body: JSON.stringify({ error: extraError.message || 'Insufficient credits' }),
        };
      }
    }

    let output;
    switch (executionType) {
      case 'api_call':
        output = await executeApiCallNode({ node, context, secrets, executionConfig, customConfig });
        break;
      case 'javascript':
        output = await executeJavascriptNode({ context, secrets, executionConfig, customConfig });
        break;
      case 'llm_prompt':
        output = await executeLlmPromptNode({ node, context, secrets, executionConfig, customConfig });
        break;
      case 'plugin_js':
        // Fail closed — never local VM
        output = await executePluginNode({ node, context, secrets, executionConfig, customConfig });
        break;
      default:
        throw new Error(`Unsupported custom execution type: ${executionType || 'unknown'}`);
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ output, creditsUsed }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message || 'Custom node execution failed' }),
    };
  }
};
