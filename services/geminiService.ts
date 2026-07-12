
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthHeaders } from "./supabase";

export const generateText = async (
  prompt: string,
  model: string = 'gemini-3.1-flash-lite-preview',
  systemInstruction?: string,
  apiKey?: string,
  meta?: { flowId?: string; flowOwnerId?: string }
): Promise<string> => {
  try {
    // Determine API key to use
    let keyToUse = apiKey;

    // Safely check for env var if key not provided
    if (!keyToUse) {
      try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
          // @ts-ignore
          keyToUse = import.meta.env.VITE_API_KEY || import.meta.env.API_KEY;
        }
      } catch (e) {
        // Ignore
      }
    }

    if (!keyToUse) {
      throw new Error("API Key is missing. Please add 'API_KEY' in the Secrets menu.");
    }

    const modelName = model || 'gemini-3.1-flash-lite-preview';

    // Security: Route through server proxy to hide API keys from network traffic
    // Previously: direct call to generativelanguage.googleapis.com exposed the key in browser DevTools
    let headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Pass owner ID for public flow execution
    if (meta?.flowOwnerId) {
      headers['x-flow-owner-id'] = meta.flowOwnerId;
    }

    headers = await getAuthHeaders(headers);

    const response = await fetch('/api/llm', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: 'gemini',
        model: modelName,
        prompt: systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt,
        temperature: 0.7,
        apiKey: keyToUse // Server receives key securely in request body
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.text || '';

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to generate content");
  }
};