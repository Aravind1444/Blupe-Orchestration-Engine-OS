
import React, { useEffect, useState, useMemo } from 'react';
import { Node } from 'reactflow';
import { NodeData, NodeType, FormField, LLMProvider, NodeStatus, Secret, AdminNode, McpServerConfig } from '../types';
import { X, Save, Trash2, HelpCircle, AlertTriangle, Play, AlertCircle, Plus, Clock, Settings, CheckCircle2, Table, LayoutList, RefreshCw, Radio, Zap, Search, Key, Server, Cpu, Shield, Target, Wrench, Brain, ChevronDown, ChevronUp, CreditCard, Lightbulb, Lock, Terminal, Code, MessageSquare, MessageCircle, Bot, Download, Volume2 } from 'lucide-react';
import clsx from 'clsx';
import cronstrue from 'cronstrue';
import { admin, getAuthHeaders } from '../services/supabase';
import { getSlackAccessToken } from '../services/oauth';
import { adminNodeFromSnapshot, getEffectiveNodeType, isBuiltInNodeType } from '../services/nodeContract';

import { parseMcpConfig, isPlaceholderValue, getFriendlyCredentialLabel, ParsedMcpServer } from '../services/mcpParser';


const isBase64Audio = (output: any): boolean => {
  if (!output) return false;
  if (typeof output === 'string') {
    const s = output.trim();
    return (
      s.startsWith('UklGR') || 
      s.startsWith('SUQz') || 
      s.startsWith('//uQ') || 
      s.startsWith('data:audio/')
    );
  }
  if (typeof output === 'object') {
    return isBase64Audio(output.audio_content || (output.audios && output.audios[0]));
  }
  return false;
};

const getAudioDataUrl = (output: any): string => {
  let str = '';
  if (typeof output === 'string') {
    str = output;
  } else if (typeof output === 'object' && output) {
    str = output.audio_content || (output.audios && output.audios[0]) || '';
  }
  
  if (str.startsWith('data:audio/')) return str;
  const mimeType = str.startsWith('UklGR') ? 'audio/wav' : 'audio/mp3';
  return `data:${mimeType};base64,${str}`;
};

const AudioPlayerResult = ({ base64Data }: { base64Data: string }) => {
  const audioUrl = getAudioDataUrl(base64Data);
  const isWav = base64Data.startsWith('UklGR') || (typeof base64Data === 'object' && base64Data && String((base64Data as any)?.audio_content || (base64Data as any)?.audios?.[0] || '').startsWith('UklGR'));
  const filename = `synthesized_speech.${isWav ? 'wav' : 'mp3'}`;

  useEffect(() => {
    try {
      const link = document.createElement('a');
      link.href = audioUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Auto-download failed', e);
    }
  }, [audioUrl, filename]);

  return (
    <div className="flex flex-col gap-2 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-emerald-600 animate-pulse" /> Audio Synthesized
        </div>
        <a
          href={audioUrl}
          download={filename}
          className="text-[10px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors bg-brand-50 px-2 py-0.5 rounded border border-brand-100"
        >
          <Download className="w-3 h-3" /> Download {isWav ? 'WAV' : 'MP3'}
        </a>
      </div>
      <audio controls className="w-full h-9 rounded bg-slate-50 border border-slate-200">
        <source src={audioUrl} type={isWav ? 'audio/wav' : 'audio/mpeg'} />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

interface PropertyPanelProps {
    selectedNode: Node<NodeData> | null;
    onUpdateNode: (id: string, data: Partial<NodeData>) => void;
    onDeleteNode: (id: string) => void;
    onClose: () => void;
    isBYOK: boolean;
    secrets: Secret[];
    onSaveSecrets?: (secrets: Secret[]) => void;
    flowId?: string | null; // Current flow ID, needed to build correct webhook URLs
}

// Recursively find all leaf nodes in an arbitrary JSON object to create mapping paths
const extractLeafPaths = (obj: any, prefix = ''): string[] => {
    let paths: string[] = [];
    if (obj === null || typeof obj !== 'object') {
        return [prefix]; // It's a leaf
    }

    // Handle Arrays
    if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
            const newPrefix = prefix ? `${prefix}.${index}` : `${index}`;
            if (typeof item === 'object' && item !== null) {
                paths = paths.concat(extractLeafPaths(item, newPrefix));
            } else {
                paths.push(newPrefix);
            }
        });
        return paths;
    }

    // Handle Objects
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = obj[key];
            const newPrefix = prefix ? `${prefix}.${key}` : key;
            if (typeof val === 'object' && val !== null) {
                paths = paths.concat(extractLeafPaths(val, newPrefix));
            } else {
                paths.push(newPrefix);
            }
        }
    }
    return paths;
};

