import express from 'express';
import vm from 'node:vm';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';

// Import curated utility libraries to pre-load inside sandbox
import _ from 'lodash';
import dayjs from 'dayjs';
import * as cheerio from 'cheerio';
import { parse as csvParse } from 'csv-parse/sync';
import { stringify as csvStringify } from 'csv-stringify/sync';
import * as uuid from 'uuid';
import validator from 'validator';

const app = express();
app.use(express.json({ limit: '10mb' })); // Increased limit to allow processing larger payloads

const PORT = process.env.PORT || 8080;
const SHARED_SECRET = process.env.BLUPE_CUSTOM_NODE_SECRET || '';
if (!SHARED_SECRET) {
  console.error('[Sandbox] BLUPE_CUSTOM_NODE_SECRET is required — refusing to start without auth');
  process.exit(1);
}

const buildCryptoHelper = () => ({
  randomUUID: () => crypto.randomUUID(),
  sha256: (value) => crypto.createHash('sha256').update(String(value)).digest('hex'),
});

/** Block SSRF to private/link-local/metadata addresses */
const assertPublicHttpsUrl = (rawUrl) => {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Blocked protocol: ${u.protocol}`);
  }
  const host = u.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.local') ||
    host === '0.0.0.0'
  ) {
    throw new Error(`Blocked host: ${host}`);
  }
  // IPv4 private / link-local / loopback
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      throw new Error(`Blocked private IP: ${host}`);
    }
  }
  // IPv6 loopback / ULA / link-local
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    throw new Error(`Blocked IPv6 address: ${host}`);
  }
  return u.toString();
};

const assertAllowedLlmEndpoint = (endpoint) => {
  const u = new URL(assertPublicHttpsUrl(endpoint));
  const allowedHosts = new Set([
    'blupe.space',
    'www.blupe.space',
    'bloope.netlify.app',
    'localhost',
    '127.0.0.1',
  ]);
  const host = u.hostname.toLowerCase();
  if (!allowedHosts.has(host) && !host.endsWith('.netlify.app')) {
    throw new Error(`LLM endpoint host not allowed: ${host}`);
  }
  if (!u.pathname.includes('/api/llm') && !u.pathname.endsWith('/llm')) {
    // Prefer platform LLM proxy paths only
    throw new Error(`LLM endpoint path not allowed: ${u.pathname}`);
  }
  return u.toString();
};

// Expose simple HTTP methods with auto-JSON parsing and response status validation
const buildHttpHelpers = () => {
  const request = async (url, options = {}) => {
    const safeUrl = assertPublicHttpsUrl(url);
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    const response = await fetch(safeUrl, { ...options, headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP Request failed (${options.method || 'GET'} ${safeUrl}): ${response.status} - ${errorText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  };

  return {
    get: (url, headers) => request(url, { method: 'GET', headers }),
    post: (url, body, headers) => request(url, {
      method: 'POST',
      headers,
      body: typeof body === 'object' ? JSON.stringify(body) : body
    }),
    put: (url, body, headers) => request(url, {
      method: 'PUT',
      headers,
      body: typeof body === 'object' ? JSON.stringify(body) : body
    }),
    delete: (url, headers) => request(url, { method: 'DELETE', headers })
  };
};

const buildLlmHelper = async (endpoint, defaults, secrets, request) => {
  const safeEndpoint = assertAllowedLlmEndpoint(endpoint);
  const provider = request.provider || defaults.provider;
  const model = request.model || defaults.model;
  let apiKey = secrets.API_KEY;
  if (provider === 'openai') apiKey = secrets.OPENAI_API_KEY || apiKey;
  if (provider === 'anthropic') apiKey = secrets.ANTHROPIC_API_KEY || apiKey;
  if (provider === 'groq') apiKey = secrets.GROQ_API_KEY || apiKey;
  if (provider === 'gemini') apiKey = secrets.GEMINI_API_KEY || apiKey;

  const response = await fetch(safeEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model,
      prompt: request.prompt,
      system: request.system,
      temperature: request.temperature || 0.7,
      maxTokens: request.maxTokens || 1024,
      apiKey,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM helper failed: ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.text || payload.response || payload;
};

const buildSarvamHelper = (secrets) => {
  const apiKey = secrets && (secrets.SARVAM_API_KEY || secrets.SARVAM_SUBSCRIPTION_KEY);

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

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/', async (req, res) => {
  try {
    if (req.get('X-Blupe-Custom-Node-Secret') !== SHARED_SECRET) {
      return res.status(401).json({ error: 'Unauthorized custom node sandbox request' });
    }

    const {
      code,
      timeoutMs = 5000,
      capabilities = [],
      context = {},
      secrets = {},
      config = {},
      llmEndpoint,
      llmDefaults = {},
    } = req.body || {};

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing plugin_js code payload' });
    }
    if (!llmEndpoint) {
      return res.status(400).json({ error: 'Missing llmEndpoint' });
    }

    const logs = [];
    const helpers = {};

    if (capabilities.includes('fetch')) {
      helpers.fetch = fetch;
    }
    if (capabilities.includes('llm')) {
      helpers.llm = async (request) => buildLlmHelper(llmEndpoint, llmDefaults, secrets, request);
    }
    if (capabilities.includes('json')) {
      helpers.json = {
        parse: JSON.parse,
        stringify: JSON.stringify,
      };
    }
    if (capabilities.includes('crypto')) {
      helpers.crypto = buildCryptoHelper();
    }
    if (capabilities.includes('log')) {
      helpers.log = (...args) => logs.push(args.map(item => String(item)).join(' '));
    }
    if (capabilities.includes('sarvam')) {
      helpers.sarvam = buildSarvamHelper(secrets);
    }
    
    // Always expose simplified HTTP helpers
    helpers.http = buildHttpHelpers();

    const sandbox = {
      context,
      input: context,
      secrets,
      config,
      helpers,
      console: {
        log: (...args) => logs.push(args.map(item => String(item)).join(' ')),
      },
      // Expose global libraries directly for non-tech-savvy simplicity
      _,
      lodash: _,
      dayjs,
      cheerio,
      csvParse,
      csvStringify,
      uuid,
      validator
    };

    const wrappedCode = `
      const __blupeRunner = async () => {
        ${code}
      };
      __blupeRunner();
    `;
    const script = new vm.Script(wrappedCode);
    const vmContext = vm.createContext(sandbox);
    const result = script.runInContext(vmContext, {
      timeout: Math.min(Math.max(Number(timeoutMs), 100), 30000),
    });
    const output = await Promise.resolve(result);

    return res.status(200).json({ output, logs });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Sandbox execution failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Blupe custom node sandbox listening on ${PORT}`);
});
