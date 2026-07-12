
import { generateText as generateGemini } from './geminiService';
import { getAuthHeaders } from './supabase';

export interface LLMRequest {
    provider: 'openai' | 'anthropic' | 'gemini' | 'groq' | 'ollama';
    model: string;
    prompt: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
    apiKey?: string;
}

export interface LLMResponse {
    text: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    cost?: number;
}

// Estimated costs per 1k tokens (Input/Output)
// Model names are the exact API model identifiers
const PRICING: Record<string, [number, number]> = {
    // OpenAI models
    'gpt-5.1': [0.03, 0.09],
    'gpt-5-mini': [0.015, 0.045],
    'gpt-5-nano': [0.005, 0.015],
    'gpt-4o': [0.005, 0.015], // Legacy fallback

    // Anthropic Claude models
    'claude-opus-4-5': [0.02, 0.10],
    'claude-sonnet-4-5': [0.004, 0.02],
    'claude-haiku-4-5': [0.0003, 0.0015],

    // Groq models (including open models)
    'llama-3.3-70b-versatile': [0.00059, 0.00079],
    'llama-3.1-8b-instant': [0.0001, 0.0001],
    'openai/gpt-oss-120b': [0.001, 0.002],
    'openai/gpt-oss-20b': [0.0005, 0.001],

    // Google Gemini models
    'gemini-3.1-pro-preview': [0.007, 0.021],
    'gemini-3.1-flash-lite-preview': [0.00005, 0.0001],
};

const calculateCost = (model: string, input: number, output: number): number => {
    const price = PRICING[model] || [0, 0];
    return (input / 1000) * price[0] + (output / 1000) * price[1];
};

export const callLLM = async (req: LLMRequest, meta?: { flowId?: string; flowOwnerId?: string }): Promise<LLMResponse> => {
    // 1. Gemini: Delegate to geminiService
    if (req.provider === 'gemini') {
        const text = await generateGemini(req.prompt, req.model, req.system, req.apiKey, meta);
        // Estimate cost for Gemini
        // ... simple estimation based on text length (4 chars/token)
        const inTokens = (req.prompt.length + (req.system?.length || 0)) / 4;
        const outTokens = text.length / 4;
        const cost = calculateCost(req.model, inTokens, outTokens);

        return {
            text,
            cost
        };
    }

    // 2. Ollama: Local Handling
    if (req.provider === 'ollama') {
        try {
            // Assumes Ollama is running locally on default port 11434
            // Requires `OLLAMA_ORIGINS="*"` environment variable set when running `ollama serve`
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: req.model,
                    prompt: req.system ? `System: ${req.system}\nUser: ${req.prompt}` : req.prompt,
                    stream: false,
                    options: {
                        temperature: req.temperature,
                        num_predict: req.maxTokens
                    }
                })
            });

            if (!res.ok) {
                throw new Error("Ollama connection failed. Ensure Ollama is running (ollama serve) with OLLAMA_ORIGINS=\"*\"");
            }

            const data = await res.json();
            const inputEst = data.prompt_eval_count || 0;
            const outputEst = data.eval_count || 0;

            return {
                text: data.response,
                usage: {
                    promptTokens: inputEst,
                    completionTokens: outputEst,
                    totalTokens: inputEst + outputEst
                },
                cost: 0 // Local is usually free
            };
        } catch (e: any) {
            throw new Error(`Ollama Error: ${e.message}. Is it running?`);
        }
    }

    // 3. Others (OpenAI, Anthropic, Groq): Call Proxy Backend
    try {
        let headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (req.apiKey) headers['x-api-key'] = req.apiKey;
        if (meta?.flowId) headers['x-flow-id'] = meta.flowId;
        if (meta?.flowOwnerId) headers['x-flow-owner-id'] = meta.flowOwnerId;

        headers = await getAuthHeaders(headers);

        const res = await fetch('/api/llm', {
            method: 'POST',
            headers,
            body: JSON.stringify(req)
        });

        if (!res.ok) {
            const err = await res.text();

            // If local proxy fails (404/500), try direct server port 3002 (as users might run backend there)
            // This is mostly for local dev convenience
            if ((res.status === 404 || res.status === 500) && window.location.hostname === 'localhost') {
                console.warn("[LLM] Proxy failed, attempting direct connection to port 3002...");
                try {
                    const directResponse = await fetch('http://localhost:3002/api/llm', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(req)
                    });
                    if (directResponse.ok) {
                        const data = await directResponse.json();
                        const cost = calculateCost(req.model, data.usage?.promptTokens || 0, data.usage?.completionTokens || 0);

                        return {
                            text: data.text || data.content || '',
                            usage: data.usage,
                            cost
                        };
                    }
                } catch (e2) {
                    console.warn("Direct connection failed", e2);
                }
            }

            if (res.status === 404 && err.includes('<!DOCTYPE html>')) {
                throw new Error(`Connection Error: Endpoint /api/llm returned HTML. Ensure 'node server.js' is running.`);
            }
            throw new Error(err || 'LLM API Failed');
        }

        const data = await res.json();

        let cost = 0;
        if (data.usage) {
            cost = calculateCost(req.model, data.usage.promptTokens, data.usage.completionTokens);
        }

        return {
            text: data.text || data.content || '', // data.content for consistency
            usage: data.usage,
            cost
        };
    } catch (e: any) {
        console.error("LLM Call Failed", e);
        throw e;
    }
};