const PropertyPanel: React.FC<PropertyPanelProps> = ({ selectedNode, onUpdateNode, onDeleteNode, onClose, isBYOK, secrets, onSaveSecrets, flowId }) => {
    const [label, setLabel] = useState('');
    const [content, setContent] = useState('');
    const [variableName, setVariableName] = useState('');

    // AI Params
    const [provider, setProvider] = useState<LLMProvider>('openai');
    const [model, setModel] = useState('gpt-5.1');
    const [temperature, setTemperature] = useState(0.7);
    const [maxTokens, setMaxTokens] = useState(1024);
    const [systemInstruction, setSystemInstruction] = useState('');

    // API Props
    const [url, setUrl] = useState('');
    const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET');
    const [headers, setHeaders] = useState('{}');
    const [body, setBody] = useState('{}');
    const [apiAuthProvider, setApiAuthProvider] = useState<'none' | 'google' | 'slack' | 'hubspot' | 'stripe' | 'microsoft'>('none');
    const [apiAuthHeader, setApiAuthHeader] = useState('Authorization');

    // Condition Props
    const [condition, setCondition] = useState('');

    // Schedule
    const [cronExpression, setCronExpression] = useState('');

    // Form Trigger
    const [formFields, setFormFields] = useState<FormField[]>([]);
    const [formTitle, setFormTitle] = useState('Public Form');
    const [formDescription, setFormDescription] = useState('Please fill out the details below.');

    // Batch
    const [batchInputVariable, setBatchInputVariable] = useState('');
    const [batchPrompt, setBatchPrompt] = useState('');

    // Integration Specific
    const [slackChannel, setSlackChannel] = useState('');
    const [slackBody, setSlackBody] = useState('');
    const [slackMappings, setSlackMappings] = useState<Record<string, string>>({});

    const [emailTo, setEmailTo] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailProvider, setEmailProvider] = useState<'smtp' | 'microsoft'>('smtp');

    // Sheets
    const [sheetId, setSheetId] = useState('');
    const [sheetProvider, setSheetProvider] = useState<'google' | 'microsoft'>('google');
    const [sheetOperation, setSheetOperation] = useState<'append' | 'read'>('append');
    const [sheetRange, setSheetRange] = useState('');
    const [sheetOutputVar, setSheetOutputVar] = useState('sheetData');
    const [microsoftDriveId, setMicrosoftDriveId] = useState('');
    const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
    const [isFetchingHeaders, setIsFetchingHeaders] = useState(false);

    // Slack
    const [slackChannels, setSlackChannels] = useState<{ id: string, name: string }[]>([]);
    const [isSlackConnected, setIsSlackConnected] = useState(false);
    const [isLoadingChannels, setIsLoadingChannels] = useState(false);
    const [headerError, setHeaderError] = useState('');

    // Approval
    const [approvalMessage, setApprovalMessage] = useState('');
    const [webhookUrl, setWebhookUrl] = useState('');
    const [webhookSecret, setWebhookSecret] = useState('');
    const [imageUrl, setImageUrl] = useState('');

    // Utils
    const [waitTimeMs, setWaitTimeMs] = useState(1000);
    const [jsonOperation, setJsonOperation] = useState<'parse' | 'stringify' | 'pick'>('parse');
    const [jsonKey, setJsonKey] = useState('');
    const [mathExpression, setMathExpression] = useState('');
    const [textOperation, setTextOperation] = useState<'uppercase' | 'lowercase' | 'trim' | 'split' | 'join' | 'replace'>('trim');
    const [textSeparator, setTextSeparator] = useState(',');

    // RSS
    const [rssItemLimit, setRssItemLimit] = useState(10);

    // Javascript Sandbox settings
    const [executionTimeout, setExecutionTimeout] = useState(5000);
    const [maxAttempts, setMaxAttempts] = useState(3);

    // MCP (Model Context Protocol)
    const [mcpAuthType, setMcpAuthType] = useState<'none' | 'api_key' | 'bearer' | 'custom'>('none');
    const [mcpAuthHeader, setMcpAuthHeader] = useState('X-API-Key');
    const [mcpAuthSecret, setMcpAuthSecret] = useState('');
    const [mcpTools, setMcpTools] = useState<Array<{ name: string; title?: string; description?: string; inputSchema?: any }>>([]);
    const [mcpSelectedTool, setMcpSelectedTool] = useState<string>('');
    const [mcpInputValues, setMcpInputValues] = useState<Record<string, any>>({});
    const [mcpConnectionStatus, setMcpConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [mcpError, setMcpError] = useState('');

    // MCP stdio & import states
    const [mcpTransportType, setMcpTransportType] = useState<'sse' | 'stdio'>('sse');
    const [mcpCommand, setMcpCommand] = useState('');
    const [mcpArgs, setMcpArgs] = useState<string[]>([]);
    const [mcpEnv, setMcpEnv] = useState<Record<string, string>>({});
    const [mcpOriginalConfig, setMcpOriginalConfig] = useState('');

    // MCP Import config states
    const [mcpImportConfigRaw, setMcpImportConfigRaw] = useState('');
    const [mcpImportError, setMcpImportError] = useState('');
    const [mcpImportParsedServers, setMcpImportParsedServers] = useState<ParsedMcpServer[]>([]);
    const [mcpSelectedImportIndex, setMcpSelectedImportIndex] = useState<number>(0);
    const [mcpImportCredentials, setMcpImportCredentials] = useState<Record<string, string>>({});
    const [mcpShowImportForm, setMcpShowImportForm] = useState(false);

    // Agent MCP servers (add-server form state)
    const [agentMcpLabel, setAgentMcpLabel] = useState('');
    const [agentMcpUrl, setAgentMcpUrl] = useState('');
    const [agentMcpAuthType, setAgentMcpAuthType] = useState<'none' | 'api_key' | 'bearer'>('none');
    const [agentMcpAuthHeader, setAgentMcpAuthHeader] = useState('X-API-Key');
    const [agentMcpAuthSecret, setAgentMcpAuthSecret] = useState('');
    const [agentMcpStatus, setAgentMcpStatus] = useState<'idle' | 'discovering' | 'error'>('idle');
    const [agentMcpError, setAgentMcpError] = useState('');

    // Zapier Webhook States
    const [zapierWebhookUrl, setZapierWebhookUrl] = useState('');
    const [zapierOperation, setZapierOperation] = useState('Trigger Zap (POST)');
    const [zapierData, setZapierData] = useState('{\n  "email": "{{email}}"\n}');
    const [zapierTimeout, setZapierTimeout] = useState(30);
    const [zapierFlattenData, setZapierFlattenData] = useState(false);
    const [zapierPayloadType, setZapierPayloadType] = useState('application/json');
    const [zapierQueryParams, setZapierQueryParams] = useState('{}');
    const [zapierCustomHeaders, setZapierCustomHeaders] = useState('{}');
    const [zapierRetryOnFailure, setZapierRetryOnFailure] = useState(true);
    const [zapierBatchProcessing, setZapierBatchProcessing] = useState(false);
    const [zapierWaitForResponse, setZapierWaitForResponse] = useState(false);

    // Telegram Webhook Status State
    const [telegramWebhookInfo, setTelegramWebhookInfo] = useState<any>(null);
    const [isVerifyingTelegram, setIsVerifyingTelegram] = useState(false);
    const [telegramVerifyError, setTelegramVerifyError] = useState('');

    // Discord Trigger State
    const [isDiscordWorking, setIsDiscordWorking] = useState(false);
    const [discordStatus, setDiscordStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

    // Stripe States
    const [stripeApiKey, setStripeApiKey] = useState('');
    const [stripeOperation, setStripeOperation] = useState('Create Charge');
    const [stripeCustomerId, setStripeCustomerId] = useState('');
    const [stripeAmount, setStripeAmount] = useState(0);
    const [stripeCurrency, setStripeCurrency] = useState('usd');
    const [stripePaymentMethodId, setStripePaymentMethodId] = useState('');
    const [stripeSubscriptionId, setStripeSubscriptionId] = useState('');
    const [stripePriceId, setStripePriceId] = useState('');
    const [stripeMetadata, setStripeMetadata] = useState('{}');
    const [stripeDescription, setStripeDescription] = useState('');
    const [stripeEmail, setStripeEmail] = useState('');
    const [stripeLimit, setStripeLimit] = useState(100);

    // Discover tools on an MCP server and attach it to the Agent node
    const handleImportParse = () => {
        try {
            setMcpImportError('');
            const servers = parseMcpConfig(mcpImportConfigRaw);
            if (servers.length === 0) {
                throw new Error('No servers found in configuration.');
            }
            setMcpImportParsedServers(servers);
            setMcpSelectedImportIndex(0);
            
            const initialCreds: Record<string, string> = {};
            const firstSrv = servers[0];
            
            if (firstSrv.transportType === 'stdio' && firstSrv.env) {
                for (const [k, v] of Object.entries(firstSrv.env)) {
                    if (!isPlaceholderValue(v)) {
                        initialCreds[k] = v;
                    }
                }
            } else if (firstSrv.transportType === 'sse' && firstSrv.authType !== 'none') {
                const keyName = firstSrv.authSecret || (firstSrv.url?.includes('sarvam.ai') ? 'SARVAM_API_KEY' : `${firstSrv.name.toUpperCase()}_API_KEY`);
                const isSecretReference = secrets.some(s => s.key === keyName);
                if (!isSecretReference && firstSrv.authSecret && !isPlaceholderValue(firstSrv.authSecret)) {
                    initialCreds[keyName] = firstSrv.authSecret;
                }
            }
            setMcpImportCredentials(initialCreds);
        } catch (err: any) {
            setMcpImportError(err.message || 'Failed to parse configuration');
        }
    };

    const handleImportExecute = async () => {
        const srv = mcpImportParsedServers[mcpSelectedImportIndex];
        if (!srv) return;

        setMcpConnectionStatus('connecting');
        setMcpError('');

        try {
            const updatedSecrets = [...secrets];
            
            const finalEnv: Record<string, string> = {};
            if (srv.transportType === 'stdio' && srv.env) {
                for (const key of Object.keys(srv.env)) {
                    const inputValue = mcpImportCredentials[key];
                    const hasExisting = secrets.some(s => s.key === key);
                    
                    if (inputValue) {
                        const existingIdx = updatedSecrets.findIndex(s => s.key === key);
                        if (existingIdx >= 0) {
                            updatedSecrets[existingIdx] = { key, value: inputValue };
                        } else {
                            updatedSecrets.push({ key, value: inputValue });
                        }
                        finalEnv[key] = key;
                    } else if (hasExisting) {
                        finalEnv[key] = key;
                    } else {
                        finalEnv[key] = srv.env[key] || '';
                    }
                }
            }

            let finalAuthSecret = srv.authSecret;
            let finalAuthType = srv.authType || 'none';
            let finalAuthHeader = srv.authHeader || 'X-API-Key';
            
            if (srv.transportType === 'sse' && srv.authType !== 'none') {
                const keyName = srv.authSecret || (srv.url?.includes('sarvam.ai') ? 'SARVAM_API_KEY' : `${srv.name.toUpperCase()}_API_KEY`);
                const inputValue = mcpImportCredentials[keyName];
                const hasExisting = secrets.some(s => s.key === keyName);
                
                if (inputValue) {
                    const existingIdx = updatedSecrets.findIndex(s => s.key === keyName);
                    if (existingIdx >= 0) {
                        updatedSecrets[existingIdx] = { key: keyName, value: inputValue };
                    } else {
                        updatedSecrets.push({ key: keyName, value: inputValue });
                    }
                    finalAuthSecret = keyName;
                } else if (hasExisting) {
                    finalAuthSecret = keyName;
                }
            }

            if (onSaveSecrets && (updatedSecrets.length !== secrets.length || Object.keys(mcpImportCredentials).length > 0)) {
                onSaveSecrets(updatedSecrets);
            }

            const mcpHeaders = await getAuthHeaders({ 'Content-Type': 'application/json' });
            if (flowId) {
                mcpHeaders['x-flow-id'] = flowId;
            }

            const body: any = {
                transportType: srv.transportType,
                method: 'tools/list',
                params: {}
            };

            if (srv.transportType === 'stdio') {
                body.command = srv.command;
                body.args = srv.args;
                
                const resolvedEnv: Record<string, string> = {};
                for (const [key, val] of Object.entries(finalEnv)) {
                    const matchedSecret = updatedSecrets.find(s => s.key === val || s.key === key);
                    resolvedEnv[key] = String(matchedSecret ? matchedSecret.value : val);
                }
                body.env = resolvedEnv;
            } else {
                body.serverUrl = srv.url;
                body.auth = finalAuthType !== 'none' ? {
                    type: finalAuthType,
                    key: finalAuthSecret ? (updatedSecrets.find(s => s.key === finalAuthSecret)?.value || finalAuthSecret) : undefined,
                    headerName: finalAuthType === 'api_key' ? finalAuthHeader : undefined
                } : undefined;
            }

            const res = await fetch('/api/mcp-proxy', {
                method: 'POST',
                headers: mcpHeaders,
                body: JSON.stringify(body)
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                throw new Error(data.error || data.details || 'Failed to connect');
            }

            const tools = data.result?.tools || [];
            if (tools.length === 0) {
                setMcpError('Server returned no tools');
                setMcpConnectionStatus('error');
            } else {
                setMcpTools(tools);
                setMcpConnectionStatus('connected');
                
                setMcpTransportType(srv.transportType);
                if (srv.transportType === 'stdio') {
                    setMcpCommand(srv.command || '');
                    setMcpArgs(srv.args || []);
                    setMcpEnv(finalEnv);
                    setUrl('');
                } else {
                    setUrl(srv.url || '');
                    setMcpAuthType(finalAuthType as any);
                    setMcpAuthHeader(finalAuthHeader);
                    setMcpAuthSecret(finalAuthSecret || '');
                    setMcpCommand('');
                    setMcpArgs([]);
                    setMcpEnv({});
                }
                setMcpOriginalConfig(mcpImportConfigRaw);
                setMcpShowImportForm(false);
            }
        } catch (err: any) {
            console.error('[MCP Import] Execution failed:', err);
            setMcpError(err.message || 'Import & connection failed');
            setMcpConnectionStatus('error');
        }
    };

    useEffect(() => {
        if (mcpImportParsedServers.length > 0) {
            const firstSrv = mcpImportParsedServers[mcpSelectedImportIndex];
            if (firstSrv) {
                const initialCreds: Record<string, string> = {};
                if (firstSrv.transportType === 'stdio' && firstSrv.env) {
                    for (const [k, v] of Object.entries(firstSrv.env)) {
                        if (!isPlaceholderValue(v)) {
                            initialCreds[k] = v;
                        }
                    }
                } else if (firstSrv.transportType === 'sse' && firstSrv.authType !== 'none') {
                    const keyName = firstSrv.authSecret || (firstSrv.url?.includes('sarvam.ai') ? 'SARVAM_API_KEY' : `${firstSrv.name.toUpperCase()}_API_KEY`);
                    const isSecretReference = secrets.some(s => s.key === keyName);
                    if (!isSecretReference && firstSrv.authSecret && !isPlaceholderValue(firstSrv.authSecret)) {
                        initialCreds[keyName] = firstSrv.authSecret;
                    }
                }
                setMcpImportCredentials(initialCreds);
            }
        }
    }, [mcpSelectedImportIndex, mcpImportParsedServers]);
    const discoverAndAddAgentMcpServer = async () => {
        if (!selectedNode) return;
        const url = agentMcpUrl.trim();
        if (!url) {
            setAgentMcpError('Server URL is required');
            setAgentMcpStatus('error');
            return;
        }
        setAgentMcpStatus('discovering');
        setAgentMcpError('');

        const auth = agentMcpAuthType !== 'none' ? {
            type: agentMcpAuthType,
            key: agentMcpAuthSecret ? (secrets.find(s => s.key === agentMcpAuthSecret)?.value || agentMcpAuthSecret) : undefined,
            headerName: agentMcpAuthType === 'api_key' ? agentMcpAuthHeader : undefined
        } : undefined;

        try {
            const mcpHeaders = await getAuthHeaders({ 'Content-Type': 'application/json' });
            if (flowId) {
                mcpHeaders['x-flow-id'] = flowId;
            }
            const res = await fetch('/api/mcp-proxy', {
                method: 'POST',
                headers: mcpHeaders,
                body: JSON.stringify({ serverUrl: url, method: 'tools/list', params: {}, auth })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || data.details || 'Failed to connect');
            }
            const tools = data.result?.tools || [];
            if (tools.length === 0) {
                throw new Error('Server returned no tools');
            }

            let label = agentMcpLabel.trim();
            if (!label) {
                try {
                    label = new URL(url).hostname.split('.')[0];
                } catch {
                    label = 'server';
                }
            }

            const newServer: McpServerConfig = {
                id: `mcpsrv_${Date.now()}`,
                label,
                transportType: 'sse',
                url,
                authType: agentMcpAuthType,
                authHeader: agentMcpAuthType === 'api_key' ? agentMcpAuthHeader : undefined,
                authSecret: agentMcpAuthType !== 'none' ? agentMcpAuthSecret : undefined,
                tools: tools.map((t: any) => ({
                    name: t.name,
                    title: t.title,
                    description: t.description,
                    inputSchema: t.inputSchema
                }))
            };

            onUpdateNode(selectedNode.id, {
                agentMcpServers: [...(selectedNode.data.agentMcpServers || []), newServer]
            });

            // Reset form
            setAgentMcpLabel('');
            setAgentMcpUrl('');
            setAgentMcpAuthType('none');
            setAgentMcpAuthHeader('X-API-Key');
            setAgentMcpAuthSecret('');
            setAgentMcpStatus('idle');
        } catch (err: any) {
            console.error('[Agent MCP] Discovery failed:', err);
            setAgentMcpError(err.message || 'Connection failed');
            setAgentMcpStatus('error');
        }
    };

    // Execution Result Collapsible State
    const [isExecutionResultExpanded, setIsExecutionResultExpanded] = useState(false);

    // Custom Node Config (for admin-created nodes)
    const [customNodeDef, setCustomNodeDef] = useState<AdminNode | null>(null);
    const [customConfig, setCustomConfig] = useState<Record<string, any>>({});

    useEffect(() => {
        if (selectedNode) {
            const effectiveType = getEffectiveNodeType(selectedNode);
            setLabel(selectedNode.data.label);
            setContent(selectedNode.data.content || '');
            setVariableName(selectedNode.data.variableName || '');

            // Slack - Check connection and fetch channels
            if (selectedNode.data.type === NodeType.SLACK) {
                setSlackChannel(selectedNode.data.slackChannel || '');
                setSlackBody(selectedNode.data.slackBody || '');
                setSlackMappings(selectedNode.data.slackMappings || {});

                getSlackAccessToken().then(token => {
                    if (token) {
                        setIsSlackConnected(true);
                        setIsLoadingChannels(true);
                        // Fetch channels via proxy
                        fetch('/api/slack-api', {
                            method: 'POST',
                            body: JSON.stringify({
                                endpoint: 'conversations.list',
                                token,
                                body: { types: 'public_channel,private_channel', limit: 100 }
                            })
                        })
                            .then(res => res.json())
                            .then(data => {
                                if (data.ok && data.channels) {
                                    setSlackChannels(data.channels.map((c: any) => ({ id: c.id, name: c.name })));
                                }
                            })
                            .catch(err => console.error("Failed to fetch Slack channels", err))
                            .finally(() => setIsLoadingChannels(false));
                    } else {
                        setIsSlackConnected(false);
                    }
                });
            } else {
                // Reset Slack state for other nodes
                setSlackChannels([]);
                setIsSlackConnected(false);
            }

            // AI
            setProvider((selectedNode.data.provider as LLMProvider) || (effectiveType === NodeType.LLM ? 'gemini' : 'openai'));
            setModel(selectedNode.data.model || (effectiveType === NodeType.LLM ? 'gemini-3.1-flash-lite-preview' : 'gemini-3.1-flash-lite-preview'));
            setSystemInstruction(selectedNode.data.systemInstruction || '');
            setTemperature(selectedNode.data.temperature !== undefined ? selectedNode.data.temperature : 0.7);
            setMaxTokens(selectedNode.data.maxTokens || (effectiveType === NodeType.LLM ? 250 : 2048));

            setUrl(selectedNode.data.url || '');
            setMethod(selectedNode.data.method || 'GET');
            setHeaders(selectedNode.data.headers || '{\n "Content-Type": "application/json"\n}');
            setBody(selectedNode.data.body || '{}');
            setApiAuthProvider(selectedNode.data.apiAuthProvider || 'none');
            setApiAuthHeader(selectedNode.data.apiAuthHeader || 'Authorization');
            setCondition(selectedNode.data.condition || '');
            setCronExpression(selectedNode.data.cronExpression || '0 9 * * *');

            setFormFields(selectedNode.data.formFields || []);
            setFormTitle(selectedNode.data.formTitle || 'Public Form');
            setFormDescription(selectedNode.data.formDescription || '');

            setBatchInputVariable(selectedNode.data.batchInputVariable || '');
            setBatchPrompt(selectedNode.data.batchPrompt || '');
            setSlackChannel(selectedNode.data.slackChannel || '');
            setSlackBody(selectedNode.data.slackBody || '');
            setSlackMappings(selectedNode.data.slackMappings || {});
            setEmailTo(selectedNode.data.emailTo || '');
            setEmailSubject(selectedNode.data.emailSubject || '');
            setEmailProvider(selectedNode.data.emailProvider || 'smtp');
            setSheetId(selectedNode.data.sheetId || '');
            setSheetProvider(selectedNode.data.sheetProvider || 'google');
            setSheetOperation(selectedNode.data.sheetOperation || 'append');
            setSheetRange(selectedNode.data.sheetRange || '');
            setSheetOutputVar(selectedNode.data.sheetOutputVar || 'sheetData');
            setMicrosoftDriveId(selectedNode.data.microsoftDriveId || '');
            // If we have saved headers, use them. If not, maybe we can fetch them or just show empty.
            // But we don't have a local state for headers yet? We need one.
            // Oh wait I missed adding the state hook in previous step. I will add it now implicitly? No I need to see the file to add state hooks.


            setApprovalMessage(selectedNode.data.approvalMessage || '');
            setWebhookUrl(selectedNode.data.webhookUrl || '');
            setWebhookSecret(selectedNode.data.webhookSecret || '');
            setImageUrl(selectedNode.data.imageUrl || '');

            setWaitTimeMs(selectedNode.data.waitTimeMs || 1000);
            setJsonOperation(selectedNode.data.jsonOperation || 'parse');
            setJsonKey(selectedNode.data.jsonKey || '');
            setMathExpression(selectedNode.data.mathExpression || '');
            setTextOperation(selectedNode.data.textOperation || 'trim');
            setTextSeparator(selectedNode.data.textSeparator || ',');

            // RSS
            setRssItemLimit(selectedNode.data.rssItemLimit || 10);

            // Javascript Sandbox settings
            setExecutionTimeout(selectedNode.data.executionTimeout || 5000);
            setMaxAttempts(selectedNode.data.maxAttempts || 3);

            // Agent: reset MCP add-server form when switching nodes
            if (selectedNode.data.type === NodeType.AGENT) {
                setAgentMcpLabel('');
                setAgentMcpUrl('');
                setAgentMcpAuthType('none');
                setAgentMcpAuthHeader('X-API-Key');
                setAgentMcpAuthSecret('');
                setAgentMcpStatus('idle');
                setAgentMcpError('');
            }

            // MCP
            if (selectedNode.data.type === NodeType.MCP) {
                setMcpAuthType(selectedNode.data.mcpAuthType || 'none');
                setMcpAuthHeader(selectedNode.data.mcpAuthHeader || 'X-API-Key');
                setMcpAuthSecret(selectedNode.data.mcpAuthSecret || '');
                setMcpTools(selectedNode.data.mcpToolsCache || []);
                setMcpSelectedTool(selectedNode.data.mcpSelectedTool || '');
                setMcpInputValues(selectedNode.data.mcpInputValues || {});
                setMcpConnectionStatus(selectedNode.data.mcpToolsCache?.length ? 'connected' : 'idle');
                setMcpError('');

                setMcpTransportType(selectedNode.data.mcpTransportType || 'sse');
                setMcpCommand(selectedNode.data.mcpCommand || '');
                setMcpArgs(selectedNode.data.mcpArgs || []);
                setMcpEnv(selectedNode.data.mcpEnv || {});
                setMcpOriginalConfig(selectedNode.data.mcpOriginalConfig || '');

                // Reset import state
                setMcpImportConfigRaw('');
                setMcpImportError('');
                setMcpImportParsedServers([]);
                setMcpSelectedImportIndex(0);
                setMcpImportCredentials({});
                setMcpShowImportForm(false);
            }

            // Zapier Webhook
            if (selectedNode.data.type === NodeType.ZAPIER_WEBHOOK) {
                setZapierWebhookUrl(selectedNode.data.webhookUrl || '');
                setZapierOperation(selectedNode.data.operation || 'Trigger Zap (POST)');
                setZapierData(selectedNode.data.data || '{\n  "email": "{{email}}"\n}');
                setZapierTimeout(selectedNode.data.timeout !== undefined ? selectedNode.data.timeout : 30);
                setZapierFlattenData(selectedNode.data.flattenData || false);
                setZapierPayloadType(selectedNode.data.payloadType || 'application/json');
                setZapierQueryParams(selectedNode.data.queryParams || '{}');
                setZapierCustomHeaders(selectedNode.data.customHeaders || '{}');
                setZapierRetryOnFailure(selectedNode.data.retryOnFailure !== undefined ? selectedNode.data.retryOnFailure : true);
                setZapierBatchProcessing(selectedNode.data.batchProcessing || false);
                setZapierWaitForResponse(selectedNode.data.waitForResponse || false);
            }

            // Stripe
            if (selectedNode.data.type === NodeType.STRIPE) {
                setStripeApiKey(selectedNode.data.apiKey || '');
                setStripeOperation(selectedNode.data.operation || 'Create Charge');
                setStripeCustomerId(selectedNode.data.customerId || '');
                setStripeAmount(selectedNode.data.amount || 0);
                setStripeCurrency(selectedNode.data.currency || 'usd');
                setStripePaymentMethodId(selectedNode.data.paymentMethodId || '');
                setStripeSubscriptionId(selectedNode.data.subscriptionId || '');
                setStripePriceId(selectedNode.data.priceId || '');
                setStripeMetadata(selectedNode.data.metadata || '{}');
                setStripeDescription(selectedNode.data.description || '');
                setStripeEmail(selectedNode.data.email || '');
                setStripeLimit(selectedNode.data.limit || 100);
            }

            // Custom node config
            setCustomConfig(selectedNode.data.customConfig || {});
            setCustomNodeDef(adminNodeFromSnapshot(effectiveType, selectedNode.data) || null);
        }
    }, [selectedNode]);

    // Fetch custom node definition if this is a custom node type
    useEffect(() => {
        const fetchCustomNodeDef = async () => {
            if (!selectedNode) return;
            const nodeType = getEffectiveNodeType(selectedNode);
            if (isBuiltInNodeType(nodeType)) {
                setCustomNodeDef(null);
                return;
            }
            try {
                const snapshotDef = adminNodeFromSnapshot(nodeType, selectedNode.data);
                if (snapshotDef) {
                    setCustomNodeDef(snapshotDef);
                }

                const nodes = await admin.getNodes(false);
                const nodeDef = nodes.find((n: AdminNode) => n.node_type === nodeType);
                if (nodeDef) {
                    setCustomNodeDef(nodeDef);
                    if (Object.keys(selectedNode.data.customConfig || {}).length === 0 && nodeDef.default_config) {
                        setCustomConfig(nodeDef.default_config);
                    }
                }
            } catch (e) {
                console.error('Failed to fetch custom node definition:', e);
            }
        };
        fetchCustomNodeDef();
    }, [selectedNode]);

    // Derived state for Slack Schema fields
    const slackSchemaFields = useMemo(() => {
        if (!slackBody) return [];
        try {
            const obj = JSON.parse(slackBody);
            return extractLeafPaths(obj);
        } catch (e) {
            return [];
        }
    }, [slackBody]);

    const handleSlackMappingChange = (path: string, value: string) => {
        setSlackMappings(prev => ({ ...prev, [path]: value }));
    };

    const handleAddField = () => {
        setFormFields(prev => [...prev, {
            id: crypto.randomUUID(),
            label: 'New Field',
            type: 'text',
            variableName: 'field_' + prev.length,
            required: true
        }]);
    };

    const updateField = (id: string, updates: Partial<FormField>) => {
        setFormFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    };

    const removeField = (id: string) => {
        setFormFields(prev => prev.filter(f => f.id !== id));
    };

    const fetchHeaders = async () => {
        if (!sheetId || sheetProvider !== 'google') return;
        setIsFetchingHeaders(true);
        setHeaderError('');
        try {
            const token = secrets?.find(s => s.key === 'GOOGLE_ACCESS_TOKEN')?.value;
            // Use range 'A1:Z1' to fetch first row. If no token, it might fail for private sheets.
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z1`;
            const headers = token ? { Authorization: `Bearer ${token}` } : {};

            const res = await fetch(url, { headers });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || res.statusText);
            }

            const data = await res.json();
            const row1 = data.values?.[0] || [];
            if (row1.length === 0) throw new Error("No headers found in first row");

            setSheetHeaders(row1);
        } catch (e: any) {
            console.error(e);
            setHeaderError(e.message || "Failed to fetch headers. Ensure GOOGLE_ACCESS_TOKEN secret is set or sheet is public.");
        } finally {
            setIsFetchingHeaders(false);
        }
    };

    const handleSave = () => {
        if (!selectedNode) return;
        onUpdateNode(selectedNode.id, {
            label,
            content,
            variableName,
            provider: selectedNode.data.type === NodeType.LLM ? provider : undefined,
            model: (selectedNode.data.type === NodeType.LLM || selectedNode.data.type === NodeType.GEMINI) ? model : undefined,
            temperature,
            maxTokens,
            systemInstruction,
            url,
            method,
            headers,
            body,
            apiAuthProvider,
            apiAuthHeader,
            condition,
            cronExpression,
            formFields,
            formTitle,
            formDescription,
            batchInputVariable,
            batchPrompt,
            slackChannel,
            slackBody,
            slackMappings,
            emailTo,
            emailSubject,
            emailProvider,
            sheetId,
            sheetProvider,
            sheetOperation,
            sheetRange,
            sheetOutputVar,
            microsoftDriveId,

            approvalMessage,
            waitTimeMs,
            jsonOperation,
            jsonKey,
            mathExpression,
            textOperation,
            textSeparator,
            rssItemLimit,
            customConfig,
            executionTimeout,
            maxAttempts,

            // Zapier Webhook fields
            webhookUrl: selectedNode.data.type === NodeType.ZAPIER_WEBHOOK ? zapierWebhookUrl : webhookUrl,
            operation: (selectedNode.data.type === NodeType.STRIPE || selectedNode.data.type === NodeType.ZAPIER_WEBHOOK) ? (selectedNode.data.type === NodeType.STRIPE ? stripeOperation : zapierOperation) : undefined,
            data: selectedNode.data.type === NodeType.ZAPIER_WEBHOOK ? zapierData : undefined,
            timeout: (selectedNode.data.type === NodeType.STRIPE || selectedNode.data.type === NodeType.ZAPIER_WEBHOOK) ? (selectedNode.data.type === NodeType.STRIPE ? stripeLimit : zapierTimeout) : undefined,
            flattenData: selectedNode.data.type === NodeType.ZAPIER_WEBHOOK ? zapierFlattenData : undefined,
            payloadType: selectedNode.data.type === NodeType.ZAPIER_WEBHOOK ? zapierPayloadType : undefined,
            queryParams: selectedNode.data.type === NodeType.ZAPIER_WEBHOOK ? zapierQueryParams : undefined,
            customHeaders: selectedNode.data.type === NodeType.ZAPIER_WEBHOOK ? zapierCustomHeaders : undefined,
            retryOnFailure: selectedNode.data.type === NodeType.ZAPIER_WEBHOOK ? zapierRetryOnFailure : undefined,
            batchProcessing: selectedNode.data.type === NodeType.ZAPIER_WEBHOOK ? zapierBatchProcessing : undefined,
            waitForResponse: selectedNode.data.type === NodeType.ZAPIER_WEBHOOK ? zapierWaitForResponse : undefined,

            // Stripe fields
            apiKey: selectedNode.data.type === NodeType.STRIPE ? stripeApiKey : undefined,
            customerId: selectedNode.data.type === NodeType.STRIPE ? stripeCustomerId : undefined,
            amount: selectedNode.data.type === NodeType.STRIPE ? stripeAmount : undefined,
            currency: selectedNode.data.type === NodeType.STRIPE ? stripeCurrency : undefined,
            paymentMethodId: selectedNode.data.type === NodeType.STRIPE ? stripePaymentMethodId : undefined,
            subscriptionId: selectedNode.data.type === NodeType.STRIPE ? stripeSubscriptionId : undefined,
            priceId: selectedNode.data.type === NodeType.STRIPE ? stripePriceId : undefined,
            metadata: selectedNode.data.type === NodeType.STRIPE ? stripeMetadata : undefined,
            description: selectedNode.data.type === NodeType.STRIPE ? stripeDescription : undefined,
            email: selectedNode.data.type === NodeType.STRIPE ? stripeEmail : undefined,
            limit: selectedNode.data.type === NodeType.STRIPE ? stripeLimit : undefined,

            // MCP fields
            mcpTransportType,
            mcpCommand,
            mcpArgs,
            mcpEnv,
            mcpOriginalConfig,
            mcpAuthType,
            mcpAuthHeader,
            mcpAuthSecret,
            mcpSelectedTool,
            mcpToolSchema: mcpTools.find(t => t.name === mcpSelectedTool),
            mcpToolsCache: mcpTools,
            mcpInputValues,
            webhookSecret,
            imageUrl
        });
        onClose();
    };

    if (!selectedNode) return null;

    return (
        <div className="w-96 bg-white border-l border-slate-200 flex flex-col h-full absolute right-0 top-0 z-20 shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">Configuration</h2>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedNode.data.type.toUpperCase()} • {selectedNode.id}</p>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar bg-white">

                {/* ONLY Show API Key Warning if BYOK is ENABLED */}
                {isBYOK && (selectedNode.data.type === NodeType.LLM || selectedNode.data.type === NodeType.GEMINI) && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-800">
                            <strong>BYOK Enabled:</strong> Ensure you have added your API Key in the <strong>Secrets</strong> menu.
                        </div>
                    </div>
                )}

                {/* Name & Variable */}
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Node Label</label>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                        />
                    </div>

                    {(selectedNode.data.type !== NodeType.NOTE && selectedNode.data.type !== NodeType.FORM_TRIGGER) && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Output Variable</label>
                                <span title="The output will be stored in this variable name as entered by you.">
                                    <HelpCircle className="w-3 h-3 text-slate-400 cursor-help" />
                                </span>
                            </div>
                            <input
                                type="text"
                                value={variableName}
                                onChange={(e) => setVariableName(e.target.value)}
                                placeholder="e.g. result"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-emerald-600 font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                            />
                            {/* Dynamic output structure hints based on node type */}
                            {selectedNode.data.type === NodeType.AGENT && (
                                <p className="text-[9px] text-slate-500">
                                    Access: <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.answer}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.success}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.iterations}}`}</code>
                                </p>
                            )}
                            {selectedNode.data.type === NodeType.DEEP_RESEARCH && (
                                <p className="text-[9px] text-slate-500">
                                    Access: <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.summary}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.sources}}`}</code>
                                </p>
                            )}
                            {selectedNode.data.type === NodeType.EXTRACT_URL && (
                                <p className="text-[9px] text-slate-500">
                                    Access: <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.content}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.title}}`}</code>
                                </p>
                            )}
                            {selectedNode.data.type === NodeType.CRAWL_SITE && (
                                <p className="text-[9px] text-slate-500">
                                    Access: <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.pages}}`}</code>, <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.pagesFound}}`}</code>
                                </p>
                            )}
                            {selectedNode.data.type === NodeType.WEB_SEARCH && (
                                <p className="text-[9px] text-slate-500">
                                    Access: <code className="bg-slate-100 px-1 rounded">{`{{${variableName || 'result'}.results}}`}</code>
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="h-px bg-slate-100" />

                {/* LLM Unified Config */}
                {selectedNode.data.type === NodeType.LLM && (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Provider</label>
                            <select
                                value={provider}
                                onChange={(e) => {
                                    const newProvider = e.target.value as LLMProvider;
                                    setProvider(newProvider);
                                    // Auto-select cheapest model for each provider
                                    const cheapestModels: Record<LLMProvider, string> = {
                                        'gemini': 'gemini-3.1-flash-lite-preview',
                                        'openai': 'gpt-5-mini',
                                        'anthropic': 'claude-haiku-4-5',
                                        'groq': 'llama-3.3-70b-versatile',
                                        'ollama': 'llama3.2'
                                    };
                                    setModel(cheapestModels[newProvider]);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900"
                            >
                                <option value="openai">OpenAI</option>
                                <option value="anthropic">Anthropic (Claude)</option>
                                <option value="gemini">Google Gemini</option>
                                <option value="groq">Groq (Open Models)</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Model</label>
                            <select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900"
                            >
                                {provider === 'openai' && (
                                    <>
                                        <option value="gpt-5.1">GPT-5.1</option>
                                        <option value="gpt-5-mini">GPT-5 Mini</option>
                                        <option value="gpt-5-nano">GPT-5 Nano</option>
                                        <option value="gpt-4o">GPT-4o</option>
                                    </>
                                )}
                                {provider === 'anthropic' && (
                                    <>
                                        <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                                        <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
                                        <option value="claude-opus-4-5">Claude Opus 4.5</option>
                                    </>
                                )}
                                {provider === 'groq' && (
                                    <>
                                        <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                                        <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                                        <option value="openai/gpt-oss-120b">GPT-OSS 120B</option>
                                        <option value="openai/gpt-oss-20b">GPT-OSS 20B</option>
                                    </>
                                )}
                                {provider === 'gemini' && (
                                    <>
                                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                                        <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                                    </>
                                )}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Temperature</label>
                                <input
                                    type="number" step="0.1" min="0" max="2"
                                    value={temperature}
                                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Max Tokens</label>
                                <input
                                    type="number" step="100"
                                    value={maxTokens}
                                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">System Instruction</label>
                            <textarea
                                value={systemInstruction}
                                onChange={(e) => setSystemInstruction(e.target.value)}
                                rows={3}
                                placeholder="You are a helpful assistant..."
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">User Prompt</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={5}
                                placeholder="Explain {{topic}}..."
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs font-mono"
                            />
                        </div>
                    </div>
                )}

                {/* REASONING CONFIG */}
                {selectedNode.data.type === NodeType.REASONING && (
                    <div className="space-y-4">
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-700 text-[10px]">
                            <strong>Reasoning Node:</strong> Uses chain-of-thought prompting for complex problem solving. Output includes <code>thinking</code> trace and <code>answer</code>.
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Reasoning Goal</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={4}
                                placeholder="Analyze the customer feedback and identify top 3 concerns..."
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs"
                            />
                            <p className="text-[9px] text-slate-500">What should the AI reason about? Variables like {'{{data}}'} are supported.</p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Thinking Style</label>
                            <select
                                value={selectedNode.data.thinkingStyle || 'chain-of-thought'}
                                onChange={(e) => onUpdateNode(selectedNode.id, { thinkingStyle: e.target.value as 'step-by-step' | 'tree-of-thought' | 'chain-of-thought' })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs"
                            >
                                <option value="chain-of-thought">Chain of Thought (step-by-step)</option>
                                <option value="step-by-step">Step by Step (structured)</option>
                                <option value="tree-of-thought">Tree of Thought (explore alternatives)</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Additional Context (Optional)</label>
                            <textarea
                                value={selectedNode.data.reasoningContext || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { reasoningContext: e.target.value })}
                                rows={2}
                                placeholder="Any background information, constraints, or guidelines..."
                                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs"
                            />
                        </div>
                    </div>
                )}

                {/* AGENT (ReAct Loop) CONFIG */}
                {selectedNode.data.type === NodeType.AGENT && (
                    <div className="space-y-4">
                        <div className="p-2.5 bg-gradient-to-r from-violet-600 to-purple-600 border border-violet-500 rounded-lg text-white text-[10px] flex items-center gap-2">
                            <Cpu className="w-4 h-4 flex-shrink-0" />
                            <div>
                                <strong>AI Agent</strong> – Autonomous reasoning with tool use. Iterates until goal achieved.
                            </div>
                        </div>

                        {/* Goal - Uses agentGoal field directly for persistence */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1">
                                <Target className="w-3 h-3" /> Agent Goal
                            </label>
                            <textarea
                                value={selectedNode.data.agentGoal || selectedNode.data.content || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { agentGoal: e.target.value, content: e.target.value })}
                                rows={4}
                                placeholder="What should the agent achieve? Be specific about the desired outcome..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                            />
                            <p className="text-[9px] text-slate-500">
                                Use <code className="bg-slate-100 px-1 rounded">{'{{variable}}'}</code> for dynamic values.
                            </p>
                        </div>

                        {/* Available Tools (Info Only - Agent uses all automatically) */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1">
                                <Wrench className="w-3 h-3" /> Available Tools (15)
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {[
                                    'Web Search', 'Deep Research', 'Extract URL', 'Crawl Site',
                                    'LLM Call', 'Synthesize Report', 'Declare Artifact',
                                    'Email', 'Slack', 'API Call', 'JavaScript', 'Calculate',
                                    'Memory', 'Context', 'Sheets'
                                ].map(tool => (
                                    <span key={tool} className="text-[9px] px-2 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full">
                                        {tool}
                                    </span>
                                ))}
                            </div>
                            <p className="text-[9px] text-slate-500">
                                Agent autonomously decides which tools to use based on the goal.
                            </p>
                        </div>

                        {/* MCP Tool Servers */}
                        <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2">
                                <Server className="w-3.5 h-3.5 text-slate-500" />
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">MCP Tool Servers</label>
                            </div>
                            <p className="text-[9px] text-slate-500">
                                Connect MCP servers to give the agent extra tools. Every discovered tool becomes available to the agent automatically.
                            </p>

                            {/* Connected servers */}
                            {(selectedNode.data.agentMcpServers || []).map((server) => (
                                <div key={server.id} className="p-2 bg-white border border-slate-200 rounded-md space-y-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-semibold text-slate-800">{server.label}</div>
                                            <div className="text-[9px] text-slate-500 font-mono truncate">{server.url}</div>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                                {server.tools.length} tools
                                            </span>
                                            <button
                                                onClick={() => onUpdateNode(selectedNode.id, {
                                                    agentMcpServers: (selectedNode.data.agentMcpServers || []).filter(s => s.id !== server.id)
                                                })}
                                                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                                title="Remove server"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {server.tools.slice(0, 6).map(tool => (
                                            <span key={tool.name} className="text-[8px] px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full font-mono">
                                                {tool.name}
                                            </span>
                                        ))}
                                        {server.tools.length > 6 && (
                                            <span className="text-[8px] px-1.5 py-0.5 text-slate-500">
                                                +{server.tools.length - 6} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Add server form */}
                            <div className="space-y-1.5 pt-1">
                                <div className="flex gap-1.5">
                                    <input
                                        type="text"
                                        value={agentMcpLabel}
                                        onChange={(e) => setAgentMcpLabel(e.target.value)}
                                        placeholder="Name (e.g. github)"
                                        className="w-1/3 bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px]"
                                    />
                                    <input
                                        type="text"
                                        value={agentMcpUrl}
                                        onChange={(e) => setAgentMcpUrl(e.target.value)}
                                        placeholder="https://server.example.com/mcp"
                                        className="flex-1 bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-mono"
                                    />
                                </div>
                                <div className="flex gap-1.5">
                                    <select
                                        value={agentMcpAuthType}
                                        onChange={(e) => setAgentMcpAuthType(e.target.value as any)}
                                        className="bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px]"
                                    >
                                        <option value="none">No auth</option>
                                        <option value="api_key">API Key</option>
                                        <option value="bearer">Bearer</option>
                                    </select>
                                    {agentMcpAuthType === 'api_key' && (
                                        <input
                                            type="text"
                                            value={agentMcpAuthHeader}
                                            onChange={(e) => setAgentMcpAuthHeader(e.target.value)}
                                            placeholder="Header name"
                                            className="w-1/4 bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-mono"
                                        />
                                    )}
                                    {agentMcpAuthType !== 'none' && (
                                        <input
                                            type="text"
                                            value={agentMcpAuthSecret}
                                            onChange={(e) => setAgentMcpAuthSecret(e.target.value)}
                                            placeholder="Secret name or key"
                                            className="flex-1 bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-mono text-emerald-600"
                                        />
                                    )}
                                    <button
                                        onClick={discoverAndAddAgentMcpServer}
                                        disabled={agentMcpStatus === 'discovering'}
                                        className="px-2.5 py-1.5 bg-violet-600 text-white text-[10px] font-bold rounded-md hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1 transition-colors flex-shrink-0"
                                    >
                                        {agentMcpStatus === 'discovering' ? (
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Plus className="w-3 h-3" />
                                        )}
                                        Add
                                    </button>
                                </div>
                                {agentMcpError && (
                                    <p className="text-[10px] text-red-600 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> {agentMcpError}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Guardrails */}
                        <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 mb-2">
                                <Shield className="w-3.5 h-3.5 text-slate-500" />
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Guardrails</label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-600">Max Iterations</label>
                                    <input
                                        type="number"
                                        value={selectedNode.data.agentMaxIterations || 30}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { agentMaxIterations: parseInt(e.target.value) })}
                                        min={1}
                                        max={100}
                                        className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-600">Timeout (sec)</label>
                                    <input
                                        type="number"
                                        value={(selectedNode.data.agentTimeoutMs || 600000) / 1000}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { agentTimeoutMs: parseInt(e.target.value) * 1000 })}
                                        min={30}
                                        max={900}
                                        className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-xs"
                                    />
                                </div>
                            </div>
                            <p className="text-[9px] text-slate-500">
                                Agent stops when goal achieved, or when limits are reached.
                            </p>
                        </div>

                        {/* Model Info (Read Only) */}
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                            <Brain className="w-3.5 h-3.5 text-violet-600" />
                            <div>
                                <div className="text-[10px] font-semibold text-slate-700">Gemini 3.1 Pro Preview</div>
                                <div className="text-[9px] text-slate-500">High-quality reasoning model</div>
                            </div>
                        </div>

                        {/* Credit Cost Hint */}
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-[9px] text-amber-700">
                                <strong>Cost:</strong> 15 base + 6/iteration + tool costs
                            </p>
                        </div>
                    </div>
                )}

                {/* MCP Config */}
                {selectedNode.data.type === NodeType.MCP && (() => {
                    const selectedImportServer = mcpImportParsedServers[mcpSelectedImportIndex];
                    const requiredCreds: Record<string, boolean> = {};
                    if (selectedImportServer) {
                        if (selectedImportServer.transportType === 'stdio' && selectedImportServer.env) {
                            for (const k of Object.keys(selectedImportServer.env)) {
                                requiredCreds[k] = true;
                            }
                        } else if (selectedImportServer.transportType === 'sse' && selectedImportServer.authType !== 'none') {
                            const keyName = selectedImportServer.authSecret || (selectedImportServer.url?.includes('sarvam.ai') ? 'SARVAM_API_KEY' : `${selectedImportServer.name.toUpperCase()}_API_KEY`);
                            requiredCreds[keyName] = true;
                        }
                    }

                    return (
                        <div className="space-y-4">
                            {/* Info Banner */}
                            <div className="p-2.5 bg-gradient-to-r from-slate-800 to-slate-700 border border-slate-600 rounded-lg text-white text-[10px] flex items-center gap-2">
                                <Server className="w-4 h-4 flex-shrink-0" />
                                <div>
                                    <strong>Model Context Protocol</strong> – Connect to any MCP server to access external tools.
                                </div>
                            </div>

                            {/* Import Config Collapsible Card */}
                            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/80 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                        Import MCP Config
                                    </span>
                                    <button
                                        onClick={() => {
                                            setMcpShowImportForm(!mcpShowImportForm);
                                            setMcpImportError('');
                                            setMcpImportParsedServers([]);
                                        }}
                                        className="text-[10px] font-semibold text-brand-600 hover:text-brand-700 transition-colors"
                                    >
                                        {mcpShowImportForm ? '✕ Close' : '⚡ Quick Import'}
                                    </button>
                                </div>

                                {mcpShowImportForm ? (
                                    <div className="space-y-3 pt-1">
                                        <p className="text-[10px] text-slate-500 leading-relaxed">
                                            Paste raw configuration (like <code>claude_desktop_config.json</code> or a raw SSE URL) to import automatically.
                                        </p>
                                        <textarea
                                            value={mcpImportConfigRaw}
                                            onChange={(e) => {
                                                setMcpImportConfigRaw(e.target.value);
                                                setMcpImportError('');
                                                setMcpImportParsedServers([]);
                                            }}
                                            placeholder={`{\n  "mcpServers": {\n    "sarvam": {\n      "command": "uvx",\n      "args": ["sarvam-mcp"],\n      "env": {\n        "SARVAM_API_KEY": "YOUR_API_KEY"\n      }\n    }\n  }\n}`}
                                            className="w-full h-28 bg-white border border-slate-200 rounded-md p-2 text-[10px] font-mono text-slate-800 focus:outline-none focus:border-brand-500"
                                        />
                                        {mcpImportError && (
                                            <p className="text-[10px] text-red-600 font-semibold">{mcpImportError}</p>
                                        )}
                                        <button
                                            onClick={handleImportParse}
                                            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px] rounded transition-colors"
                                        >
                                            Parse Configuration
                                        </button>

                                        {/* Parsed Servers & Credential fields */}
                                        {mcpImportParsedServers.length > 0 && (
                                            <div className="space-y-3 border-t border-slate-200 pt-3">
                                                {mcpImportParsedServers.length > 1 && (
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-slate-500 uppercase">
                                                            Select Server
                                                        </label>
                                                        <select
                                                            value={mcpSelectedImportIndex}
                                                            onChange={(e) => setMcpSelectedImportIndex(parseInt(e.target.value))}
                                                            className="w-full bg-white border border-slate-200 rounded-md px-2 py-1 text-[10px]"
                                                        >
                                                            {mcpImportParsedServers.map((srv, idx) => (
                                                                <option key={idx} value={idx}>
                                                                    {srv.name} ({srv.transportType})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}

                                                <div className="bg-slate-100/80 p-2 rounded text-[9px] font-mono text-slate-600 space-y-1">
                                                    <div><strong>Name:</strong> {selectedImportServer.name}</div>
                                                    <div><strong>Transport:</strong> {selectedImportServer.transportType}</div>
                                                    {selectedImportServer.transportType === 'stdio' ? (
                                                        <>
                                                            <div><strong>Command:</strong> {selectedImportServer.command}</div>
                                                            {selectedImportServer.args?.length > 0 && (
                                                                <div><strong>Args:</strong> {selectedImportServer.args.join(' ')}</div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div className="break-all"><strong>URL:</strong> {selectedImportServer.url}</div>
                                                    )}
                                                </div>

                                                {/* Credentials Form */}
                                                {Object.keys(requiredCreds).length > 0 && (
                                                    <div className="space-y-2 bg-brand-50/50 border border-brand-100 rounded-lg p-2.5">
                                                        <div className="text-[9px] font-bold text-brand-800 uppercase tracking-wider flex items-center gap-1">
                                                            <Key className="w-3 h-3" /> Required Credentials
                                                        </div>
                                                        {Object.keys(requiredCreds).map((key) => {
                                                            const friendlyLabel = getFriendlyCredentialLabel(key);
                                                            const hasExisting = secrets.some(s => s.key === key);
                                                            return (
                                                                <div key={key} className="space-y-1">
                                                                    <div className="flex items-center justify-between text-[9px]">
                                                                        <span className="font-semibold text-slate-700">{friendlyLabel}</span>
                                                                        {hasExisting && (
                                                                            <span className="text-[9px] text-emerald-600 font-medium">
                                                                                ✓ Existing found
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <input
                                                                        type="password"
                                                                        value={mcpImportCredentials[key] || ''}
                                                                        onChange={(e) => setMcpImportCredentials({
                                                                            ...mcpImportCredentials,
                                                                            [key]: e.target.value
                                                                        })}
                                                                        placeholder={hasExisting ? '•••••••• (unchanged)' : 'Enter key/token value'}
                                                                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[10px] focus:outline-none focus:border-brand-500"
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                <button
                                                    onClick={handleImportExecute}
                                                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded transition-colors flex items-center justify-center gap-1"
                                                >
                                                    <Play className="w-3 h-3" /> Import & Connect
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-[9px] text-slate-500 flex items-center justify-between">
                                        <span>Current: {mcpTransportType === 'stdio' ? `stdio (${mcpCommand})` : `sse (${url || 'none'})`}</span>
                                        {mcpOriginalConfig && <span className="text-emerald-600 font-medium">✓ Configured via Import</span>}
                                    </div>
                                )}
                            </div>

                            {/* Transport Configuration */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                    Transport Type
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setMcpTransportType('sse')}
                                        className={clsx(
                                            'py-1.5 text-xs font-semibold rounded-md border transition-all flex items-center justify-center gap-1',
                                            mcpTransportType === 'sse'
                                                ? 'bg-brand-50 border-brand-500 text-brand-700 shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        )}
                                    >
                                        <Server className="w-3.5 h-3.5" /> Remote SSE
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMcpTransportType('stdio')}
                                        className={clsx(
                                            'py-1.5 text-xs font-semibold rounded-md border transition-all flex items-center justify-center gap-1',
                                            mcpTransportType === 'stdio'
                                                ? 'bg-brand-50 border-brand-500 text-brand-700 shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        )}
                                    >
                                        <Terminal className="w-3.5 h-3.5" /> Local Stdio
                                    </button>
                                </div>
                            </div>

                            {/* Status and Error Details */}
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                <span>Status</span>
                                <span className={clsx(
                                    'text-[9px] font-medium px-2 py-0.5 rounded-full',
                                    mcpConnectionStatus === 'connected' && 'bg-emerald-100 text-emerald-700',
                                    mcpConnectionStatus === 'connecting' && 'bg-amber-100 text-amber-700',
                                    mcpConnectionStatus === 'error' && 'bg-red-100 text-red-700',
                                    mcpConnectionStatus === 'idle' && 'bg-slate-100 text-slate-500'
                                )}>
                                    {mcpConnectionStatus === 'connected' && `✓ ${mcpTools.length} tools`}
                                    {mcpConnectionStatus === 'connecting' && '⟳ Discovering...'}
                                    {mcpConnectionStatus === 'error' && '✕ Connection Error'}
                                    {mcpConnectionStatus === 'idle' && '○ Not connected'}
                                </span>
                            </div>

                            {/* SSE URL Settings */}
                            {mcpTransportType === 'sse' && (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                            SSE Endpoint URL
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={url}
                                                onChange={(e) => setUrl(e.target.value)}
                                                placeholder="https://mcp-server.example.com/mcp"
                                                className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-brand-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (!url) {
                                                        setMcpError('Please enter a server URL');
                                                        return;
                                                    }
                                                    setMcpConnectionStatus('connecting');
                                                    setMcpError('');
                                                    setMcpTools([]);
                                                    setMcpSelectedTool('');
                                                    setMcpInputValues({});

                                                    const auth = mcpAuthType !== 'none' ? {
                                                        type: mcpAuthType,
                                                        key: mcpAuthSecret ? (secrets.find(s => s.key === mcpAuthSecret)?.value || mcpAuthSecret) : undefined,
                                                        headerName: mcpAuthType === 'api_key' ? mcpAuthHeader : undefined
                                                    } : undefined;

                                                    try {
                                                        const mcpHeaders = await getAuthHeaders({ 'Content-Type': 'application/json' });
                                                        if (flowId) {
                                                            mcpHeaders['x-flow-id'] = flowId;
                                                        }
                                                        const res = await fetch('/api/mcp-proxy', {
                                                            method: 'POST',
                                                            headers: mcpHeaders,
                                                            body: JSON.stringify({
                                                                serverUrl: url,
                                                                transportType: 'sse',
                                                                method: 'tools/list',
                                                                params: {},
                                                                auth
                                                            })
                                                        });

                                                        const data = await res.json();

                                                        if (!res.ok || data.error) {
                                                            throw new Error(data.error || data.details || 'Failed to connect');
                                                        }

                                                        const tools = data.result?.tools || [];
                                                        if (tools.length === 0) {
                                                            setMcpError('Server returned no tools');
                                                            setMcpConnectionStatus('error');
                                                        } else {
                                                            setMcpTools(tools);
                                                            setMcpConnectionStatus('connected');
                                                        }
                                                    } catch (err: any) {
                                                        console.error('[MCP] Discovery failed:', err);
                                                        setMcpError(err.message || 'Connection failed');
                                                        setMcpConnectionStatus('error');
                                                    }
                                                }}
                                                disabled={mcpConnectionStatus === 'connecting'}
                                                className="px-3 py-2 bg-slate-800 text-white text-xs font-bold rounded-md hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                                            >
                                                {mcpConnectionStatus === 'connecting' ? (
                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Search className="w-3.5 h-3.5" />
                                                )}
                                                Discover
                                            </button>
                                        </div>
                                    </div>

                                    {/* Authentication */}
                                    <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Key className="w-3.5 h-3.5 text-slate-500" />
                                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Authentication</label>
                                        </div>
                                        <select
                                            value={mcpAuthType}
                                            onChange={(e) => setMcpAuthType(e.target.value as any)}
                                            className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900"
                                        >
                                            <option value="none">None (Public Server)</option>
                                            <option value="api_key">API Key Header</option>
                                            <option value="bearer">Bearer Token</option>
                                            <option value="custom">Custom Header</option>
                                        </select>

                                        {mcpAuthType !== 'none' && (
                                            <div className="space-y-2 mt-2">
                                                {mcpAuthType === 'api_key' && (
                                                    <input
                                                        type="text"
                                                        value={mcpAuthHeader}
                                                        onChange={(e) => setMcpAuthHeader(e.target.value)}
                                                        placeholder="Header name (e.g. X-API-Key)"
                                                        className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-xs font-mono"
                                                    />
                                                )}
                                                <input
                                                    type="text"
                                                    value={mcpAuthSecret}
                                                    onChange={(e) => setMcpAuthSecret(e.target.value)}
                                                    placeholder="Secret key name (e.g. MCP_API_KEY)"
                                                    className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-xs font-mono text-emerald-600"
                                                />
                                                <p className="text-[9px] text-slate-500">
                                                    Enter the name of a secret from your Secrets panel, or the raw key value.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Stdio Commands Settings */}
                            {mcpTransportType === 'stdio' && (
                                <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                            Command
                                        </label>
                                        <input
                                            type="text"
                                            value={mcpCommand}
                                            onChange={(e) => setMcpCommand(e.target.value)}
                                            placeholder="e.g. npx, uvx, node"
                                            className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-xs font-mono text-slate-955"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                            Arguments (Space separated)
                                        </label>
                                        <input
                                            type="text"
                                            value={mcpArgs.join(' ')}
                                            onChange={(e) => setMcpArgs(e.target.value.split(/\s+/).filter(Boolean))}
                                            placeholder="e.g. -y mcp-server-git --repository /path"
                                            className="w-full bg-white border border-slate-200 rounded-md px-3 py-1.5 text-xs font-mono text-slate-700"
                                        />
                                    </div>

                                    {Object.keys(mcpEnv).length > 0 && (
                                        <div className="space-y-1 pt-1">
                                            <label className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">
                                                Environment Secret Mappings
                                            </label>
                                            <div className="space-y-1 bg-white border border-slate-200 rounded p-2 max-h-24 overflow-y-auto">
                                                {Object.entries(mcpEnv).map(([key, secretKey]) => (
                                                    <div key={key} className="flex justify-between items-center text-[9px]">
                                                        <span className="font-mono text-slate-600 font-medium">{key}</span>
                                                        <span className="font-mono text-emerald-600 font-semibold">{secretKey}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!mcpCommand) {
                                                setMcpError('Please enter a command');
                                                return;
                                            }
                                            setMcpConnectionStatus('connecting');
                                            setMcpError('');
                                            setMcpTools([]);
                                            setMcpSelectedTool('');
                                            setMcpInputValues({});

                                            try {
                                                const mcpHeaders = await getAuthHeaders({ 'Content-Type': 'application/json' });
                                                if (flowId) {
                                                    mcpHeaders['x-flow-id'] = flowId;
                                                }

                                                const resolvedEnv: Record<string, string> = {};
                                                for (const [key, val] of Object.entries(mcpEnv)) {
                                                    const matchedSecret = secrets.find(s => s.key === val || s.key === key);
                                                    resolvedEnv[key] = String(matchedSecret ? matchedSecret.value : val);
                                                }

                                                const res = await fetch('/api/mcp-proxy', {
                                                    method: 'POST',
                                                    headers: mcpHeaders,
                                                    body: JSON.stringify({
                                                        transportType: 'stdio',
                                                        command: mcpCommand,
                                                        args: mcpArgs,
                                                        env: resolvedEnv,
                                                        method: 'tools/list',
                                                        params: {}
                                                    })
                                                });

                                                const data = await res.json();

                                                if (!res.ok || data.error) {
                                                    throw new Error(data.error || data.details || 'Failed to connect');
                                                }

                                                const tools = data.result?.tools || [];
                                                if (tools.length === 0) {
                                                    setMcpError('Server returned no tools');
                                                    setMcpConnectionStatus('error');
                                                } else {
                                                    setMcpTools(tools);
                                                    setMcpConnectionStatus('connected');
                                                }
                                            } catch (err: any) {
                                                console.error('[MCP Stdio] Discovery failed:', err);
                                                setMcpError(err.message || 'Stdio Connection failed');
                                                setMcpConnectionStatus('error');
                                            }
                                        }}
                                        disabled={mcpConnectionStatus === 'connecting'}
                                        className="w-full mt-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors"
                                    >
                                        <RefreshCw className={clsx("w-3 h-3", mcpConnectionStatus === 'connecting' && "animate-spin")} />
                                        Discover Tools
                                    </button>
                                </div>
                            )}

                            {mcpError && (
                                <p className="text-[10px] text-red-600 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> {mcpError}
                                </p>
                            )}

                            {/* Tool Selection */}
                            {mcpTools.length > 0 && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                                        <Zap className="w-3 h-3" /> Select Tool
                                    </label>
                                    <select
                                        value={mcpSelectedTool}
                                        onChange={(e) => {
                                            setMcpSelectedTool(e.target.value);
                                            setMcpInputValues({});
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900"
                                    >
                                        <option value="">-- Select a tool --</option>
                                        {mcpTools.map((tool) => (
                                            <option key={tool.name} value={tool.name}>
                                                {tool.title || tool.name}
                                            </option>
                                        ))}
                                    </select>
                                    {mcpSelectedTool && (
                                        <p className="text-[10px] text-slate-600 italic">
                                            {mcpTools.find(t => t.name === mcpSelectedTool)?.description || 'No description available.'}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Dynamic Input Schema */}
                            {mcpSelectedTool && (() => {
                                const selectedTool = mcpTools.find(t => t.name === mcpSelectedTool);
                                const schema = selectedTool?.inputSchema as any;
                                const properties = schema?.properties || {};
                                const required = schema?.required || [];
                                const propKeys = Object.keys(properties);

                                if (propKeys.length === 0) {
                                    return (
                                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-700 text-[10px]">
                                            <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                                            This tool requires no input arguments.
                                        </div>
                                    );
                                }

                                return (
                                    <div className="space-y-3 p-3 bg-white border border-slate-200 rounded-lg">
                                        <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                            Tool Arguments
                                        </div>
                                        {propKeys.map((key) => {
                                            const prop = properties[key];
                                            const isRequired = required.includes(key);
                                            return (
                                                <div key={key} className="space-y-1">
                                                    <label className="text-[10px] text-slate-700 flex items-center gap-1">
                                                        <span className="font-mono font-bold">{key}</span>
                                                        {isRequired && <span className="text-red-500">*</span>}
                                                        <span className="text-slate-400">({prop.type})</span>
                                                    </label>
                                                    {prop.description && (
                                                        <p className="text-[9px] text-slate-500">{prop.description}</p>
                                                    )}
                                                    {prop.type === 'boolean' ? (
                                                        <select
                                                            value={String(mcpInputValues[key] ?? '')}
                                                            onChange={(e) => setMcpInputValues(prev => ({
                                                                ...prev,
                                                                [key]: e.target.value === 'true'
                                                            }))}
                                                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs"
                                                        >
                                                            <option value="">-- Select --</option>
                                                            <option value="true">true</option>
                                                            <option value="false">false</option>
                                                        </select>
                                                    ) : prop.enum ? (
                                                        <select
                                                            value={mcpInputValues[key] ?? ''}
                                                            onChange={(e) => setMcpInputValues(prev => ({
                                                                ...prev,
                                                                [key]: e.target.value
                                                            }))}
                                                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs"
                                                        >
                                                            <option value="">-- Select --</option>
                                                            {prop.enum.map((val: string) => (
                                                                <option key={val} value={val}>{val}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type={prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text'}
                                                            value={mcpInputValues[key] ?? ''}
                                                            onChange={(e) => setMcpInputValues(prev => ({
                                                                ...prev,
                                                                [key]: prop.type === 'number' || prop.type === 'integer'
                                                                    ? Number(e.target.value)
                                                                    : e.target.value
                                                            }))}
                                                            placeholder={prop.default !== undefined ? `Default: ${prop.default}` : `Enter ${key}...`}
                                                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs font-mono"
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                        <p className="text-[9px] text-slate-500 pt-2 border-t border-slate-100">
                                            <Lightbulb className="w-3 h-3 text-amber-500 inline-block mr-0.5 -mt-0.5" /> Use <code className="bg-slate-100 px-1 rounded">{'{{variable}}'}</code> for dynamic values
                                        </p>
                                    </div>
                                );
                            })()}

                            {/* Manual JSON fallback */}
                            <details className="group">
                                <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">
                                    Advanced: Manual JSON Arguments
                                </summary>
                                <div className="mt-2 space-y-1.5">
                                    <input
                                        type="text"
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        placeholder="Tool name (overrides selection)"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 text-xs text-slate-900 font-mono"
                                    />
                                    <textarea
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        rows={3}
                                        placeholder='{ "arg1": "{{variable}}" }'
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono"
                                    />
                                </div>
                            </details>
                        </div>
                    );
                })()}

                {/* WEB SEARCH Config */}
                {selectedNode.data.type === NodeType.WEB_SEARCH && (
                    <div className="space-y-4">
                        <div className="p-2 bg-sky-50 border border-sky-100 rounded text-sky-700 text-[10px]">
                            Requires <strong>TAVILY_API_KEY</strong> in Secrets.
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Search Query</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={3}
                                placeholder="Latest news about {{topic}}..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-brand-500"
                            />
                            <p className="text-[9px] text-slate-500">Supports variable interpolation.</p>
                        </div>
                    </div>
                )}

                {/* DEEP RESEARCH Config */}
                {selectedNode.data.type === NodeType.DEEP_RESEARCH && (
                    <div className="space-y-4">
                        <div className="p-2 bg-amber-50 border border-amber-100 rounded text-amber-700 text-[10px]">
                            <strong>35 credits</strong> per research. Requires TAVILY_API_KEY in Secrets.
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Research Topic</label>
                            <textarea
                                value={selectedNode.data.researchTopic || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { researchTopic: e.target.value })}
                                rows={3}
                                placeholder="AI chip market trends and key players..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                            />
                            <p className="text-[9px] text-slate-500">Enter a topic for comprehensive research.</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Max Results</label>
                            <input
                                type="number"
                                value={selectedNode.data.maxResults || 10}
                                onChange={(e) => onUpdateNode(selectedNode.id, { maxResults: parseInt(e.target.value) })}
                                min={5}
                                max={20}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs"
                            />
                        </div>
                    </div>
                )}

                {/* EXTRACT URL Config */}
                {selectedNode.data.type === NodeType.EXTRACT_URL && (
                    <div className="space-y-4">
                        <div className="p-2 bg-emerald-50 border border-emerald-100 rounded text-emerald-700 text-[10px]">
                            <strong>10 credits</strong> per extraction. Requires TAVILY_API_KEY in Secrets.
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">URL to Extract</label>
                            <input
                                type="text"
                                value={selectedNode.data.extractUrl || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { extractUrl: e.target.value })}
                                placeholder="https://example.com/article"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <p className="text-[9px] text-slate-500">Enter the URL to extract content from. Supports {'{{variables}}'}.</p>
                        </div>
                    </div>
                )}

                {/* CRAWL SITE Config */}
                {selectedNode.data.type === NodeType.CRAWL_SITE && (
                    <div className="space-y-4">
                        <div className="p-2 bg-indigo-50 border border-indigo-100 rounded text-indigo-700 text-[10px]">
                            <strong>25 credits</strong> per crawl. Requires TAVILY_API_KEY in Secrets.
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Site URL</label>
                            <input
                                type="text"
                                value={selectedNode.data.crawlUrl || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { crawlUrl: e.target.value })}
                                placeholder="https://example.com"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-[9px] text-slate-500">Enter the root URL to crawl.</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Max Pages</label>
                            <input
                                type="number"
                                value={selectedNode.data.maxPages || 10}
                                onChange={(e) => onUpdateNode(selectedNode.id, { maxPages: parseInt(e.target.value) })}
                                min={1}
                                max={50}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs"
                            />
                        </div>
                    </div>
                )}

                {/* SCHEDULE CONFIG */}
                {selectedNode.data.type === NodeType.SCHEDULE && (
                    <div className="space-y-4">
                        {/* Schedule Active Toggle */}
                        <div className={`p-3 rounded-lg border ${selectedNode.data.scheduleActive ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${selectedNode.data.scheduleActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                    <span className={`text-xs font-bold ${selectedNode.data.scheduleActive ? 'text-emerald-700' : 'text-slate-600'}`}>
                                        {selectedNode.data.scheduleActive ? 'Schedule Active' : 'Schedule Inactive'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        onUpdateNode(selectedNode.id, { scheduleActive: !selectedNode.data.scheduleActive });
                                    }}
                                    className={`px-3 py-1.5 text-xs font-bold rounded transition-all ${selectedNode.data.scheduleActive
                                        ? 'bg-red-500 text-white hover:bg-red-600'
                                        : 'bg-emerald-500 text-white hover:bg-emerald-600'
                                        }`}
                                >
                                    {selectedNode.data.scheduleActive ? 'Stop' : 'Start'}
                                </button>
                            </div>
                            {selectedNode.data.scheduleActive && (
                                <p className="text-[10px] text-emerald-600 mt-2">
                                    ✓ Server-side scheduling will be synced when you save the flow.
                                </p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">CRON Expression</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={cronExpression}
                                    onChange={(e) => setCronExpression(e.target.value)}
                                    placeholder="* * * * *"
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-2 text-xs font-mono"
                                />
                                <a href="https://crontab.guru/" target="_blank" rel="noreferrer" className="flex items-center justify-center px-3 bg-slate-100 border border-slate-200 rounded text-slate-500 hover:text-brand-600 hover:bg-brand-50 transition-colors">
                                    <HelpCircle className="w-4 h-4" />
                                    <HelpCircle className="w-4 h-4" />
                                </a>
                            </div>
                            {/* Human Readable Cron */}
                            {cronExpression && (
                                <div className="text-[10px] text-brand-600 font-medium px-1">
                                    {(() => {
                                        try {
                                            return cronstrue.toString(cronExpression);
                                        } catch (e) {
                                            return <span className="text-red-500">Invalid cron expression</span>;
                                        }
                                    })()}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2 mt-2">
                                <button onClick={() => setCronExpression('*/1 * * * *')} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] hover:border-brand-300">Every 1m</button>
                                <button onClick={() => setCronExpression('*/5 * * * *')} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] hover:border-brand-300">Every 5m</button>
                                <button onClick={() => setCronExpression('0 * * * *')} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] hover:border-brand-300">Hourly</button>
                                <button onClick={() => setCronExpression('0 9 * * *')} className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] hover:border-brand-300">Daily 9am</button>
                            </div>
                        </div>
                        <div className={`p-3 border rounded text-[10px] flex gap-2 ${selectedNode.data.scheduleActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                            <Clock className="w-4 h-4 shrink-0" />
                            {selectedNode.data.scheduleActive ? (
                                <span><strong>Server-side scheduling enabled.</strong> This workflow will run on schedule even when your browser is closed. Save the flow to sync the schedule.</span>
                            ) : (
                                <span>Activate the schedule and save the flow to enable automatic server-side execution.</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Gemini Legacy Specific */}
                {selectedNode.data.type === NodeType.GEMINI && (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Model</label>
                            <select
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                            >
                                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                                <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Prompt</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={10}
                                placeholder="Analyze the sentiment of {{input_text}}..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-mono leading-relaxed"
                            />
                        </div>
                    </>
                )}

                {/* Approval Config */}
                {selectedNode.data.type === NodeType.APPROVAL && (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Review Message</label>
                            <textarea
                                value={approvalMessage}
                                onChange={(e) => setApprovalMessage(e.target.value)}
                                rows={3}
                                placeholder="Please review the generated draft: {{draft}}"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-brand-500"
                            />
                        </div>

                        <div className="pt-2 border-t border-slate-100 space-y-3">
                            <label className="text-[10px] font-bold uppercase text-rose-600 tracking-wider flex items-center gap-1.5">
                                <Radio className="w-3 h-3" /> Ask the Approver Via
                            </label>
                            <div className="grid grid-cols-5 gap-1">
                                {([
                                    { key: 'none', label: 'None' },
                                    { key: 'telegram', label: 'Telegram' },
                                    { key: 'discord', label: 'Discord' },
                                    { key: 'slack', label: 'Slack' },
                                    { key: 'webhook', label: 'Webhook' },
                                ] as const).map(ch => (
                                    <button
                                        key={ch.key}
                                        type="button"
                                        onClick={() => onUpdateNode(selectedNode.id, { approvalNotify: ch.key })}
                                        className={clsx(
                                            "py-1.5 rounded text-[9px] font-semibold border transition-colors",
                                            (selectedNode.data.approvalNotify || (selectedNode.data.webhookUrl ? 'webhook' : 'none')) === ch.key
                                                ? "bg-rose-600 text-white border-rose-600"
                                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                        )}
                                    >
                                        {ch.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[9px] text-slate-500 leading-relaxed">
                                On cloud runs (webhook / schedule / Telegram / Discord triggered), the flow pauses here and the approver receives your message with one-click <strong>Approve</strong> / <strong>Reject</strong> links. Links stay valid for 7 days and are single-use.
                            </p>

                            {(selectedNode.data.approvalNotify === 'telegram') && (
                                <div className="space-y-2">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-medium text-slate-400">Telegram Bot Token</label>
                                        <input
                                            type="password"
                                            value={selectedNode.data.approvalTelegramBotToken || ''}
                                            onChange={(e) => onUpdateNode(selectedNode.id, { approvalTelegramBotToken: e.target.value })}
                                            placeholder="Defaults to TELEGRAM_BOT_TOKEN secret"
                                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[11px] font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-medium text-slate-400">Chat ID (the approver's chat)</label>
                                        <input
                                            type="text"
                                            value={selectedNode.data.approvalTelegramChatId || ''}
                                            onChange={(e) => onUpdateNode(selectedNode.id, { approvalTelegramChatId: e.target.value })}
                                            placeholder="Defaults to TELEGRAM_CHAT_ID secret"
                                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[11px] font-mono"
                                        />
                                    </div>
                                </div>
                            )}

                            {(selectedNode.data.approvalNotify === 'discord') && (
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-medium text-slate-400">Discord Incoming Webhook URL</label>
                                    <input
                                        type="password"
                                        value={selectedNode.data.approvalDiscordWebhookUrl || ''}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { approvalDiscordWebhookUrl: e.target.value })}
                                        placeholder="https://discord.com/api/webhooks/... (or DISCORD_WEBHOOK_URL secret)"
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[11px] font-mono"
                                    />
                                    <p className="text-[8px] text-slate-400">Channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy URL.</p>
                                </div>
                            )}

                            {(selectedNode.data.approvalNotify === 'slack') && (
                                <div className="space-y-1.5">
                                    <label className="text-[9px] font-medium text-slate-400">Slack Incoming Webhook URL</label>
                                    <input
                                        type="password"
                                        value={selectedNode.data.approvalSlackWebhookUrl || ''}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { approvalSlackWebhookUrl: e.target.value })}
                                        placeholder="https://hooks.slack.com/services/... (or SLACK_WEBHOOK secret)"
                                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[11px] font-mono"
                                    />
                                </div>
                            )}

                            {((selectedNode.data.approvalNotify || (selectedNode.data.webhookUrl ? 'webhook' : 'none')) === 'webhook') && (
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-medium text-slate-400">Webhook URL</label>
                                        <input
                                            type="text"
                                            value={webhookUrl}
                                            onChange={(e) => setWebhookUrl(e.target.value)}
                                            placeholder="https://your-service.com/approvals"
                                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[11px] font-mono"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-medium text-slate-400">Signing Secret</label>
                                        <input
                                            type="password"
                                            value={webhookSecret}
                                            onChange={(e) => setWebhookSecret(e.target.value)}
                                            placeholder="Optional HMAC secret"
                                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[11px] font-mono"
                                        />
                                    </div>
                                    <p className="text-[9px] text-slate-500 italic leading-relaxed">
                                        💡 We POST JSON with <code>message</code>, <code>token</code>, <code>approveUrl</code> and <code>rejectUrl</code>. If a secret is set, the request carries <code>X-Bloope-Signature: sha256=HMAC(secret, timestamp.body)</code> plus <code>X-Bloope-Timestamp</code> so your service can verify authenticity. Your service resumes the flow by calling either URL (GET or POST).
                                    </p>
                                </div>
                            )}

                            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-[9px] text-slate-600 space-y-1">
                                <div className="font-bold text-slate-800">After the decision:</div>
                                <ul className="list-disc pl-4 space-y-0.5">
                                    <li><strong>Approve</strong> → flow continues; <code>{`{{${selectedNode.id}.approved}}`}</code> is <code>true</code></li>
                                    <li><strong>Reject</strong> → flow continues with <code>approved: false</code> — add a Condition node on <code>{`{{${selectedNode.id}.approved}}`}</code> to branch or stop</li>
                                    <li>In-editor test runs show an interactive approval dialog instead</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* AI VISION Config */}
                {selectedNode.data.type === NodeType.AI_VISION && (
                    <div className="space-y-4">
                        <div className="p-2 bg-indigo-50 border border-indigo-100 rounded text-indigo-700 text-[10px]">
                            Uses <strong>Gemini 3.1 Flash Lite</strong> for efficient multimodal analysis.
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Image URL</label>
                            <input
                                type="text"
                                value={imageUrl}
                                onChange={(e) => setImageUrl(e.target.value)}
                                placeholder="https://example.com/image.jpg or {{image_var}}"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Analysis Prompt</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={6}
                                placeholder="Describe the image in detail..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Output Variable Name</label>
                            <input
                                type="text"
                                value={variableName}
                                onChange={(e) => setVariableName(e.target.value)}
                                placeholder="image_analysis"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-emerald-600 font-mono focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>
                )}

                {/* FORM TRIGGER CONFIGURATION */}
                {selectedNode.data.type === NodeType.FORM_TRIGGER && (
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Form Details</label>
                            <input
                                type="text"
                                value={formTitle}
                                onChange={(e) => setFormTitle(e.target.value)}
                                placeholder="Form Title"
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs font-bold text-slate-800"
                            />
                            <textarea
                                value={formDescription}
                                onChange={(e) => setFormDescription(e.target.value)}
                                placeholder="Instructions for user..."
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-slate-600"
                                rows={2}
                            />
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Form Fields</label>
                                <button onClick={handleAddField} className="text-[10px] text-brand-600 hover:bg-brand-50 px-2 py-1 rounded flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Add
                                </button>
                            </div>

                            <div className="space-y-3">
                                {formFields.map((field) => (
                                    <div key={field.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 relative group">
                                        <button onClick={() => removeField(field.id)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>

                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                value={field.label}
                                                onChange={(e) => updateField(field.id, { label: e.target.value })}
                                                placeholder="Label"
                                                className="bg-white border border-slate-200 rounded px-2 py-1 text-xs"
                                            />
                                            <input
                                                value={field.variableName}
                                                onChange={(e) => updateField(field.id, { variableName: e.target.value })}
                                                placeholder="var_name"
                                                className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-emerald-600"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <select
                                                value={field.type}
                                                onChange={(e) => updateField(field.id, { type: e.target.value as any })}
                                                className="bg-white border border-slate-200 rounded px-2 py-1 text-xs flex-1"
                                            >
                                                <option value="text">Text</option>
                                                <option value="textarea">Long Text</option>
                                                <option value="number">Number</option>
                                                <option value="email">Email</option>
                                                <option value="date">Date</option>
                                            </select>
                                            <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={field.required}
                                                    onChange={(e) => updateField(field.id, { required: e.target.checked })}
                                                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                                />
                                                <span className="text-[10px] text-slate-500">Required</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {formFields.length === 0 && <p className="text-center text-xs text-slate-400 italic py-2">No fields added yet.</p>}
                            </div>
                        </div>
                    </div>
                )}

                {/* WEBHOOK TRIGGER CONFIGURATION */}
                {selectedNode.data.type === NodeType.WEBHOOK && (
                    <div className="space-y-4">
                        {/* How Webhooks Work */}
                        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-800 text-[10px] space-y-2">
                            <div className="flex items-center gap-2 font-bold">
                                <Radio className="w-4 h-4 text-orange-600" />
                                How Webhooks Work
                            </div>
                            <ol className="list-decimal pl-4 space-y-1 text-[10px]">
                                <li>Click the <strong>Link icon</strong> in the toolbar to configure webhook</li>
                                <li>Enable the webhook and copy the URL</li>
                                <li>External services POST data to your webhook URL</li>
                                <li>Flow auto-runs with payload as variables</li>
                            </ol>
                        </div>

                        {/* Payload Variable Name */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Payload Variable Name</label>
                            <input
                                type="text"
                                value={variableName}
                                onChange={(e) => setVariableName(e.target.value)}
                                placeholder="payload"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-emerald-600 font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                            />
                            <p className="text-[9px] text-slate-500">Access as <code className="bg-slate-100 px-1 rounded">{'{{'}{variableName || 'payload'}.fieldName{'}}'}</code></p>
                        </div>

                        {/* Usage Examples */}
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                            <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Quick Reference</div>
                            <div className="text-[10px] text-slate-500 space-y-1">
                                <div><code className="bg-white border border-slate-200 px-1 rounded">{'{{'}{variableName || 'payload'}.email{'}}'}</code> - Access email field</div>
                                <div><code className="bg-white border border-slate-200 px-1 rounded">{'{{_webhook.method}}'}</code> - HTTP method</div>
                                <div><code className="bg-white border border-slate-200 px-1 rounded">{'{{_webhook.timestamp}}'}</code> - Request timestamp</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* API CALL Configuration */}
                {selectedNode.data.type === NodeType.API_CALL && (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">OAuth Auth</label>
                            <select
                                value={apiAuthProvider}
                                onChange={(e) => setApiAuthProvider(e.target.value as any)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500"
                            >
                                <option value="none">None</option>
                                <option value="google">Google</option>
                                <option value="microsoft">Microsoft 365</option>
                                <option value="slack">Slack</option>
                                <option value="hubspot">HubSpot</option>
                                <option value="stripe">Stripe</option>
                            </select>
                        </div>
                        {apiAuthProvider !== 'none' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Auth Header</label>
                                <input
                                    type="text"
                                    value={apiAuthHeader}
                                    onChange={(e) => setApiAuthHeader(e.target.value)}
                                    placeholder="Authorization"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-brand-500"
                                />
                                <p className="text-[9px] text-slate-500">Token is injected automatically as <span className="font-mono">Bearer &lt;token&gt;</span>.</p>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Method</label>
                            <select
                                value={method}
                                onChange={(e) => setMethod(e.target.value as any)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500"
                            >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="PATCH">PATCH</option>
                                <option value="DELETE">DELETE</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Endpoint URL</label>
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://api.example.com/v1/..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-brand-500"
                            />
                            {!url.trim() && (
                                <div className="flex items-center gap-1.5 text-red-500 mt-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-medium">Endpoint URL is required.</span>
                                </div>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Headers (JSON)</label>
                            <textarea
                                value={headers}
                                onChange={(e) => setHeaders(e.target.value)}
                                rows={3}
                                placeholder='{ "Authorization": "Bearer {{token}}" }'
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-brand-500"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Body (JSON)</label>
                            <textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                rows={5}
                                placeholder='{ "data": "{{value}}" }'
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-brand-500"
                            />
                        </div>
                    </div>
                )}

                {/* Slack Config */}
                {selectedNode.data.type === NodeType.SLACK && (
                    <div className="space-y-4">
                        <div className={clsx("p-2 border rounded text-[10px]", isSlackConnected ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-pink-50 border-pink-200 text-pink-700")}>
                            {isSlackConnected
                                ? <span>Connected to <strong>Slack</strong>. Using OAuth Bot Token.</span>
                                : <span>Using legacy Webhook. Connect Slack in <strong>Settings &gt; Integrations</strong> for advanced features.</span>
                            }
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Webhook URL</label>
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="{{env.SLACK_WEBHOOK}}"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-pink-600 font-mono focus:outline-none focus:border-pink-500"
                            />
                        </div>

                        {/* Standard Channel Config */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Channel</label>
                            {isSlackConnected ? (
                                <div className="relative">
                                    <select
                                        value={slackChannel}
                                        onChange={(e) => setSlackChannel(e.target.value)}
                                        disabled={isLoadingChannels}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-pink-500 appearance-none"
                                    >
                                        <option value="">Select a channel...</option>
                                        {slackChannels.map(c => (
                                            <option key={c.id} value={c.id}>#{c.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                        {isLoadingChannels ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Table className="w-3 h-3" />}
                                    </div>
                                    <div className="text-[9px] text-slate-400 mt-1">
                                        Selecting #{slackChannels.find(c => c.id === slackChannel)?.name || 'channel'} ({slackChannel})
                                    </div>
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    value={slackChannel}
                                    onChange={(e) => setSlackChannel(e.target.value)}
                                    placeholder="#general"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-pink-500"
                                />
                            )}
                            {!slackChannel.trim() && (
                                <div className="flex items-center gap-1.5 text-red-500 mt-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-medium">Slack channel is required.</span>
                                </div>
                            )}
                        </div>

                        {/* Schema First Config */}
                        <div className="pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-bold uppercase text-pink-600 tracking-wider">JSON Structure (Schema)</label>
                                <span className="text-[9px] text-slate-400">Paste ANY valid JSON here</span>
                            </div>
                            <textarea
                                value={slackBody}
                                onChange={(e) => setSlackBody(e.target.value)}
                                rows={6}
                                placeholder={`{
  "text": "My Message",
  "blocks": [...]
}`}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-pink-500 leading-normal"
                            />
                            {!slackBody.trim() && (
                                <div className="flex items-center gap-1.5 text-red-500 mt-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-medium">Slack message payload is required.</span>
                                </div>
                            )}
                        </div>

                        {/* Generated Mapping Inputs */}
                        {slackSchemaFields.length > 0 ? (
                            <div className="space-y-2 mt-2 bg-slate-50 p-2 rounded border border-slate-200 animate-in fade-in slide-in-from-top-2">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Map Variables to Fields</div>
                                {slackSchemaFields.map((field) => (
                                    <div key={field} className="space-y-0.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-mono text-slate-500 truncate" title={field}>{field}</label>
                                        </div>
                                        <input
                                            type="text"
                                            value={slackMappings[field] || ''}
                                            onChange={(e) => handleSlackMappingChange(field, e.target.value)}
                                            placeholder="{{variable_name}}"
                                            className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-emerald-600 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : slackBody.trim() ? (
                            <div className="text-[10px] text-red-500 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Invalid JSON Schema
                            </div>
                        ) : null}
                    </div>
                )}

                {/* Email Config (SMTP) */}
                {selectedNode.data.type === NodeType.EMAIL && (
                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Provider</label>
                            <select
                                value={emailProvider}
                                onChange={(e) => setEmailProvider(e.target.value as 'smtp' | 'microsoft')}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-slate-400"
                            >
                                <option value="smtp">SMTP</option>
                                <option value="microsoft">Microsoft Outlook (Graph)</option>
                            </select>
                        </div>
                        <div className="p-2 bg-slate-100 border border-slate-200 rounded text-slate-600 text-[10px]">
                            {emailProvider === 'microsoft'
                                ? <>Requires connected <strong>Microsoft 365</strong> in Settings &gt; Integrations.</>
                                : <>Requires <strong>SMTP_HOST, SMTP_USER, SMTP_PASS</strong> in Secrets.</>}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">From (Sender)</label>
                            <div className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-400 font-mono cursor-not-allowed">
                                {emailProvider === 'microsoft' ? '(Uses connected Microsoft account)' : '(Uses SMTP_USER from Secrets)'}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">To</label>
                            <input
                                type="text"
                                value={emailTo}
                                onChange={(e) => setEmailTo(e.target.value)}
                                placeholder="recipient@example.com"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-slate-400"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Subject</label>
                            <input
                                type="text"
                                value={emailSubject}
                                onChange={(e) => setEmailSubject(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-slate-400"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Body (HTML supported)</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={6}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-slate-400"
                            />
                        </div>
                    </div>
                )}

                {/* RSS Feed Configuration */}
                {selectedNode.data.type === NodeType.RSS && (
                    <div className="space-y-4">
                        <div className="p-2 bg-orange-50 border border-orange-200 rounded text-orange-700 text-[10px]">
                            Fetches and parses RSS/Atom XML feeds. Output includes <strong>items</strong> array with title, link, description, pubDate.
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">RSS Feed URL</label>
                            <input
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://news.google.com/rss/search?q=tech"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-orange-600 font-mono focus:outline-none focus:border-orange-500"
                            />
                            <p className="text-[9px] text-slate-500">Supports RSS 2.0 and Atom feeds. Variables like {'{{feedUrl}}'} are supported.</p>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Max Items</label>
                            <input
                                type="number"
                                min={1}
                                max={100}
                                value={rssItemLimit}
                                onChange={(e) => setRssItemLimit(parseInt(e.target.value) || 10)}
                                className="w-24 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-orange-500"
                            />
                            <p className="text-[9px] text-slate-500">Limit the number of feed items returned (1-100).</p>
                        </div>
                    </div>
                )}

                {/* Google Sheets Configuration */}
                {selectedNode.data.type === NodeType.SHEETS && (
                    <div className="space-y-4">
                        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-700 text-[10px]">
                            Uses connected OAuth account from Settings &gt; Integrations. Google fallback uses <strong>GOOGLE_ACCESS_TOKEN</strong>, Microsoft fallback uses <strong>MICROSOFT_GRAPH_ACCESS_TOKEN</strong>.
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Provider</label>
                            <select
                                value={sheetProvider}
                                onChange={(e) => setSheetProvider(e.target.value as 'google' | 'microsoft')}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                            >
                                <option value="google">Google Sheets</option>
                                <option value="microsoft">Microsoft 365 Excel</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                {sheetProvider === 'google' ? 'Spreadsheet ID' : 'Workbook Item ID'}
                            </label>
                            <input
                                type="text"
                                value={sheetId}
                                onChange={(e) => setSheetId(e.target.value)}
                                placeholder={sheetProvider === 'google'
                                    ? 'e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
                                    : 'e.g. 01ABCDEF23456789ABCDEFGHIJKL'}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        {sheetProvider === 'microsoft' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Drive ID (Optional)</label>
                                <input
                                    type="text"
                                    value={microsoftDriveId}
                                    onChange={(e) => setMicrosoftDriveId(e.target.value)}
                                    placeholder="Use /me/drive if left blank"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Operation</label>
                            <div className="flex bg-slate-100 rounded p-1 text-xs font-medium">
                                <button
                                    onClick={() => setSheetOperation('append')}
                                    className={`flex-1 py-1.5 rounded transition-colors ${sheetOperation === 'append' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Append Row
                                </button>
                                <button
                                    onClick={() => setSheetOperation('read')}
                                    className={`flex-1 py-1.5 rounded transition-colors ${sheetOperation === 'read' ? 'bg-white shadow text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Read Data
                                </button>
                            </div>
                        </div>

                        {sheetOperation === 'read' ? (
                            <>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Range (A1 Notation)</label>
                                    <input
                                        type="text"
                                        value={sheetRange}
                                        onChange={(e) => setSheetRange(e.target.value)}
                                        placeholder="Sheet1!A1:C10"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Output Variable</label>
                                    <input
                                        type="text"
                                        value={sheetOutputVar}
                                        onChange={(e) => setSheetOutputVar(e.target.value)}
                                        placeholder="sheetData"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-emerald-600 font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Column Mapping</label>
                                    <button
                                        onClick={fetchHeaders}
                                        disabled={isFetchingHeaders || !sheetId || sheetProvider !== 'google'}
                                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                                    >
                                        {isFetchingHeaders ? <Clock className="w-3 h-3 animate-spin" /> : <Table className="w-3 h-3" />}
                                        Fetch Headers
                                    </button>
                                </div>

                                {sheetProvider !== 'google' && (
                                    <div className="text-[10px] text-slate-500">
                                        Header fetch currently supports Google API. For Excel, provide explicit JSON row values below.
                                    </div>
                                )}

                                {headerError && (
                                    <div className="text-[10px] text-red-500 flex items-start gap-1 p-2 bg-red-50 rounded">
                                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                        <span className="break-all">{headerError}</span>
                                    </div>
                                )}

                                {sheetHeaders.length > 0 ? (
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                        {sheetHeaders.map((header, i) => (
                                            <div key={i} className="space-y-0.5">
                                                <label className="text-[10px] font-mono text-slate-500 truncate" title={header}>{header}</label>
                                                <input
                                                    type="text"
                                                    value={slackMappings[header] || ''}
                                                    onChange={(e) => {
                                                        // Reuse slackMappings for now
                                                        // Wait, I need to update slackMappings
                                                        // I'll define handleSlackMappingChange inline logic if needed or just assume it works if I find it.
                                                        // But I can't access handleSlackMappingChange here easily if it's defined inside? It is.
                                                        // I'll just use a placeholder text saying "Use JSON"
                                                        // OR better, I defined `slackMappings` in state.
                                                        // I'll call setSlackMappings.
                                                        setSlackMappings(prev => ({ ...prev, [header]: e.target.value }));
                                                    }}
                                                    placeholder="{{variable}}"
                                                    className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs text-emerald-600 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                                                />
                                            </div>
                                        ))}
                                        <div className="text-[9px] text-slate-400 italic">
                                            * Ensure your JSON body below matches these columns or leave body empty to auto-construct (future).
                                            Currently, please use the JSON body field below for full control.
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-4 bg-slate-50 rounded border border-slate-100 border-dashed text-slate-400 text-[10px]">
                                        Fetch headers to see columns.
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                {sheetOperation === 'append' ? 'Row Data (JSON)' : 'Fallback / JSON'}
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={4}
                                placeholder={sheetOperation === 'append' ? '{"Column1": "Value", "Column2": "{{var}}"}' : ''}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>
                )}

                {/* HubSpot Configuration */}
                {selectedNode.data.type === NodeType.HUBSPOT && (
                    <div className="space-y-4">
                        <div className="p-2 bg-[#fff4f0] border border-[#ff7a59]/30 rounded text-[#ff3d2e] text-[10px]">
                            Uses <strong>HubSpot OAuth</strong> from Connected Accounts in Settings.
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Operation</label>
                            <select
                                value={selectedNode.data.hubspotOperation || 'create_contact'}
                                onChange={(e) => onUpdateNode(selectedNode.id, { hubspotOperation: e.target.value as 'create_contact' | 'update_contact' | 'get_contact' | 'search_contacts' | 'create_deal' | 'get_deal' })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#ff7a59]"
                            >
                                <optgroup label="Contacts">
                                    <option value="create_contact">Create Contact</option>
                                    <option value="update_contact">Update Contact</option>
                                    <option value="get_contact">Get Contact by ID</option>
                                    <option value="search_contacts">Search Contacts</option>
                                </optgroup>
                                <optgroup label="Deals">
                                    <option value="create_deal">Create Deal</option>
                                    <option value="get_deal">Get Deal by ID</option>
                                </optgroup>
                            </select>
                        </div>

                        {/* Contact Email - for create/update */}
                        {(selectedNode.data.hubspotOperation === 'create_contact' || selectedNode.data.hubspotOperation === 'update_contact') && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Contact Email</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.hubspotEmail || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { hubspotEmail: e.target.value })}
                                    placeholder="john@example.com or {{email}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#ff7a59]"
                                />
                            </div>
                        )}

                        {/* Contact ID - for get/update */}
                        {(selectedNode.data.hubspotOperation === 'get_contact' || selectedNode.data.hubspotOperation === 'update_contact') && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Contact ID</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.hubspotContactId || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { hubspotContactId: e.target.value })}
                                    placeholder="12345 or {{contactId}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#ff7a59]"
                                />
                            </div>
                        )}

                        {/* Deal ID - for get deal */}
                        {selectedNode.data.hubspotOperation === 'get_deal' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Deal ID</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.hubspotDealId || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { hubspotDealId: e.target.value })}
                                    placeholder="12345 or {{dealId}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#ff7a59]"
                                />
                            </div>
                        )}

                        {/* Properties JSON - for create/update/search */}
                        {(selectedNode.data.hubspotOperation === 'create_contact' ||
                            selectedNode.data.hubspotOperation === 'update_contact' ||
                            selectedNode.data.hubspotOperation === 'search_contacts' ||
                            selectedNode.data.hubspotOperation === 'create_deal') && (
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                        {selectedNode.data.hubspotOperation === 'search_contacts' ? 'Search Filters (JSON)' : 'Properties (JSON)'}
                                    </label>
                                    <textarea
                                        value={selectedNode.data.hubspotProperties || ''}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { hubspotProperties: e.target.value })}
                                        rows={5}
                                        placeholder={selectedNode.data.hubspotOperation === 'search_contacts'
                                            ? '{ "filters": [{ "propertyName": "email", "operator": "CONTAINS_TOKEN", "value": "{{domain}}" }] }'
                                            : '{ "firstname": "{{firstName}}", "lastname": "{{lastName}}", "company": "{{company}}" }'}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#ff7a59]"
                                    />
                                    <p className="text-[9px] text-slate-500">Supports variable interpolation like {'{{variable}}'}</p>
                                </div>
                            )}

                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-600">
                            <strong>Available Properties:</strong> firstname, lastname, email, phone, company, website, jobtitle, lifecyclestage, etc.
                        </div>
                    </div>
                )}
                {/* Zapier Webhook Configuration */}
                {selectedNode.data.type === NodeType.ZAPIER_WEBHOOK && (
                    <div className="space-y-4">
                        <div className="p-3 bg-orange-50/50 border border-orange-200 rounded-lg flex items-start gap-2.5">
                            <Zap className="w-4 h-4 text-[#FF4F00] shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">Zapier Webhooks</span>
                                Connect directly to your Zapier Catch Hook or Poll endpoints to trigger Zaps and send structured payloads.
                            </div>
                        </div>

                        {/* Webhook URL */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Zapier Webhook URL</label>
                            <input
                                type="text"
                                value={zapierWebhookUrl}
                                onChange={(e) => setZapierWebhookUrl(e.target.value)}
                                placeholder="https://hooks.zapier.com/hooks/catch/..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#FF4F00]"
                            />
                            {!zapierWebhookUrl.trim() && (
                                <div className="flex items-center gap-1.5 text-red-500 mt-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-medium">Zapier Webhook URL is required.</span>
                                </div>
                            )}
                        </div>

                        {/* Operation */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Operation</label>
                            <select
                                value={zapierOperation}
                                onChange={(e) => setZapierOperation(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#FF4F00]"
                            >
                                <option value="Trigger Zap (POST)">Trigger Zap (POST)</option>
                                <option value="Trigger Zap (PUT)">Trigger Zap (PUT)</option>
                                <option value="Retrieve Data (GET)">Retrieve Data (GET)</option>
                                <option value="Send Raw Payload">Send Raw Payload</option>
                                <option value="Send Form Data">Send Form Data</option>
                                <option value="Trigger with Delay">Trigger with Delay</option>
                            </select>
                        </div>

                        {/* Data Payload */}
                        {zapierOperation !== 'Retrieve Data (GET)' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Data Payload (JSON)</label>
                                <textarea
                                    value={zapierData}
                                    onChange={(e) => setZapierData(e.target.value)}
                                    rows={5}
                                    placeholder='{ "email": "{{email}}", "name": "{{name}}" }'
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#FF4F00]"
                                />
                                {!zapierData.trim() && (
                                    <div className="flex items-center gap-1.5 text-red-500 mt-1">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-medium">Data payload cannot be empty.</span>
                                    </div>
                                )}
                                <p className="text-[9px] text-slate-400">Variable tags like {'{{email}}'} will be dynamically interpolated.</p>
                            </div>
                        )}

                        {/* Content Type */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Payload Content Type</label>
                            <select
                                value={zapierPayloadType}
                                onChange={(e) => setZapierPayloadType(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#FF4F00]"
                            >
                                <option value="application/json">application/json</option>
                                <option value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</option>
                                <option value="text/plain">text/plain</option>
                                <option value="multipart/form-data">multipart/form-data</option>
                            </select>
                        </div>

                        {/* Flatten Data Toggle */}
                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                                <p className="text-xs font-semibold text-slate-800">Flatten Nested JSON</p>
                                <p className="text-[9px] text-slate-400">Flatten object keys (e.g. user.email)</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setZapierFlattenData(!zapierFlattenData)}
                                className={`w-10 h-5 rounded-full transition-colors relative ${zapierFlattenData ? 'bg-orange-500' : 'bg-slate-300'}`}
                            >
                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${zapierFlattenData ? 'left-5' : 'left-0.5'}`} />
                            </button>
                        </div>

                        {/* Advanced Settings (Timeout / Retry) */}
                        <div className="border-t border-slate-100 pt-3 space-y-3">
                            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Advanced Settings</div>

                            {/* Timeout */}
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] text-slate-500">Request Timeout</label>
                                    <span className="text-xs font-mono font-medium">{zapierTimeout}s</span>
                                </div>
                                <input
                                    type="range"
                                    min="5"
                                    max="60"
                                    step="5"
                                    value={zapierTimeout}
                                    onChange={(e) => setZapierTimeout(Number(e.target.value))}
                                    className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                            </div>

                            {/* Query Parameters */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-slate-500">Query Parameters (JSON)</label>
                                <textarea
                                    value={zapierQueryParams}
                                    onChange={(e) => setZapierQueryParams(e.target.value)}
                                    rows={2}
                                    placeholder='{ "source": "bloope" }'
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#FF4F00]"
                                />
                            </div>

                            {/* Custom Headers */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-slate-500">Custom Headers (JSON)</label>
                                <textarea
                                    value={zapierCustomHeaders}
                                    onChange={(e) => setZapierCustomHeaders(e.target.value)}
                                    rows={2}
                                    placeholder='{ "X-Custom-Auth": "SecretToken" }'
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-[#FF4F00]"
                                />
                            </div>

                            {/* Toggles */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-[10px] text-slate-600">Retry on 5xx Error</span>
                                    <button
                                        type="button"
                                        onClick={() => setZapierRetryOnFailure(!zapierRetryOnFailure)}
                                        className={`w-8 h-4 rounded-full transition-colors relative ${zapierRetryOnFailure ? 'bg-[#FF4F00]' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${zapierRetryOnFailure ? 'left-4.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-[10px] text-slate-600">Batch Processing (For Lists)</span>
                                    <button
                                        type="button"
                                        onClick={() => setZapierBatchProcessing(!zapierBatchProcessing)}
                                        className={`w-8 h-4 rounded-full transition-colors relative ${zapierBatchProcessing ? 'bg-[#FF4F00]' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${zapierBatchProcessing ? 'left-4.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-[10px] text-slate-600">Wait for Catch Hook & Return</span>
                                    <button
                                        type="button"
                                        onClick={() => setZapierWaitForResponse(!zapierWaitForResponse)}
                                        className={`w-8 h-4 rounded-full transition-colors relative ${zapierWaitForResponse ? 'bg-[#FF4F00]' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${zapierWaitForResponse ? 'left-4.5' : 'left-0.5'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Stripe Configuration */}
                {selectedNode.data.type === NodeType.STRIPE && (
                    <div className="space-y-4">
                        <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-lg flex items-start gap-2.5">
                            <CreditCard className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">Stripe Payments</span>
                                Charge customers, refund payments, manage invoices, or create subscription entities directly inside workflows.
                            </div>
                        </div>

                        {/* Stripe Secret Key */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Stripe Secret Key</label>
                            <input
                                type="password"
                                value={stripeApiKey}
                                onChange={(e) => setStripeApiKey(e.target.value)}
                                placeholder="sk_live_..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                            />
                            {!stripeApiKey.trim() && (
                                <div className="flex items-center gap-1.5 text-red-500 mt-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-medium">Stripe Secret Key is required.</span>
                                </div>
                            )}
                        </div>

                        {/* Operation */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Operation</label>
                            <select
                                value={stripeOperation}
                                onChange={(e) => setStripeOperation(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                            >
                                <option value="Create Charge">Create Charge</option>
                                <option value="Create Customer">Create Customer</option>
                                <option value="Create Subscription">Create Subscription</option>
                                <option value="Get Customer">Get Customer</option>
                                <option value="List Invoices">List Invoices</option>
                                <option value="Create Payment Intent">Create Payment Intent</option>
                                <option value="Refund Payment">Refund Payment</option>
                                <option value="Cancel Subscription">Cancel Subscription</option>
                            </select>
                        </div>

                        {/* Amount */}
                        {(stripeOperation === 'Create Charge' || stripeOperation === 'Create Payment Intent' || stripeOperation === 'Refund Payment') && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Amount (cents)</label>
                                <input
                                    type="number"
                                    value={stripeAmount}
                                    onChange={(e) => setStripeAmount(Number(e.target.value))}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}

                        {/* Currency */}
                        {(stripeOperation === 'Create Charge' || stripeOperation === 'Create Payment Intent') && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Currency</label>
                                <select
                                    value={stripeCurrency}
                                    onChange={(e) => setStripeCurrency(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="usd">USD</option>
                                    <option value="eur">EUR</option>
                                    <option value="gbp">GBP</option>
                                    <option value="inr">INR</option>
                                    <option value="aud">AUD</option>
                                    <option value="cad">CAD</option>
                                </select>
                            </div>
                        )}

                        {/* Customer Email */}
                        {stripeOperation === 'Create Customer' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Customer Email</label>
                                <input
                                    type="text"
                                    value={stripeEmail}
                                    onChange={(e) => setStripeEmail(e.target.value)}
                                    placeholder="email@example.com or {{email}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}

                        {/* Customer ID */}
                        {(stripeOperation === 'Get Customer' || stripeOperation === 'Create Subscription' || stripeOperation === 'Create Charge' || stripeOperation === 'Create Payment Intent') && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Customer ID</label>
                                <input
                                    type="text"
                                    value={stripeCustomerId}
                                    onChange={(e) => setStripeCustomerId(e.target.value)}
                                    placeholder="cus_H1abc or {{customerId}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}

                        {/* Price ID */}
                        {stripeOperation === 'Create Subscription' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Price / Plan ID</label>
                                <input
                                    type="text"
                                    value={stripePriceId}
                                    onChange={(e) => setStripePriceId(e.target.value)}
                                    placeholder="price_H1abc or {{priceId}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}

                        {/* Subscription ID */}
                        {stripeOperation === 'Cancel Subscription' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Subscription ID</label>
                                <input
                                    type="text"
                                    value={stripeSubscriptionId}
                                    onChange={(e) => setStripeSubscriptionId(e.target.value)}
                                    placeholder="sub_H1abc or {{subscriptionId}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}

                        {/* Description */}
                        {(stripeOperation === 'Create Charge' || stripeOperation === 'Create Payment Intent') && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Payment Description</label>
                                <input
                                    type="text"
                                    value={stripeDescription}
                                    onChange={(e) => setStripeDescription(e.target.value)}
                                    placeholder="Bloope payment or {{description}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}

                        {/* Metadata JSON */}
                        {(stripeOperation === 'Create Charge' || stripeOperation === 'Create Payment Intent' || stripeOperation === 'Create Customer' || stripeOperation === 'Create Subscription') && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Metadata (JSON)</label>
                                <textarea
                                    value={stripeMetadata}
                                    onChange={(e) => setStripeMetadata(e.target.value)}
                                    rows={3}
                                    placeholder='{ "userId": "123" }'
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* WhatsApp Trigger Configuration */}
                {selectedNode.data.type === NodeType.WHATSAPP_TRIGGER && (
                    <div className="space-y-4">
                        <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg flex items-start gap-2.5">
                            <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">WhatsApp Webhook Trigger</span>
                                Set up WhatsApp incoming messages webhook in your Meta App Dashboard.
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Webhook Tunnel URL (HTTPS, for Local Dev)</label>
                            <input
                                type="text"
                                value={selectedNode.data.whatsappTunnelUrl || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { whatsappTunnelUrl: e.target.value })}
                                placeholder="e.g. https://yourdomain.ngrok-free.app"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                            {(!selectedNode.data.whatsappTunnelUrl && window.location.origin.includes('localhost')) && (
                                <p className="text-[9px] text-red-500 font-medium">⚠️ Meta requires HTTPS webhooks. Please enter an HTTPS tunnel URL (e.g. from ngrok) during local development.</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Webhook URL (Copy to Meta)</label>
                            <input
                                type="text"
                                readOnly
                                value={`${selectedNode.data.whatsappTunnelUrl || window.location.origin}/api/webhook/whatsapp`}
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                className="w-full bg-slate-100 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-600 font-mono focus:outline-none cursor-pointer"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Verify Token (Copy to Meta)</label>
                            <input
                                type="text"
                                readOnly
                                value={selectedNode.data.whatsappVerifyToken || (selectedNode.data.whatsappVerifyToken = 'bloope-verify-token')}
                                className="w-full bg-slate-100 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-600 font-mono focus:outline-none"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Phone Number ID</label>
                            <input
                                type="text"
                                value={selectedNode.data.whatsappPhoneNumberId || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { whatsappPhoneNumberId: e.target.value })}
                                placeholder="e.g. 10928374829"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">WhatsApp Business Account ID</label>
                            <input
                                type="text"
                                value={selectedNode.data.whatsappWabaId || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { whatsappWabaId: e.target.value })}
                                placeholder="e.g. 9876543210123"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-[9px] text-slate-600 space-y-1">
                            <div className="font-bold text-slate-800">Outputs Available (for downstream nodes):</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                                <li>Message Text: <code>{`{{${selectedNode.id}.text}}`}</code></li>
                                <li>Sender Phone: <code>{`{{${selectedNode.id}.from}}`}</code></li>
                                <li>Sender Name: <code>{`{{${selectedNode.id}.sender}}`}</code></li>
                                <li>Message ID: <code>{`{{${selectedNode.id}.messageId}}`}</code></li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* WhatsApp Action Configuration */}
                {selectedNode.data.type === NodeType.WHATSAPP_SEND && (
                    <div className="space-y-4">
                        <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg flex items-start gap-2.5">
                            <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">Send WhatsApp Message</span>
                                Sends a WhatsApp message using Meta's Cloud API. Uses OAuth access token.
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Recipient Phone Number</label>
                            <input
                                type="text"
                                value={selectedNode.data.whatsappPhone || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { whatsappPhone: e.target.value })}
                                placeholder="e.g. 919876543210 or {{phone}}"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Phone Number ID</label>
                            <input
                                type="text"
                                value={selectedNode.data.whatsappPhoneNumberId || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { whatsappPhoneNumberId: e.target.value })}
                                placeholder="e.g. 10928374829"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <p className="text-[8px] text-slate-400">Specify custom ID or leave blank to fallback to WHATSAPP_PHONE_NUMBER_ID secret/env.</p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">WhatsApp Business Account ID (WABA)</label>
                            <input
                                type="text"
                                value={selectedNode.data.whatsappWabaId || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { whatsappWabaId: e.target.value })}
                                placeholder="e.g. 9876543210123"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <p className="text-[8px] text-slate-400">Specify custom WABA ID or leave blank to fallback to WHATSAPP_WABA_ID secret/env.</p>
                        </div>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-[9px] text-slate-500 leading-normal">
                            <strong>Setup Tip:</strong> Add your <code>WHATSAPP_ACCESS_TOKEN</code> in your <strong>Secrets</strong> menu (top right) or connect via Integrations in Settings.
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Message Type</label>
                            <select
                                value={selectedNode.data.whatsappMessageType || 'text'}
                                onChange={(e) => onUpdateNode(selectedNode.id, { whatsappMessageType: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                            >
                                <option value="text">Text Message</option>
                                <option value="template">Template Message</option>
                                <option value="media">Media Message</option>
                            </select>
                        </div>

                        {selectedNode.data.whatsappMessageType === 'text' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Message Content</label>
                                <textarea
                                    value={selectedNode.data.whatsappBodyText || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { whatsappBodyText: e.target.value })}
                                    rows={4}
                                    placeholder="Hello {{name}}, welcome to our platform!"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                        )}

                        {selectedNode.data.whatsappMessageType === 'template' && (
                            <>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Template Name</label>
                                    <input
                                        type="text"
                                        value={selectedNode.data.whatsappTemplateName || ''}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { whatsappTemplateName: e.target.value })}
                                        placeholder="e.g. welcome_message"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Language Code</label>
                                    <input
                                        type="text"
                                        value={selectedNode.data.whatsappTemplateLanguage || 'en_US'}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { whatsappTemplateLanguage: e.target.value })}
                                        placeholder="en_US or hi_IN"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Parameters (JSON Array)</label>
                                    <textarea
                                        value={selectedNode.data.whatsappTemplateParams || '[]'}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { whatsappTemplateParams: e.target.value })}
                                        rows={3}
                                        placeholder='["{{name}}", "123456"]'
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                    <p className="text-[8px] text-slate-400">Provide template parameters in order as a JSON string array.</p>
                                </div>
                            </>
                        )}

                        {selectedNode.data.whatsappMessageType === 'media' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Media URL (Image / PDF)</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.whatsappMediaUrl || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { whatsappMediaUrl: e.target.value })}
                                    placeholder="https://example.com/brochure.pdf"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Razorpay Trigger Configuration */}
                {selectedNode.data.type === NodeType.RAZORPAY_TRIGGER && (
                    <div className="space-y-4">
                        <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg flex items-start gap-2.5">
                            <CreditCard className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">Razorpay Webhook Trigger</span>
                                Set up this webhook URL in your Razorpay Dashboard Settings.
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Webhook Tunnel URL (HTTPS, for Local Dev)</label>
                            <input
                                type="text"
                                value={selectedNode.data.razorpayTunnelUrl || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { razorpayTunnelUrl: e.target.value })}
                                placeholder="e.g. https://yourdomain.ngrok-free.app"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                            />
                            {(!selectedNode.data.razorpayTunnelUrl && window.location.origin.includes('localhost')) && (
                                <p className="text-[9px] text-red-500 font-medium">⚠️ Razorpay requires HTTPS webhooks. Please enter an HTTPS tunnel URL (e.g. from ngrok) during local development.</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Webhook URL (Copy to Razorpay)</label>
                            <input
                                type="text"
                                readOnly
                                value={`${selectedNode.data.razorpayTunnelUrl || window.location.origin}/api/webhook/razorpay`}
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                className="w-full bg-slate-100 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-600 font-mono focus:outline-none cursor-pointer"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Event Subscription</label>
                            <select
                                value={selectedNode.data.razorpayEvent || 'payment.captured'}
                                onChange={(e) => onUpdateNode(selectedNode.id, { razorpayEvent: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                            >
                                <option value="payment.captured">payment.captured</option>
                                <option value="payment.failed">payment.failed</option>
                                <option value="subscription.charged">subscription.charged</option>
                                <option value="payment_link.paid">payment_link.paid</option>
                            </select>
                        </div>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-[9px] text-slate-600 space-y-1">
                            <div className="font-bold text-slate-800">Outputs Available (for downstream nodes):</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                                <li>Event Type: <code>{`{{${selectedNode.id}.event}}`}</code></li>
                                <li>Payment ID: <code>{`{{${selectedNode.id}.paymentId}}`}</code></li>
                                <li>Amount (in paise): <code>{`{{${selectedNode.id}.amount}}`}</code></li>
                                <li>Email ID: <code>{`{{${selectedNode.id}.email}}`}</code></li>
                                <li>Contact Phone: <code>{`{{${selectedNode.id}.contact}}`}</code></li>
                                <li>Payment Method: <code>{`{{${selectedNode.id}.method}}`}</code></li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Razorpay Action Configuration */}
                {selectedNode.data.type === NodeType.RAZORPAY_ACTION && (
                    <div className="space-y-4">
                        <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg flex items-start gap-2.5">
                            <CreditCard className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">Razorpay Action</span>
                                Create links, issue refunds, or fetch transaction details.
                            </div>
                        </div>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-[9px] text-slate-500 leading-normal">
                            <strong>Setup Requirement:</strong> Requires <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> inside your <strong>Secrets</strong> menu (top right of screen).
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Operation</label>
                            <select
                                value={selectedNode.data.razorpayOperation || 'Create Payment Link'}
                                onChange={(e) => onUpdateNode(selectedNode.id, { razorpayOperation: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                            >
                                <option value="Create Payment Link">Create Payment Link</option>
                                <option value="Issue Refund">Issue Refund</option>
                                <option value="Fetch Payment">Fetch Payment Details</option>
                            </select>
                        </div>

                        {(selectedNode.data.razorpayOperation === 'Create Payment Link' || selectedNode.data.razorpayOperation === 'Issue Refund') && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                    Amount {selectedNode.data.razorpayOperation === 'Create Payment Link' ? '(in paise)' : '(in paise, optional)'}
                                </label>
                                <input
                                    type="text"
                                    value={selectedNode.data.razorpayAmount || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { razorpayAmount: e.target.value })}
                                    placeholder="e.g. 50000 (for Rs. 500)"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                                />
                                {selectedNode.data.razorpayAmount && isNaN(Number(selectedNode.data.razorpayAmount)) && !selectedNode.data.razorpayAmount.includes('{{') && (
                                    <p className="text-[9px] text-red-500 font-medium">⚠️ Amount must be a valid number in paise (e.g. 100 paise = 1 INR).</p>
                                )}
                            </div>
                        )}

                        {selectedNode.data.razorpayOperation === 'Create Payment Link' && (
                            <>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Currency</label>
                                    <input
                                        type="text"
                                        value={selectedNode.data.razorpayCurrency || 'INR'}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { razorpayCurrency: e.target.value })}
                                        placeholder="INR"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Description</label>
                                    <input
                                        type="text"
                                        value={selectedNode.data.razorpayDescription || ''}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { razorpayDescription: e.target.value })}
                                        placeholder="e.g. Payment for Order #123"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </>
                        )}

                        {(selectedNode.data.razorpayOperation === 'Issue Refund' || selectedNode.data.razorpayOperation === 'Fetch Payment') && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Payment ID</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.razorpayPaymentId || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { razorpayPaymentId: e.target.value })}
                                    placeholder="e.g. pay_H1abc123 or {{paymentId}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Telegram Trigger Configuration */}
                {selectedNode.data.type === NodeType.TELEGRAM_TRIGGER && (
                    <div className="space-y-4">
                        <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-lg flex items-start gap-2.5">
                            <MessageCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">Telegram Trigger</span>
                                Receive incoming messages sent to your Telegram Bot.
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Bot Token</label>
                            <input
                                type="password"
                                value={selectedNode.data.telegramBotToken || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { telegramBotToken: e.target.value })}
                                placeholder="123456:ABC-DEF1234ghIkl-zyx"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                            />
                            <p className="text-[8px] text-slate-400">
                                Need a token? Create a bot by messaging <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline font-semibold">@BotFather</a> on Telegram.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Bot Username (Optional)</label>
                            <input
                                type="text"
                                value={selectedNode.data.telegramBotUsername || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { telegramBotUsername: e.target.value })}
                                placeholder="e.g. MyAwesomeBot"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                            />
                            {selectedNode.data.telegramBotUsername && (
                                <a 
                                    href={`https://t.me/${selectedNode.data.telegramBotUsername.replace('@', '')}`}
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-[9px] text-sky-600 hover:underline font-semibold block"
                                >
                                    Open Bot: t.me/{selectedNode.data.telegramBotUsername.replace('@', '')}
                                </a>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Webhook Tunnel URL (HTTPS, for Local Dev)</label>
                            <input
                                type="text"
                                value={selectedNode.data.telegramTunnelUrl || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { telegramTunnelUrl: e.target.value })}
                                placeholder="e.g. https://yourdomain.ngrok-free.app"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                            />
                            {(!selectedNode.data.telegramTunnelUrl && window.location.origin.includes('localhost')) ? (
                                <p className="text-[9px] text-red-500 font-medium">⚠️ Telegram Bot API requires HTTPS webhook URLs. Please enter your HTTPS tunnel URL (from ngrok/localtunnel) to register.</p>
                            ) : (
                                <p className="text-[8px] text-slate-400">Current webhook URL: <code className="bg-slate-100 px-1 rounded">{`${selectedNode.data.telegramTunnelUrl || window.location.origin}/api/webhook/telegram?flowId=${flowId || selectedNode.id}`}</code></p>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={!selectedNode.data.telegramBotToken}
                                onClick={async () => {
                                    try {
                                        const botToken = selectedNode.data.telegramBotToken;
                                        const baseOrigin = selectedNode.data.telegramTunnelUrl || window.location.origin;
                                        // Must be the FLOW id — the webhook handler looks up the flow by this value
                                        const webhookUrl = `${baseOrigin}/api/webhook/telegram?flowId=${flowId || selectedNode.id}`;
                                        
                                        if (!webhookUrl.startsWith('https://')) {
                                            alert("Failed: Telegram requires an HTTPS webhook URL. Please use an HTTPS tunnel URL (e.g. ngrok) if running locally.");
                                            return;
                                        }

                                        const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${webhookUrl}`);
                                        const data = await response.json();
                                        if (data.ok) {
                                            alert("Telegram webhook successfully configured!");
                                            // Auto fetch connection status details
                                            const statusRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
                                            const statusData = await statusRes.json();
                                            if (statusData.ok) {
                                                setTelegramWebhookInfo(statusData.result);
                                            }
                                        } else {
                                            alert(`Failed to set Telegram webhook: ${data.description}`);
                                        }
                                    } catch (err: any) {
                                        alert(`Error setting webhook: ${err.message}`);
                                    }
                                }}
                                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white rounded-md py-2 text-xs font-semibold disabled:opacity-50 transition-colors"
                            >
                                Register Webhook
                            </button>

                            <button
                                type="button"
                                disabled={!selectedNode.data.telegramBotToken || isVerifyingTelegram}
                                onClick={async () => {
                                    setIsVerifyingTelegram(true);
                                    setTelegramVerifyError('');
                                    try {
                                        const botToken = selectedNode.data.telegramBotToken;
                                        const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
                                        const data = await response.json();
                                        if (data.ok) {
                                            setTelegramWebhookInfo(data.result);
                                        } else {
                                            setTelegramVerifyError(data.description || 'Failed to fetch webhook info');
                                        }
                                    } catch (err: any) {
                                        setTelegramVerifyError(err.message);
                                    } finally {
                                        setIsVerifyingTelegram(false);
                                    }
                                }}
                                className="px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md py-2 text-xs font-semibold text-slate-700 transition-colors"
                            >
                                {isVerifyingTelegram ? 'Checking...' : 'Check Status'}
                            </button>
                        </div>

                        {telegramWebhookInfo && (
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] space-y-1 animate-in fade-in duration-200">
                                <div className="font-bold text-slate-800 border-b border-slate-200 pb-1 flex justify-between">
                                    <span>Webhook Connection:</span>
                                    <span className={telegramWebhookInfo.url ? "text-emerald-600 font-bold" : "text-amber-500 font-bold"}>
                                        {telegramWebhookInfo.url ? "Active" : "Not Registered"}
                                    </span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-slate-400 font-mono">Registered URL:</span>
                                    <span className="truncate font-mono text-slate-700 max-w-[140px]">{telegramWebhookInfo.url || 'none'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400 font-mono">Pending Updates:</span>
                                    <span className="font-mono font-bold text-slate-700">{telegramWebhookInfo.pending_update_count}</span>
                                </div>
                                {telegramWebhookInfo.last_error_message && (
                                    <div className="pt-1 text-red-500 font-medium leading-normal border-t border-slate-200 mt-1">
                                        Last Error: {telegramWebhookInfo.last_error_message}
                                    </div>
                                )}
                            </div>
                        )}

                        {telegramVerifyError && (
                            <div className="p-2.5 bg-red-50 border border-red-200 rounded-md text-[9px] text-red-600">
                                <strong>Status Query Error:</strong> {telegramVerifyError}
                            </div>
                        )}
                        <p className="text-[8px] text-slate-400 text-center">Registers webhook handler endpoint dynamically with Telegram Bot API.</p>

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-[9px] text-slate-600 space-y-1">
                            <div className="font-bold text-slate-800">Outputs Available (for downstream nodes):</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                                <li>Message Text: <code>{`{{${selectedNode.id}.text}}`}</code></li>
                                <li>Sender Chat ID: <code>{`{{${selectedNode.id}.chatId}}`}</code></li>
                                <li>Sender Username: <code>{`{{${selectedNode.id}.username}}`}</code></li>
                                <li>Sender First Name: <code>{`{{${selectedNode.id}.firstName}}`}</code></li>
                                <li>Message ID: <code>{`{{${selectedNode.id}.messageId}}`}</code></li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Telegram Send Configuration */}
                {selectedNode.data.type === NodeType.TELEGRAM_SEND && (
                    <div className="space-y-4">
                        <div className="p-3 bg-sky-50/50 border border-sky-200 rounded-lg flex items-start gap-2.5">
                            <MessageCircle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">Send Telegram Message</span>
                                Sends a message using Telegram Bot API.
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Bot Token</label>
                            <input
                                type="password"
                                value={selectedNode.data.telegramBotToken || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { telegramBotToken: e.target.value })}
                                placeholder="123456:ABC-DEF1234ghIkl-zyx"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Chat ID</label>
                            <input
                                type="text"
                                value={selectedNode.data.telegramChatId || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { telegramChatId: e.target.value })}
                                placeholder="e.g. 98765432 or @channelname"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-sky-500"
                            />
                            <p className="text-[8px] text-slate-400">
                                Tip: Message <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-sky-600 underline font-semibold">@userinfobot</a> on Telegram to find your Chat ID instantly, or add bot to a channel/group.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Message Text</label>
                            <textarea
                                value={selectedNode.data.telegramMessage || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { telegramMessage: e.target.value })}
                                rows={4}
                                placeholder="Hello! Here is the workflow status update."
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                            />
                        </div>
                    </div>
                )}

                {/* Discord Trigger Configuration */}
                {selectedNode.data.type === NodeType.DISCORD_TRIGGER && (
                    <div className="space-y-4">
                        <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-lg flex items-start gap-2.5">
                            <Bot className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">Discord Trigger (Slash Command)</span>
                                Runs this flow when someone uses your bot's slash command (e.g. <code className="bg-indigo-100 px-1 rounded">/{(selectedNode.data.discordCommandName || 'run').replace(/^\//, '')}</code>) in any server the bot is in.
                            </div>
                        </div>

                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-[9px] text-amber-800 leading-relaxed">
                            <strong>Note:</strong> Unlike Telegram, Discord does not deliver plain chat/DM messages over webhooks — that requires an always-on Gateway connection. Slash commands are Discord's official way to trigger server-side automations, and they support input text via the <code className="bg-amber-100 px-1 rounded">message</code> option.
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Application ID</label>
                            <input
                                type="text"
                                value={selectedNode.data.discordAppId || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { discordAppId: e.target.value })}
                                placeholder="e.g. 1123456789012345678"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-[8px] text-slate-400">
                                From the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-semibold">Discord Developer Portal</a> → your application → General Information.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Public Key</label>
                            <input
                                type="text"
                                value={selectedNode.data.discordPublicKey || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { discordPublicKey: e.target.value })}
                                placeholder="Ed25519 public key (hex) from General Information"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-[8px] text-slate-400">Used to verify that incoming interactions were really signed by Discord. Required.</p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Bot Token</label>
                            <input
                                type="password"
                                value={selectedNode.data.discordBotToken || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { discordBotToken: e.target.value })}
                                placeholder="Bot token (only needed to register the command)"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-[8px] text-slate-400">From your application → Bot → Reset Token. Needed once, to register the slash command.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Command Name</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.discordCommandName || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { discordCommandName: e.target.value.toLowerCase() })}
                                    placeholder="run"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Description</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.discordCommandDescription || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { discordCommandDescription: e.target.value })}
                                    placeholder="Trigger a Bloope flow"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Interactions Endpoint URL</label>
                            <div className="flex gap-1.5">
                                <code className="flex-1 bg-slate-100 border border-slate-200 rounded px-2 py-1.5 text-[9px] text-slate-700 break-all select-all">
                                    {`${window.location.origin}/api/webhook/discord?flowId=${flowId || selectedNode.id}`}
                                </code>
                                <button
                                    type="button"
                                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/webhook/discord?flowId=${flowId || selectedNode.id}`)}
                                    className="px-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-[9px] font-semibold text-slate-700"
                                >
                                    Copy
                                </button>
                            </div>
                            <p className="text-[8px] text-slate-400">
                                Paste this into your application → General Information → <strong>Interactions Endpoint URL</strong>. Discord will verify it instantly (the flow must be saved and its webhook enabled first).
                            </p>
                            {window.location.origin.includes('localhost') && (
                                <p className="text-[9px] text-red-500 font-medium">⚠️ Discord requires a public HTTPS endpoint — use your deployed site URL, not localhost.</p>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={!selectedNode.data.discordBotToken || !selectedNode.data.discordAppId || isDiscordWorking}
                                onClick={async () => {
                                    setIsDiscordWorking(true);
                                    setDiscordStatus(null);
                                    try {
                                        const res = await fetch('/api/discord-api', {
                                            method: 'POST',
                                            headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
                                            body: JSON.stringify({
                                                action: 'register_command',
                                                botToken: selectedNode.data.discordBotToken,
                                                appId: selectedNode.data.discordAppId,
                                                commandName: selectedNode.data.discordCommandName || 'run',
                                                commandDescription: selectedNode.data.discordCommandDescription || 'Trigger a Bloope flow',
                                            }),
                                        });
                                        const data = await res.json();
                                        if (res.ok && data.id) {
                                            setDiscordStatus({ kind: 'success', text: `Slash command /${data.name} registered! Global commands can take up to an hour to appear in Discord.` });
                                        } else {
                                            setDiscordStatus({ kind: 'error', text: data.message || data.error || 'Failed to register command' });
                                        }
                                    } catch (err: any) {
                                        setDiscordStatus({ kind: 'error', text: err.message });
                                    } finally {
                                        setIsDiscordWorking(false);
                                    }
                                }}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md py-2 text-xs font-semibold disabled:opacity-50 transition-colors"
                            >
                                {isDiscordWorking ? 'Working...' : 'Register Slash Command'}
                            </button>

                            <button
                                type="button"
                                disabled={!selectedNode.data.discordBotToken || isDiscordWorking}
                                onClick={async () => {
                                    setIsDiscordWorking(true);
                                    setDiscordStatus(null);
                                    try {
                                        const res = await fetch('/api/discord-api', {
                                            method: 'POST',
                                            headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
                                            body: JSON.stringify({ action: 'check_bot', botToken: selectedNode.data.discordBotToken }),
                                        });
                                        const data = await res.json();
                                        if (res.ok && data.username) {
                                            setDiscordStatus({ kind: 'success', text: `Connected as bot: ${data.username}` });
                                        } else {
                                            setDiscordStatus({ kind: 'error', text: data.message || data.error || 'Invalid bot token' });
                                        }
                                    } catch (err: any) {
                                        setDiscordStatus({ kind: 'error', text: err.message });
                                    } finally {
                                        setIsDiscordWorking(false);
                                    }
                                }}
                                className="px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md py-2 text-xs font-semibold text-slate-700 transition-colors"
                            >
                                Check Bot
                            </button>
                        </div>

                        {discordStatus && (
                            <div className={clsx(
                                "p-2.5 rounded-md text-[9px] border",
                                discordStatus.kind === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-600"
                            )}>
                                {discordStatus.text}
                            </div>
                        )}

                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-[9px] text-slate-600 space-y-1">
                            <div className="font-bold text-slate-800">Outputs Available (for downstream nodes):</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                                <li>Command Text: <code>{`{{${selectedNode.id}.text}}`}</code></li>
                                <li>Command Name: <code>{`{{${selectedNode.id}.command}}`}</code></li>
                                <li>All Options: <code>{`{{${selectedNode.id}.options}}`}</code></li>
                                <li>User ID: <code>{`{{${selectedNode.id}.userId}}`}</code></li>
                                <li>Username: <code>{`{{${selectedNode.id}.username}}`}</code></li>
                                <li>Channel ID: <code>{`{{${selectedNode.id}.channelId}}`}</code></li>
                                <li>Server (Guild) ID: <code>{`{{${selectedNode.id}.guildId}}`}</code></li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Discord Send Configuration */}
                {selectedNode.data.type === NodeType.DISCORD_SEND && (
                    <div className="space-y-4">
                        <div className="p-3 bg-indigo-50/50 border border-indigo-200 rounded-lg flex items-start gap-2.5">
                            <Bot className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-slate-600 leading-normal">
                                <span className="font-bold text-slate-900 block mb-0.5">Send Discord Message</span>
                                Posts a message to a Discord channel via an incoming webhook or your bot.
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Delivery Mode</label>
                            <div className="grid grid-cols-2 gap-1.5">
                                {(['webhook', 'bot'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => onUpdateNode(selectedNode.id, { discordSendMode: mode })}
                                        className={clsx(
                                            "py-2 rounded-md text-xs font-semibold border transition-colors",
                                            (selectedNode.data.discordSendMode || 'webhook') === mode
                                                ? "bg-indigo-600 text-white border-indigo-600"
                                                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                        )}
                                    >
                                        {mode === 'webhook' ? 'Incoming Webhook' : 'Bot + Channel'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {(selectedNode.data.discordSendMode || 'webhook') === 'webhook' ? (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Webhook URL</label>
                                <input
                                    type="password"
                                    value={selectedNode.data.discordWebhookUrl || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { discordWebhookUrl: e.target.value })}
                                    placeholder="https://discord.com/api/webhooks/... or {{env.DISCORD_WEBHOOK_URL}}"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                />
                                <p className="text-[8px] text-slate-400">
                                    In Discord: channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy URL. Falls back to the <code>DISCORD_WEBHOOK_URL</code> secret.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Bot Token</label>
                                    <input
                                        type="password"
                                        value={selectedNode.data.discordBotToken || ''}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { discordBotToken: e.target.value })}
                                        placeholder="Bot token (or set DISCORD_BOT_TOKEN secret)"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Channel ID</label>
                                    <input
                                        type="text"
                                        value={selectedNode.data.discordChannelId || ''}
                                        onChange={(e) => onUpdateNode(selectedNode.id, { discordChannelId: e.target.value })}
                                        placeholder="e.g. 1123456789012345678 or {{channelId}}"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[8px] text-slate-400">
                                        Enable Developer Mode in Discord (Settings → Advanced), then right-click a channel → Copy Channel ID. The bot must be in the server with permission to post.
                                    </p>
                                </div>
                            </>
                        )}

                        {(selectedNode.data.discordSendMode || 'webhook') === 'webhook' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Username Override (Optional)</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.discordUsername || ''}
                                    onChange={(e) => onUpdateNode(selectedNode.id, { discordUsername: e.target.value })}
                                    placeholder="e.g. Bloope Bot"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Message Content</label>
                            <textarea
                                value={selectedNode.data.discordMessage || ''}
                                onChange={(e) => onUpdateNode(selectedNode.id, { discordMessage: e.target.value })}
                                rows={4}
                                placeholder="Workflow update: {{result}}"
                                className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-[8px] text-slate-400">Supports {'{{variables}}'} and Discord markdown. Max 2000 characters.</p>
                        </div>
                    </div>
                )}

                {/* JAVASCRIPT/CODE NODE CONFIG */}
                {selectedNode.data.type === NodeType.JAVASCRIPT && (
                    <div className="space-y-4">
                        <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-[10px]">
                            <Code className="w-3.5 h-3.5 inline-block mr-0.5 -mt-0.5" /> <strong>Code Node</strong>: Write JavaScript to transform data. Has access to <code>context</code> and <code>secrets</code>.
                            <br />Returns the last expression or use <code>return</code>.
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">JavaScript Code</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={8}
                                placeholder={`// Example: Transform input data
const input = context.previousNode;
const result = input.toUpperCase();
return result;`}
                                className="w-full bg-slate-900 text-emerald-400 border border-slate-700 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-yellow-500 leading-relaxed"
                                spellCheck={false}
                            />
                            {!content.trim() && (
                                <div className="flex items-center gap-1.5 text-red-500 mt-1">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span className="text-[10px] font-medium">JavaScript code cannot be empty.</span>
                                </div>
                            )}
                        </div>

                        {/* Sandbox Execution Timeout Slider */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Max Execution Time</label>
                                <span className="text-xs text-slate-600 font-medium">{executionTimeout / 1000}s</span>
                            </div>
                            <input
                                type="range"
                                min="1000"
                                max="30000"
                                step="1000"
                                value={executionTimeout}
                                onChange={(e) => setExecutionTimeout(Number(e.target.value))}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                            />
                            <p className="text-[9px] text-slate-400">Abort execution if it takes longer than this limit. Maximum 30 seconds.</p>
                        </div>

                        {/* Sandbox Retry Settings */}
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Max Retry Attempts</label>
                                <span className="text-xs text-slate-600 font-medium">{maxAttempts} times</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="5"
                                step="1"
                                value={maxAttempts}
                                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                            />
                            <p className="text-[9px] text-slate-400">Automatically retry on sandbox or network timeouts.</p>
                        </div>

                        {/* Pre-installed Libraries */}
                        <div className="bg-slate-50 rounded p-3 space-y-2 border border-slate-200">
                            <p className="text-[10px] font-bold text-slate-600 uppercase">Pre-installed npm Libraries</p>
                            <div className="flex flex-wrap gap-1">
                                {['_ (lodash)', 'dayjs', 'cheerio', 'csvParse', 'csvStringify', 'uuid', 'validator'].map((lib) => (
                                    <span key={lib} className="bg-slate-100 border border-slate-200 text-slate-600 rounded px-1.5 py-0.5 text-[9px] font-mono">{lib}</span>
                                ))}
                            </div>
                            <p className="text-[9px] text-slate-400">These libraries are preloaded in the global scope and can be used immediately without imports.</p>
                        </div>

                        <div className="bg-slate-50 rounded p-3 space-y-2 border border-slate-200">
                            <p className="text-[10px] font-bold text-slate-600 uppercase">Available Variables</p>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="bg-white p-2 rounded border border-slate-100">
                                    <code className="text-purple-600">context</code>
                                    <p className="text-slate-500">All node outputs by ID</p>
                                </div>
                                <div className="bg-white p-2 rounded border border-slate-100">
                                    <code className="text-purple-600">secrets</code>
                                    <p className="text-slate-500">Your stored secrets</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded p-3 border border-slate-200">
                            <p className="text-[10px] font-bold text-slate-600 uppercase mb-2">Examples</p>
                            <div className="space-y-1 text-[10px] font-mono text-slate-600">
                                <p><code>return context.input1.split(',');</code></p>
                                <p><code>return {'{ sum: context.a + context.b }'}</code></p>
                                <p><code>return JSON.parse(context.jsonString);</code></p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Simple fallbacks for other node types */}
                {(selectedNode.data.type === NodeType.INPUT || selectedNode.data.type === NodeType.NOTE || selectedNode.data.type === NodeType.WAIT || selectedNode.data.type === NodeType.ROUTER || selectedNode.data.type === NodeType.CONDITION || selectedNode.data.type === NodeType.BATCH || selectedNode.data.type === NodeType.JSON || selectedNode.data.type === NodeType.MATH || selectedNode.data.type === NodeType.TEXT) && (
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Content</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={6}
                            className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-brand-500"
                        />
                    </div>
                )}

                {/* DYNAMIC CONFIG FOR CUSTOM NODES */}
                {customNodeDef && customNodeDef.config_schema && (
                    <div className="space-y-4">
                        <div className="p-3 bg-gradient-to-r from-brand-50 to-purple-50 border border-brand-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-brand-700">{customNodeDef.display_name}</span>
                                <span className="px-1.5 py-0.5 bg-brand-100 text-brand-600 rounded text-[8px] font-bold uppercase">Custom</span>
                            </div>
                            <p className="text-[10px] text-slate-600">{customNodeDef.description}</p>
                        </div>

                        {Object.entries(customNodeDef.config_schema)
                            .sort(([keyA, defA]: [string, any], [keyB, defB]: [string, any]) => {
                                if (keyA === 'capability') return -1;
                                if (keyB === 'capability') return 1;
                                if (keyA === 'variableName') return 1;
                                if (keyB === 'variableName') return -1;
                                const isInfoA = defA.type === 'info';
                                const isInfoB = defB.type === 'info';
                                if (isInfoA && !isInfoB) return -1;
                                if (!isInfoA && isInfoB) return 1;
                                return 0;
                            })
                            .map(([fieldKey, fieldDef]: [string, any]) => {
                            if (fieldDef.dependsOn) {
                                const isMatch = Object.entries(fieldDef.dependsOn).every(([depKey, depValue]) => customConfig[depKey] === depValue);
                                if (!isMatch) return null;
                            }
                            return (
                                <div key={fieldKey} className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                                        {fieldDef.label || fieldKey}
                                        {fieldDef.secret && <Lock className="w-3 h-3 text-amber-500 ml-1 inline-block" />}
                                    </label>

                                    {/* Text Input */}
                                    {(fieldDef.type === 'text') && (
                                        <input
                                            type={fieldDef.secret ? 'password' : 'text'}
                                            value={customConfig[fieldKey] || ''}
                                            onChange={(e) => setCustomConfig(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                                            placeholder={fieldDef.placeholder || ''}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-brand-500"
                                        />
                                    )}

                                    {/* Textarea */}
                                    {fieldDef.type === 'textarea' && (
                                        <textarea
                                            value={customConfig[fieldKey] || ''}
                                            onChange={(e) => setCustomConfig(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                                            rows={4}
                                            placeholder={fieldDef.placeholder || ''}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-brand-500"
                                        />
                                    )}

                                    {/* Number Input */}
                                    {fieldDef.type === 'number' && (
                                        <input
                                            type="number"
                                            value={customConfig[fieldKey] || ''}
                                            onChange={(e) => setCustomConfig(prev => ({ ...prev, [fieldKey]: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500"
                                        />
                                    )}

                                    {/* Select Dropdown */}
                                    {fieldDef.type === 'select' && fieldDef.options && (
                                        <select
                                            value={customConfig[fieldKey] || ''}
                                            onChange={(e) => setCustomConfig(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-brand-500"
                                        >
                                            <option value="">Select {fieldDef.label || fieldKey}</option>
                                            {fieldDef.options.map((opt: string) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    )}

                                    {/* Boolean Toggle */}
                                    {fieldDef.type === 'boolean' && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setCustomConfig(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }))}
                                                className={`w-10 h-5 rounded-full transition-colors relative ${customConfig[fieldKey] ? 'bg-brand-500' : 'bg-slate-300'}`}
                                            >
                                                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${customConfig[fieldKey] ? 'left-5' : 'left-0.5'}`} />
                                            </button>
                                            <span className="text-xs text-slate-600">{customConfig[fieldKey] ? 'Enabled' : 'Disabled'}</span>
                                        </div>
                                    )}

                                    {/* Info text */}
                                    {fieldDef.type === 'info' && (
                                        <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl text-[11px] text-slate-500 leading-normal flex items-start gap-2">
                                            <HelpCircle className="w-3.5 h-3.5 text-brand-500 shrink-0 mt-0.5" />
                                            <span>{fieldDef.placeholder}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

            </div>

            {/* Console Output (Collapsible) */}
            {selectedNode.data.consoleLogs && selectedNode.data.consoleLogs.length > 0 && selectedNode.data.status === NodeStatus.COMPLETED && (
                <div className="border-t border-slate-200 bg-slate-900 text-slate-200">
                    <div className="p-3 border-b border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-slate-500 inline-block" /> Console Output
                        </span>
                    </div>
                    <div className="p-3 bg-slate-950 font-mono text-[11px] text-emerald-400 max-h-40 overflow-y-auto custom-scrollbar">
                        {selectedNode.data.consoleLogs.map((log: string, idx: number) => (
                            <div key={idx} className="py-0.5 border-b border-slate-900 last:border-none flex gap-2">
                                <span className="text-slate-600 select-none">[{idx + 1}]</span>
                                <span className="whitespace-pre-wrap break-all">{log}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Collapsible Execution Result (at bottom) */}
            {selectedNode.data.output !== undefined && selectedNode.data.status === NodeStatus.COMPLETED && (
                <div className="border-t border-slate-200">
                    <button
                        onClick={() => setIsExecutionResultExpanded(!isExecutionResultExpanded)}
                        className="w-full p-3 bg-emerald-50 flex items-center justify-between hover:bg-emerald-100 transition-colors"
                    >
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Execution Result
                        </span>
                        {isExecutionResultExpanded ? (
                            <ChevronUp className="w-4 h-4 text-emerald-600" />
                        ) : (
                            <ChevronDown className="w-4 h-4 text-emerald-600" />
                        )}
                    </button>
                    {isExecutionResultExpanded && (
                        <div className="p-3 bg-white border-t border-emerald-100">
                            {isBase64Audio(selectedNode.data.output) ? (
                                <AudioPlayerResult base64Data={typeof selectedNode.data.output === 'object' ? (selectedNode.data.output.audio_content || selectedNode.data.output.audios?.[0]) : selectedNode.data.output} />
                            ) : (
                                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 max-h-60 overflow-y-auto custom-scrollbar">
                                    <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-all">
                                        {typeof selectedNode.data.output === 'object' ? JSON.stringify(selectedNode.data.output, null, 2) : String(selectedNode.data.output)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3">
                <button
                    onClick={handleSave}
                    className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-2 rounded-md font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-brand-500/20"
                >
                    <Save className="w-4 h-4" /> Save Configuration
                </button>
                <button
                    onClick={() => onDeleteNode(selectedNode.id)}
                    className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 p-2 rounded-md transition-all"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div >
    );
};

export default PropertyPanel;
