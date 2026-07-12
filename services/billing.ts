
import { supabase } from './supabase';
import { getEffectiveNodeType, isBuiltInNodeType } from './nodeContract';

declare global {
    interface Window {
        Razorpay: any;
    }
}

export class BillingService {

    // V2 Credit Cost Matrix
    // Base workflow execution: 15 credits (handled in executor.ts)

    static calculateRunCost(nodeType: string, model: string = '', isBYOK: boolean = false): number {
        // Email Node: 5 credits
        if (nodeType === 'email') return 5;

        // WhatsApp Send: 5 credits
        if (nodeType === 'whatsapp_send') return 5;

        // Razorpay Action: 5 credits
        if (nodeType === 'razorpay_action') return 5;

        // Telegram Send: 3 credits
        if (nodeType === 'telegram_send') return 3;

        // Discord Send: 3 credits
        if (nodeType === 'discord_send') return 3;

        // Web Search Node: 3 credits
        if (nodeType === 'web_search') return 3;

        // Vision Node: 15 credits
        if (nodeType === 'ai_vision') return 15;


        // Deep Research Node: 35 credits
        if (nodeType === 'deep_research') return 35;

        // Extract URL Node: 10 credits
        if (nodeType === 'extract_url') return 10;

        // Crawl Site Node: 25 credits
        if (nodeType === 'crawl_site') return 25;

        // Reasoning Node: 20 credits (platform mode), 3 credits (BYOK)
        if (nodeType === 'reasoning') {
            return isBYOK ? 3 : 20;
        }

        // Agent Node: Base 15 credits for orchestration, tools billed separately during execution
        if (nodeType === 'agent') {
            return 15; // Orchestration overhead only; tool costs are tracked in agentExecutor
        }

        // API Call: 2 credits
        if (nodeType === 'api_call') return 2;

        // Logic nodes (JavaScript, Condition, Router): 1 credit
        if (nodeType === 'javascript' || nodeType === 'condition' || nodeType === 'router') {
            return 1;
        }

        // Free nodes (Start, Input, Output, Note, Wait)
        if (['start', 'input', 'output', 'note', 'wait', 'form_trigger', 'webhook', 'schedule'].includes(nodeType)) {
            return 0;
        }

        // AI Nodes (LLM, Gemini, Vision)
        if (nodeType !== 'llm' && nodeType !== 'gemini' && nodeType !== 'ai_vision' && nodeType !== 'batch') {
            return 1; // Default for unrecognized nodes
        }

        // If BYOK is enabled, flat 3 credits for AI nodes
        if (isBYOK) {
            return 3;
        }

        // Platform mode: model-specific pricing
        switch (model) {
            // OpenAI - V2 Costs
            case 'gpt-5.1': return 20;
            case 'gpt-5-mini': return 8;
            case 'gpt-5-nano': return 4;

            // Anthropic - V2 Costs
            case 'claude-opus-4-5': return 35;
            case 'claude-sonnet-4-5': return 8;
            case 'claude-haiku-4-5': return 4;

            // Gemini - V2 Costs
            case 'gemini-3.1-pro-preview': return 12;
            case 'gemini-3.1-flash-lite-preview': return 4;

            // Groq / Open Models
            case 'llama-3.3-70b-versatile': return 5;
            case 'llama-3.1-8b-instant': return 3;
            case 'openai/gpt-oss-120b': return 6;
            case 'openai/gpt-oss-20b': return 4;

            // Legacy
            case 'gpt-4o': return 6;
            default:
                // Smart fallback based on name clues
                if (model.includes('nano') || model.includes('haiku') || model.includes('lite') || model.includes('instant')) return 4;
                if (model.includes('mini') || model.includes('flash') || model.includes('sonnet')) return 8;
                if (model.includes('opus') || model.includes('ultra')) return 35;
                if (model.includes('pro') || model.includes('5.1')) return 20;
                return 10; // Default Standard
        }
    }

    static calculateNodeRunCost(
        node: { type?: string; data?: { type?: string; model?: string; customCreditCost?: number } },
        isBYOK: boolean = false
    ): number {
        const effectiveType = getEffectiveNodeType(node as any);
        if (!isBuiltInNodeType(effectiveType)) {
            return Math.max(0, node.data?.customCreditCost ?? 1);
        }

        return this.calculateRunCost(effectiveType, node.data?.model || '', isBYOK);
    }

    static async loadRazorpay(): Promise<boolean> {
        return new Promise((resolve) => {
            if (window.Razorpay) {
                resolve(true);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    }

    static async initiateCheckout(plan: 'pro', userEmail: string, onSuccess: () => void) {
        const loaded = await this.loadRazorpay();
        if (!loaded) {
            alert('Failed to load payment gateway. Please check internet connection.');
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert("Please log in to upgrade.");
            return;
        }

        try {
            // 1. Create Order on Backend (JWT-bound; server ignores client userId)
            const { data: { session } } = await supabase.auth.getSession();
            const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) {
                authHeaders['Authorization'] = `Bearer ${session.access_token}`;
            }

            const res = await fetch(`${window.location.origin}/api/payment-create-order`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ plan })
            });

            if (!res.ok) throw new Error(await res.text());
            const orderData = await res.json();

            // 2. Open Razorpay Modal for Subscription
            const options = {
                key: orderData.keyId,
                subscription_id: orderData.id,
                name: "Blupe Enterprise",
                description: "Pro Plan Subscription - 5000 Credits/month",
                handler: async function (response: any) {
                    // 3. Verify Subscription Payment
                    try {
                        const verifyRes = await fetch(`${window.location.origin}/api/payment-verify`, {
                            method: 'POST',
                            headers: authHeaders,
                            body: JSON.stringify({
                                razorpay_subscription_id: response.razorpay_subscription_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                plan
                            })
                        });

                        if (verifyRes.ok) {
                            onSuccess();
                        } else {
                            const errData = await verifyRes.json();
                            alert(`Payment verification failed: ${errData.error || 'Unknown error'}`);
                        }
                    } catch (e) {
                        console.error(e);
                        alert('Payment processed but verification failed. Contact support.');
                    }
                },
                prefill: {
                    email: userEmail,
                },
                theme: {
                    color: "#4f46e5"
                }
            };

            const rzp1 = new window.Razorpay(options);
            rzp1.open();

        } catch (e: any) {
            console.error("Payment Error:", e);
            alert(`Payment initialization failed: ${e.message}`);
        }
    }
}
