-- =============================================================================
-- SQL: Seed Sarvam AI Master Node
-- Run this in Supabase SQL Editor to enable the consolidated Sarvam AI node.
-- =============================================================================

-- Delete the previous split nodes and any existing master node
DELETE FROM admin_nodes WHERE node_type IN (
    'sarvam_translate', 
    'sarvam_tts', 
    'sarvam_stt', 
    'sarvam_chat', 
    'sarvam_doc_digitize',
    'sarvam_ai'
);

-- Insert the unified Sarvam AI Master Node
INSERT INTO admin_nodes (
    node_type,
    display_name,
    description,
    category,
    icon_name,
    color,
    config_schema,
    default_config,
    execution_type,
    execution_config,
    credit_cost,
    is_active
) VALUES (
    'sarvam_ai',
    'Sarvam AI',
    'Execute translation, text-to-speech, speech-to-text, chat completions, or document digitization in one unified node',
    'AI',
    'Brain',
    '#8B5CF6',
    '{
        "capability": {
            "type": "select",
            "label": "Selected Capability",
            "options": ["Translate", "Text-to-Speech", "Speech-to-Text", "Chat", "Document Digitization"]
        },
        
        "translate_info": {
            "type": "info",
            "placeholder": "Translate text across 11 Indic languages & English using high-quality translation models.",
            "dependsOn": { "capability": "Translate" }
        },
        "input": {
            "type": "textarea",
            "label": "Text to Translate",
            "placeholder": "e.g. Hello, how are you? or {{nodeName.output}}",
            "dependsOn": { "capability": "Translate" }
        },
        "source_language_code": {
            "type": "select",
            "label": "Source Language",
            "options": ["en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN", "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "od-IN", "ur-IN"],
            "dependsOn": { "capability": "Translate" }
        },
        "target_language_code": {
            "type": "select",
            "label": "Target Language",
            "options": ["en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN", "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "od-IN", "ur-IN"],
            "dependsOn": { "capability": "Translate" }
        },
        "speaker_gender": {
            "type": "select",
            "label": "Speaker Gender / Voice Tone",
            "options": ["Female", "Male"],
            "dependsOn": { "capability": "Translate" }
        },
        "mode": {
            "type": "select",
            "label": "Translation Tone Mode",
            "options": ["formal", "classic-colloquial", "modern-colloquial"],
            "dependsOn": { "capability": "Translate" }
        },

        "tts_info": {
            "type": "info",
            "placeholder": "Generate audio speech using Bulbul text-to-speech engine.",
            "dependsOn": { "capability": "Text-to-Speech" }
        },
        "text": {
            "type": "textarea",
            "label": "Text to Synthesize",
            "placeholder": "Enter text to convert to speech",
            "dependsOn": { "capability": "Text-to-Speech" }
        },
        "tts_target_language_code": {
            "type": "select",
            "label": "Language",
            "options": ["en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN", "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "od-IN"],
            "dependsOn": { "capability": "Text-to-Speech" }
        },
        "tts_model": {
            "type": "select",
            "label": "TTS Model Version",
            "options": ["bulbul:v3", "bulbul:v2"],
            "dependsOn": { "capability": "Text-to-Speech" }
        },
        "speaker": {
            "type": "select",
            "label": "Voice Speaker Model",
            "options": ["aditya", "advait", "amit", "anand", "ashutosh", "aayan", "dev", "gokul", "ishita", "kabir", "kavitha", "kavya", "manan", "mani", "mohit", "neha", "pooja", "priya", "rahul", "ratan", "rehan", "ritu", "rohan", "roopa", "rupali", "shreya", "shruti", "shubh", "simran", "soham", "suhani", "sumit", "sunny", "tanya", "tarun", "varun", "vijay"],
            "dependsOn": { "capability": "Text-to-Speech" }
        },
        "audio_format": {
            "type": "select",
            "label": "Output Audio Format",
            "options": ["wav", "mp3"],
            "dependsOn": { "capability": "Text-to-Speech" }
        },
        "pace": {
            "type": "number",
            "label": "Speed Pace (0.5 to 2.0)",
            "placeholder": "1.0",
            "dependsOn": { "capability": "Text-to-Speech" }
        },
        "pitch": {
            "type": "number",
            "label": "Pitch Tuning (-20 to 20)",
            "placeholder": "0",
            "dependsOn": { "capability": "Text-to-Speech", "tts_model": "bulbul:v2" }
        },

        "stt_info": {
            "type": "info",
            "placeholder": "Transcribe spoken audio to text using Saaras speech-to-text models.",
            "dependsOn": { "capability": "Speech-to-Text" }
        },
        "file": {
            "type": "text",
            "label": "Audio Source URL / Base64",
            "placeholder": "https://example.com/audio.wav or base64 data",
            "dependsOn": { "capability": "Speech-to-Text" }
        },
        "stt_language_code": {
            "type": "select",
            "label": "Audio Language (Optional)",
            "options": ["auto", "hi-IN", "bn-IN", "ta-IN", "te-IN", "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "od-IN", "ur-IN"],
            "dependsOn": { "capability": "Speech-to-Text" }
        },
        "stt_model": {
            "type": "select",
            "label": "Transcription Model",
            "options": ["saaras:v3", "saaras:v2"],
            "dependsOn": { "capability": "Speech-to-Text" }
        },
        "stt_mode": {
            "type": "select",
            "label": "Output Mode",
            "options": ["transcribe", "translate", "verbatim"],
            "dependsOn": { "capability": "Speech-to-Text" }
        },

        "chat_info": {
            "type": "info",
            "placeholder": "Ask context-aware questions to Indic-focused conversational LLM models.",
            "dependsOn": { "capability": "Chat" }
        },
        "prompt": {
            "type": "textarea",
            "label": "User Query / Prompt",
            "placeholder": "Ask the AI model something",
            "dependsOn": { "capability": "Chat" }
        },
        "system": {
            "type": "textarea",
            "label": "System Instructions (Optional)",
            "placeholder": "You are a helpful assistant...",
            "dependsOn": { "capability": "Chat" }
        },
        "chat_model": {
            "type": "select",
            "label": "Indic LLM Model",
            "options": ["sarvam-105b", "sarvam-30b"],
            "dependsOn": { "capability": "Chat" }
        },
        "temperature": {
            "type": "number",
            "label": "Creativity Temperature (0.0 to 1.0)",
            "placeholder": "0.7",
            "dependsOn": { "capability": "Chat" }
        },
        "maxTokens": {
            "type": "number",
            "label": "Max Response Tokens",
            "placeholder": "1024",
            "dependsOn": { "capability": "Chat" }
        },

        "doc_info": {
            "type": "info",
            "placeholder": "Digitize, scan, and extract text structured formatting from images or PDF documents.",
            "dependsOn": { "capability": "Document Digitization" }
        },
        "file_url": {
            "type": "text",
            "label": "Document URL",
            "placeholder": "https://example.com/document.pdf",
            "dependsOn": { "capability": "Document Digitization" }
        },
        "doc_language_code": {
            "type": "select",
            "label": "Primary Document Language",
            "options": ["en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN", "mr-IN", "gu-IN", "kn-IN", "ml-IN", "pa-IN", "od-IN", "ur-IN"],
            "dependsOn": { "capability": "Document Digitization" }
        },
        "output_format": {
            "type": "select",
            "label": "Output Document Format",
            "options": ["md", "html"],
            "dependsOn": { "capability": "Document Digitization" }
        },

        "variableName": {
            "type": "text",
            "label": "Output Variable Name",
            "placeholder": "sarvam_output"
        }
    }'::jsonb,
    '{
        "capability": "Translate",
        "input": "",
        "source_language_code": "en-IN",
        "target_language_code": "hi-IN",
        "speaker_gender": "Female",
        "mode": "formal",
        "text": "",
        "tts_target_language_code": "hi-IN",
        "tts_model": "bulbul:v3",
        "speaker": "shubh",
        "audio_format": "mp3",
        "pace": 1.0,
        "pitch": 0,
        "file": "",
        "stt_language_code": "auto",
        "stt_model": "saaras:v3",
        "stt_mode": "transcribe",
        "prompt": "",
        "system": "",
        "chat_model": "sarvam-105b",
        "temperature": 0.7,
        "maxTokens": 1024,
        "file_url": "",
        "doc_language_code": "en-IN",
        "output_format": "md",
        "variableName": "sarvam_output"
    }'::jsonb,
    'plugin_js',
    '{
        "capabilities": ["sarvam", "log", "fetch"],
        "code": "helpers.log(`Starting Sarvam AI - ${config.capability}...`);\nconst capability = config.capability || ''Translate'';\n\nif (capability === ''Translate'') {\n  const result = await helpers.sarvam.translate({\n    input: config.input,\n    source_language_code: config.source_language_code,\n    target_language_code: config.target_language_code,\n    speaker_gender: config.speaker_gender,\n    mode: config.mode\n  });\n  helpers.log(''Translation completed successfully.'');\n  return result.translated_text;\n} else if (capability === ''Text-to-Speech'') {\n  const result = await helpers.sarvam.textToSpeech({\n    text: config.text,\n    target_language_code: config.tts_target_language_code,\n    speaker: config.speaker,\n    model: config.tts_model,\n    audio_format: config.audio_format,\n    pace: config.pace,\n    pitch: config.pitch\n  });\n  helpers.log(''Speech synthesis completed.'');\n  return result.audio_content;\n} else if (capability === ''Speech-to-Text'') {\n  const options = {\n    file: config.file,\n    model: config.stt_model,\n    mode: config.stt_mode\n  };\n  if (config.stt_language_code && config.stt_language_code !== ''auto'') {\n    options.language_code = config.stt_language_code;\n  }\n  const result = await helpers.sarvam.speechToText(options);\n  helpers.log(''Audio transcription finished.'');\n  return result.transcript;\n} else if (capability === ''Chat'') {\n  const result = await helpers.sarvam.chat({\n    prompt: config.prompt,\n    system: config.system,\n    model: config.chat_model,\n    temperature: config.temperature,\n    maxTokens: config.maxTokens\n  });\n  helpers.log(''Chat completion response received.'');\n  return result.choices?.[0]?.message?.content || result;\n} else if (capability === ''Document Digitization'') {\n  const result = await helpers.sarvam.digitizeDocument({\n    fileUrl: config.file_url,\n    languageCode: config.doc_language_code,\n    outputFormat: config.output_format,\n    log: helpers.log\n  });\n  helpers.log(''Document Digitization completed.'');\n  return result.text;\n} else {\n  throw new Error(`Unsupported capability: ${capability}`);\n}"
    }'::jsonb,
    8,
    true
);
