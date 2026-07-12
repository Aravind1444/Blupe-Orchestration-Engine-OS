
import React, { memo, useEffect } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Sparkles, Play, Code, StickyNote, FileText, CheckCircle2, XCircle, Loader2, Terminal, Split, Globe, AlertCircle, Radio, Clock, Slack, Mail, Table, Layers, Eye, Hourglass, Rss, Braces, Calculator, Type, GitFork, FormInput, Brain, PauseCircle, Box, Search, Lightbulb, CreditCard, Cpu, Zap, MessageSquare, MessageCircle, Bot, Download, Volume2 } from 'lucide-react';
import { NodeData, NodeStatus, NodeType } from '../types';
import clsx from 'clsx';

const customIconMap: Record<string, any> = {
  Play,
  Sparkles,
  Code,
  StickyNote,
  FileText,
  CheckCircle2,
  Terminal,
  Split,
  Globe,
  Radio,
  Clock,
  Slack,
  Mail,
  Table,
  Layers,
  Eye,
  Hourglass,
  Rss,
  Braces,
  Calculator,
  Type,
  GitFork,
  FormInput,
  Brain,
  PauseCircle,
  Box,
  Search,
  Lightbulb,
  CreditCard,
  Cpu,
};

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
    <div className="mt-3 pt-2 border-t border-slate-100 flex flex-col gap-2 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
          <Volume2 className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> Audio Synthesized
        </div>
        <a
          href={audioUrl}
          download={filename}
          className="text-[10px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors bg-brand-50 px-2 py-0.5 rounded border border-brand-100"
        >
          <Download className="w-3 h-3" /> Download {isWav ? 'WAV' : 'MP3'}
        </a>
      </div>
      <audio controls className="w-full h-8 mt-1 rounded bg-slate-50 border border-slate-100">
        <source src={audioUrl} type={isWav ? 'audio/wav' : 'audio/mpeg'} />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

const StatusIcon = ({ status }: { status?: NodeStatus }) => {
  switch (status) {
    case NodeStatus.RUNNING:
      return <Loader2 className="w-3.5 h-3.5 text-brand-500 animate-spin" />;
    case NodeStatus.WAITING_APPROVAL:
      return <PauseCircle className="w-3.5 h-3.5 text-orange-500 animate-pulse" />;
    case NodeStatus.COMPLETED:
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    case NodeStatus.ERROR:
      return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    default:
      return <div className="w-2 h-2 rounded-full bg-slate-200" />;
  }
};

const BaseNode = ({ data, icon: Icon, colorClass, children, className, isTrigger }: { data: NodeData; icon: any; colorClass: string; children?: React.ReactNode; className?: string, isTrigger?: boolean }) => {
  return (
    <div className={clsx(
      "min-w-[280px] max-w-[320px] relative group transition-all duration-200",
      className
    )}>
      <div className={clsx(
        "rounded-xl border shadow-sm group-hover:shadow-md flex flex-col overflow-hidden bg-white",
        data.status === NodeStatus.RUNNING ? "border-brand-500 shadow-brand-500/20 ring-1 ring-brand-500" :
          data.status === NodeStatus.WAITING_APPROVAL ? "border-orange-500 shadow-orange-500/20 ring-1 ring-orange-500" :
            data.status === NodeStatus.COMPLETED ? "border-emerald-500 shadow-emerald-500/10" :
              data.status === NodeStatus.ERROR ? "border-red-500 shadow-red-500/10" :
                "border-slate-200 group-hover:border-brand-300"
      )}>
        {/* Top Accent Bar */}
        <div className={clsx("w-full h-1 flex-shrink-0", colorClass)} />

        {/* Header */}
        <div className="px-3 py-2.5 flex items-center justify-between bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={clsx("p-1.5 rounded-md bg-white border border-slate-200 -mr-[5px] z-[100] shadow-sm")}>
              <Icon className={clsx("w-3.5 h-3.5", colorClass.replace('bg-', 'text-'))} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 leading-tight">{data.label}</div>
              <div className="text-[8px] text-slate-500 font-mono uppercase tracking-wider">{data.type}</div>
            </div>
          </div>
          <StatusIcon status={data.status} />
        </div>

        {/* Body */}
        <div className="p-3 bg-white flex-grow">
          {children}

          {/* Result Section (Match Design) */}
          {data.output && (
            isBase64Audio(data.output) ? (
              <AudioPlayerResult base64Data={typeof data.output === 'object' ? (data.output.audio_content || data.output.audios?.[0]) : data.output} />
            ) : typeof data.output === 'string' ? (
              <div className="mt-3 pt-2 border-t border-slate-100">
                <div className="mb-1 text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Result</div>
                <div className="text-[10px] text-slate-600 font-mono bg-slate-50 p-2 rounded border border-slate-100 break-words line-clamp-4">
                  {data.output}
                </div>
              </div>
            ) : (
              <div className="mt-3 pt-2 border-t border-slate-100">
                <div className="mb-1 text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Result</div>
                <div className="text-[10px] text-slate-600 font-mono bg-slate-50 p-2 rounded border border-slate-100 break-words line-clamp-4">
                  {JSON.stringify(data.output, null, 2)}
                </div>
              </div>
            )
          )}

          {/* Error Section */}
          {data.error && (
            <div className="mt-2 pt-2 border-t border-red-50 animate-in fade-in duration-300">
              <div className="flex items-center gap-1 mb-1 text-red-500">
                <AlertCircle className="w-3 h-3" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Error</span>
              </div>
              <div className="text-[10px] text-red-600 font-mono bg-red-50 p-1.5 rounded border border-red-100 break-words">
                {data.error}
              </div>
            </div>
          )}
        </div>
      </div>

      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-brand-500 transition-colors shadow-sm -ml-[5px] z-[100]"
        />
      )}
    </div>
  );
};

// ... (StartNode etc remain same, just inheriting BaseNode changes) ...

export const OutputNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Terminal} colorClass="bg-emerald-500">
    <div className="flex flex-col items-center justify-center py-2 text-center space-y-2 text-slate-400">
      <div className="p-2 bg-emerald-50 rounded-full border border-emerald-100">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 opacity-50" />
      </div>
      <span className="text-[10px] font-medium">Final Output</span>
    </div>
  </BaseNode>
));

export const StartNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Play} colorClass="bg-pink-500" isTrigger>
    <div className="text-[10px] text-slate-500">Initiates the workflow chain</div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-pink-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const FormTriggerNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={FormInput} colorClass="bg-blue-600" isTrigger>
    <div className="text-[10px] text-slate-500 mb-2">{data.formTitle || 'Public Form'}</div>
    <div className="space-y-1">
      {(data.formFields || []).map(field => (
        <div key={field.id} className="flex items-center justify-between text-[10px] bg-slate-50 px-2 py-1 rounded border border-slate-100">
          <span className="text-slate-700 font-medium truncate max-w-[120px]">{field.label}</span>
          <span className="text-slate-400 font-mono text-[9px]">{'{' + field.variableName + '}'}</span>
        </div>
      ))}
      {(data.formFields || []).length === 0 && <span className="text-[10px] text-slate-400 italic">No fields configured</span>}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-blue-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const WebhookNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Radio} colorClass="bg-orange-500" isTrigger>
    <div className="text-[10px] text-slate-500 mb-1">Triggers on HTTP request</div>
    <div className="text-[9px] font-mono bg-slate-50 p-1.5 rounded text-orange-600 truncate border border-orange-100 shadow-sm">
      POST /api/webhook/{'<flowId>'}
    </div>
    {data.variableName && (
      <div className="mt-1 text-[9px] text-slate-400">
        Payload: <span className="font-mono text-emerald-600">{'{{'}{data.variableName}{'}}'}</span>
      </div>
    )}
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-orange-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const ScheduleNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Clock} colorClass="bg-violet-500" isTrigger>
    <div className="flex items-center gap-2 mb-1">
      {data.scheduleActive && (
        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          ACTIVE
        </span>
      )}
      {!data.scheduleActive && (
        <span className="text-[10px] text-slate-500">Runs on schedule</span>
      )}
    </div>
    <div className="text-[9px] font-mono bg-slate-50 p-1.5 rounded text-violet-600 border border-violet-100 -mr-[5px] z-[100] shadow-sm">
      {data.cronExpression || '0 9 * * *'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-violet-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));



export const LLMNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Brain} colorClass="bg-indigo-600">
    <div className="mb-2 flex items-center justify-between">
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono font-bold uppercase">
        {data.model || 'gemini-3.1-flash-lite-preview'}
      </span>
    </div>
    <div className="text-[10px] text-slate-600 line-clamp-2 font-medium bg-slate-50 p-1.5 rounded border border-slate-100">
      {data.content || "Prompt..."}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-indigo-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const ReasoningNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Lightbulb} colorClass="bg-amber-500">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold uppercase">
        {data.thinkingStyle || 'chain-of-thought'}
      </span>
    </div>
    <div className="text-[10px] text-slate-600 line-clamp-2 font-medium bg-amber-50 p-1.5 rounded border border-amber-100">
      {data.reasoningGoal || data.content || "Set reasoning goal..."}
    </div>
    {data.output?.thinking && (
      <div className="mt-2 text-[9px] text-amber-600 bg-amber-50/50 p-1 rounded border border-amber-100 line-clamp-2">
        Thinking: {data.output.thinking.substring(0, 100)}...
      </div>
    )}
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-amber-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const AgentNode = memo(({ data }: NodeProps<NodeData>) => {
  // Agent has access to ALL tools by default (15 tools in registry incl. synthesize_report)
  const toolCount = data.agentTools?.length || 15; // Full tool registry count
  const maxIterations = data.agentMaxIterations || 30;
  const currentIteration = data.agentState?.iteration || 0;
  const agentStatus = data.agentState?.status;
  // Only show progress when actually running (not stale status)
  const isActuallyRunning = data.status === 'running' && currentIteration > 0;

  return (
    <BaseNode data={data} icon={Cpu} colorClass="bg-violet-600">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200 font-bold uppercase">
          ReAct Agent
        </span>
        {agentStatus && agentStatus !== 'running' && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${agentStatus === 'completed' ? 'bg-emerald-100 text-emerald-700' :
            agentStatus === 'max_iterations' ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
            {agentStatus === 'completed' ? '✓ Done' : agentStatus === 'max_iterations' ? 'Max Iter' : 'Failed'}
          </span>
        )}
      </div>
      <div className="text-[10px] text-slate-600 line-clamp-2 font-medium bg-violet-50 p-1.5 rounded border border-violet-100">
        {data.agentGoal || data.content || "Set agent goal..."}
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px]">
        <div className="flex items-center gap-1 text-slate-500">
          <span className="font-bold">{toolCount === 15 ? 'All' : toolCount}</span> tools
        </div>
        <div className="text-slate-500">
          Max: <span className="font-bold">{maxIterations}</span> iterations
        </div>
      </div>
      {isActuallyRunning && (
        <div className="mt-2 pt-2 border-t border-violet-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-violet-600 font-bold uppercase">Progress</span>
            <span className="text-[9px] text-violet-700">{currentIteration}/{maxIterations}</span>
          </div>
          <div className="h-1.5 bg-violet-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all duration-300"
              style={{ width: `${Math.min((currentIteration / maxIterations) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
      {data.output?.answer && (
        <div className="mt-2 text-[9px] text-violet-600 bg-violet-50/50 p-1 rounded border border-violet-100 line-clamp-2">
          Answer: {String(data.output.answer).substring(0, 100)}...
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-violet-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
    </BaseNode>
  );
});

export const ApprovalNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={PauseCircle} colorClass="bg-rose-500">
    <div className="text-[10px] text-slate-500 mb-2">Pauses for human review</div>
    <div className="text-[10px] text-slate-800 font-medium bg-rose-50 p-2 rounded border border-rose-100">
      {data.approvalMessage || "Please approve..."}
    </div>
    {data.webhookUrl && (
      <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-rose-50 border border-rose-100 rounded text-[9px] text-rose-600 font-medium">
        <Radio className="w-3 h-3" />
        <span className="truncate">Webhook Active</span>
      </div>
    )}
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-rose-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const MCPNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Box} colorClass="bg-slate-700">
    <div className="text-[10px] text-slate-500 mb-1">MCP Tool Call</div>
    <div className="text-[10px] font-mono text-slate-600">
      Server: {data.url || 'localhost'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-slate-700 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const WebSearchNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Search} colorClass="bg-sky-600">
    <div className="text-[10px] text-slate-500 mb-1">Tavily Web Search</div>
    <div className="text-[10px] font-medium text-slate-800 bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-2">
      {data.webQuery || 'Search query...'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-sky-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const DeepResearchNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Search} colorClass="bg-amber-500">
    <div className="text-[10px] text-slate-500 mb-1">Deep Research (35 credits)</div>
    <div className="text-[10px] font-medium text-slate-800 bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-2">
      {data.researchTopic || 'Research topic...'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-amber-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const ExtractUrlNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={FileText} colorClass="bg-emerald-500">
    <div className="text-[10px] text-slate-500 mb-1">Extract URL (10 credits)</div>
    <div className="text-[10px] font-medium text-slate-800 bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-2">
      {data.extractUrl || 'https://...'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-emerald-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const CrawlSiteNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Globe} colorClass="bg-indigo-500">
    <div className="text-[10px] text-slate-500 mb-1">Crawl Site (25 credits)</div>
    <div className="text-[10px] font-medium text-slate-800 bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-2">
      {data.crawlUrl || 'https://...'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const WaitNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Hourglass} colorClass="bg-blue-500">
    <div className="text-[10px] text-slate-500">Delays execution</div>
    <div className="mt-1 text-xs font-mono text-blue-600 font-bold">
      {data.waitTimeMs || 1000}ms
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-blue-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const RSSNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Rss} colorClass="bg-orange-500">
    <div className="text-[10px] text-slate-500 mb-1">Reads RSS Feed</div>
    <div className="text-[10px] text-slate-600 truncate font-mono bg-slate-50 p-1 rounded border border-slate-100">
      {data.url || 'https://...'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-orange-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const JSONNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Braces} colorClass="bg-yellow-600">
    <div className="text-[10px] text-slate-500 mb-1">
      {data.jsonOperation === 'pick' ? 'Pick Key' : data.jsonOperation === 'stringify' ? 'Stringify' : 'Parse JSON'}
    </div>
    {data.jsonOperation === 'pick' && (
      <div className="text-xs font-mono text-yellow-700 bg-yellow-50 p-1 rounded border border-yellow-100">
        {data.jsonKey || 'key.path'}
      </div>
    )}
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-yellow-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const MathNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Calculator} colorClass="bg-teal-500">
    <div className="text-[10px] text-slate-500">Calculate</div>
    <div className="text-xs font-mono text-teal-600 mt-1 bg-teal-50 p-1 rounded border border-teal-100">
      {data.mathExpression || 'x + y'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-teal-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const TextNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Type} colorClass="bg-sky-500">
    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{data.textOperation || 'trim'}</div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-sky-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const RouterNode = memo(({ data }: NodeProps<NodeData>) => (
  <div className={clsx(
    "min-w-[260px] max-w-[300px] bg-white rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md group relative overflow-hidden",
    data.status === NodeStatus.RUNNING ? "border-cyan-500 shadow-cyan-500/20 ring-1 ring-cyan-500" :
      data.status === NodeStatus.COMPLETED ? "border-emerald-500 shadow-emerald-500/10" :
        data.status === NodeStatus.ERROR ? "border-red-500 shadow-red-500/10" :
          "border-slate-200"
  )}>
    <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500" />
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <GitFork className="w-4 h-4 text-cyan-600" />
          <span className="text-xs font-bold text-slate-800">Router</span>
        </div>
        <StatusIcon status={data.status} />
      </div>
      <div className="text-[10px] text-slate-500">Routes based on value</div>
    </div>

    <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 -ml-[5px]" />

    <div className="relative flex flex-col justify-center gap-2 pr-0 bg-slate-50 border-t border-slate-100 py-2">
      <div className="relative flex items-center justify-end w-full pr-3">
        <span className="mr-2 text-[9px] font-bold text-slate-400 uppercase">Route A</span>
        <Handle type="source" position={Position.Right} id="A" className="!relative !transform-none !w-2.5 !h-2.5 !bg-white !border-2 !border-cyan-500 hover:!bg-cyan-500" />
      </div>
      <div className="relative flex items-center justify-end w-full pr-3">
        <span className="mr-2 text-[9px] font-bold text-slate-400 uppercase">Route B</span>
        <Handle type="source" position={Position.Right} id="B" className="!relative !transform-none !w-2.5 !h-2.5 !bg-white !border-2 !border-cyan-500 hover:!bg-cyan-500" />
      </div>
      <div className="relative flex items-center justify-end w-full pr-3">
        <span className="mr-2 text-[9px] font-bold text-slate-400 uppercase">Default</span>
        <Handle type="source" position={Position.Right} id="default" className="!relative !transform-none !w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300" />
      </div>
    </div>
  </div>
));

export const BatchNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Layers} colorClass="bg-fuchsia-500">
    <div className="space-y-2">
      <div className="text-[10px] text-slate-500">Iterates over list:</div>
      <div className="text-xs font-mono text-fuchsia-600 bg-fuchsia-50 p-1 rounded border border-fuchsia-100">
        {data.batchInputVariable ? `{{${data.batchInputVariable}}}` : 'Select variable'}
      </div>
      <div className="text-[10px] text-slate-500">Runs prompt for each item</div>
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-fuchsia-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const VisionNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Eye} colorClass="bg-indigo-500">
    <div className="text-[10px] text-slate-500 mb-2 font-medium tracking-tight">Vision Analysis</div>
    
    {data.imageUrl ? (
      <div className="p-1.5 bg-indigo-50 rounded border border-indigo-100 mb-2">
        <div className="flex items-center gap-1.5 text-[9px] text-indigo-600 font-mono truncate">
          <Globe className="w-2.5 h-2.5" />
          {data.imageUrl}
        </div>
      </div>
    ) : (
      <div className="text-[10px] text-slate-400 italic mb-2">No image URL set</div>
    )}
    
    <div className="text-[10px] text-slate-800 font-medium bg-slate-50 p-2 rounded border border-slate-100 line-clamp-2">
      {data.content || "Set prompt..."}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const ConditionNode = memo(({ data }: NodeProps<NodeData>) => (
  <div className={clsx(
    "min-w-[260px] max-w-[300px] bg-white rounded-xl border transition-all duration-200 shadow-sm hover:shadow-md group relative overflow-hidden",
    data.status === NodeStatus.RUNNING ? "border-orange-500 shadow-orange-500/20 ring-1 ring-orange-500" :
      data.status === NodeStatus.COMPLETED ? "border-emerald-500 shadow-emerald-500/10" :
        data.status === NodeStatus.ERROR ? "border-red-500 shadow-red-500/10" :
          "border-slate-200"
  )}>
    <div className="absolute top-0 left-0 w-full h-1 bg-orange-500" />
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Split className="w-4 h-4 text-orange-500" />
          <span className="text-xs font-bold text-slate-800">Condition</span>
        </div>
        <StatusIcon status={data.status} />
      </div>
      <div className="text-[10px] font-mono text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-200 truncate">
        {data.condition || "if (true)"}
      </div>
    </div>

    {/* Handles */}
    <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 -ml-[5px]" />

    <div className="relative mt-1 bg-slate-50 border-t border-slate-100 py-2">
      <div className="flex flex-col gap-2">
        <div className="relative flex items-center justify-end pr-3">
          <span className="mr-2 text-[9px] font-bold text-emerald-600 uppercase">True</span>
          <Handle type="source" position={Position.Right} id="true" className="!relative !transform-none !w-2.5 !h-2.5 !bg-white !border-2 !border-emerald-500 hover:!bg-emerald-500" />
        </div>
        <div className="relative flex items-center justify-end pr-3">
          <span className="mr-2 text-[9px] font-bold text-red-600 uppercase">False</span>
          <Handle type="source" position={Position.Right} id="false" className="!relative !transform-none !w-2.5 !h-2.5 !bg-white !border-2 !border-red-500 hover:!bg-red-500" />
        </div>
      </div>
    </div>
  </div>
));

export const APINode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Globe} colorClass="bg-cyan-500">
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[9px] font-bold text-slate-700 bg-slate-200 px-1 rounded">{data.method || 'GET'}</span>
      <span className="text-[10px] text-slate-600 truncate font-mono flex-1">{data.url || 'https://api...'}</span>
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-cyan-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const SlackNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Slack} colorClass="bg-[#E01E5A]">
    <div className="text-[10px] text-slate-500 mb-1">Send Message</div>
    <div className="text-xs font-medium text-slate-800">
      {data.slackChannel || '#general'}
    </div>
    {data.slackBody && (
      <div className="mt-2 text-[9px] text-slate-400 flex items-center gap-1">
        <Code className="w-3 h-3" /> Custom Schema Active
      </div>
    )}
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-[#E01E5A] transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const EmailNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Mail} colorClass="bg-slate-500">
    <div className="text-[10px] text-slate-500 mb-1">
      {data.emailProvider === 'microsoft' ? 'Outlook Email' : 'SMTP Email'}
    </div>
    <div className="text-xs font-medium text-slate-800 truncate">
      {data.emailTo || 'recipient@...'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-slate-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const SheetsNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Table} colorClass="bg-green-600">
    <div className="text-[10px] text-slate-500 mb-1">
      {data.sheetProvider === 'microsoft' ? 'Excel Connector' : 'Google Sheets'}
    </div>
    <div className="text-xs font-medium text-slate-800 truncate">
      {data.sheetId ? 'Sheet Configured' : 'Select Sheet'}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-green-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const HubSpotNode = memo(({ data }: NodeProps<NodeData>) => {
  const operationLabels: Record<string, string> = {
    'create_contact': 'Create Contact',
    'update_contact': 'Update Contact',
    'get_contact': 'Get Contact',
    'search_contacts': 'Search Contacts',
    'create_deal': 'Create Deal',
    'get_deal': 'Get Deal',
  };

  return (
    <BaseNode data={data} icon={Globe} colorClass="bg-[#ff7a59]">
      <div className="text-[10px] text-slate-500 mb-1">
        {operationLabels[data.hubspotOperation || 'create_contact'] || 'HubSpot CRM'}
      </div>
      {data.hubspotEmail && (
        <div className="text-xs font-medium text-slate-800 truncate bg-orange-50 px-2 py-1 rounded border border-orange-100">
          {data.hubspotEmail}
        </div>
      )}
      {!data.hubspotEmail && !data.hubspotContactId && (
        <div className="text-[10px] text-slate-400 italic">Configure in panel</div>
      )}
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-[#ff7a59] transition-colors -mr-[5px] z-[100] shadow-sm" />
    </BaseNode>
  );
});

export const JavascriptNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Code} colorClass="bg-yellow-500">
    <div className="text-[10px] text-slate-500 font-mono">Executes custom JS code</div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-yellow-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const InputNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={FileText} colorClass="bg-purple-500">
    <div className="text-[10px] text-slate-600 p-2 bg-slate-50 rounded border border-slate-100 truncate font-mono">
      {data.content ? `"${data.content}"` : "Empty string"}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-purple-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));



export const NoteNode = memo(({ data }: NodeProps<NodeData>) => (
  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-w-[200px] shadow-sm rotate-1 hover:rotate-0 transition-transform">
    <div className="flex items-center gap-1.5 mb-1 text-yellow-700">
      <StickyNote className="w-3 h-3" />
      <span className="text-[9px] font-bold uppercase tracking-wider">Note</span>
    </div>
    <p className="text-xs text-yellow-900 whitespace-pre-wrap leading-relaxed font-sans">{data.content || "Write something..."}</p>
  </div>
));

// Dynamic Node for custom/admin-created nodes
export const DynamicNode = memo(({ data }: NodeProps<NodeData>) => {
  const nodeColor = data.customColor || data.customConfig?.nodeColor || '#6366f1';
  const Icon = (data.customIcon && customIconMap[data.customIcon]) || Box;

  return (
    <div className="min-w-[280px] max-w-[320px] relative group transition-all duration-200">
      <div className={clsx(
        "rounded-xl border shadow-sm group-hover:shadow-md flex flex-col overflow-hidden bg-white",
        data.status === NodeStatus.RUNNING ? "border-brand-500 shadow-brand-500/20 ring-1 ring-brand-500" :
          data.status === NodeStatus.COMPLETED ? "border-emerald-500 shadow-emerald-500/10" :
            data.status === NodeStatus.ERROR ? "border-red-500 shadow-red-500/10" :
              "border-slate-200 group-hover:border-brand-300"
      )}>
        {/* Top Accent Bar */}
        <div className="w-full h-1 flex-shrink-0" style={{ backgroundColor: nodeColor }} />

        {/* Header */}
        <div className="px-3 py-2.5 flex items-center justify-between bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-white border border-slate-200 shadow-sm">
              <Icon className="w-3.5 h-3.5" style={{ color: nodeColor }} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-800 leading-tight">{data.customDisplayName || data.label}</span>
              </div>
              <div className="text-[8px] text-slate-500 font-mono uppercase tracking-wider">{data.type}</div>
            </div>
          </div>
          <StatusIcon status={data.status} />
        </div>

        {/* Body */}
        <div className="p-3 bg-white flex-grow">
          <div className="text-[10px] text-slate-500">
            {data.customConfig?.operation || data.content || 'Configure this node'}
          </div>

          {/* Show key config values */}
          {data.customConfig && Object.keys(data.customConfig).length > 0 && (
            <div className="mt-2 space-y-1">
              {Object.entries(data.customConfig).slice(0, 3).map(([key, val]) => (
                val && key !== 'variableName' && key !== 'nodeColor' && (
                  <div key={key} className="flex items-center justify-between text-[9px] bg-slate-50 px-2 py-1 rounded border border-slate-100">
                    <span className="text-slate-400 uppercase">{key}</span>
                    <span className="text-slate-700 font-mono truncate max-w-[120px]">
                      {typeof val === 'string' ? (val.length > 15 ? val.substring(0, 15) + '...' : val) : String(val)}
                    </span>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Result Section */}
          {data.output && (
            isBase64Audio(data.output) ? (
              <AudioPlayerResult base64Data={typeof data.output === 'object' ? (data.output.audio_content || data.output.audios?.[0]) : data.output} />
            ) : typeof data.output === 'string' ? (
              <div className="mt-3 pt-2 border-t border-slate-100">
                <div className="mb-1 text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Result</div>
                <div className="text-[10px] text-slate-600 font-mono bg-slate-50 p-2 rounded border border-slate-100 break-words line-clamp-4">
                  {data.output}
                </div>
              </div>
            ) : (
              <div className="mt-3 pt-2 border-t border-slate-100">
                <div className="mb-1 text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Result</div>
                <div className="text-[10px] text-slate-600 font-mono bg-slate-50 p-2 rounded border border-slate-100 break-words line-clamp-4">
                  {JSON.stringify(data.output, null, 2)}
                </div>
              </div>
            )
          )}

          {/* Error Section */}
          {data.error && (
            <div className="mt-2 pt-2 border-t border-red-50 animate-in fade-in duration-300">
              <div className="flex items-center gap-1 mb-1 text-red-500">
                <AlertCircle className="w-3 h-3" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Error</span>
              </div>
              <div className="text-[10px] text-red-600 font-mono bg-red-50 p-1.5 rounded border border-red-100 break-words">
                {data.error}
              </div>
            </div>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-brand-500 transition-colors shadow-sm -ml-[5px] z-[100]"
      />
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-brand-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
    </div>
  );
});

export const WhatsAppTriggerNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={MessageSquare} colorClass="bg-emerald-600" isTrigger>
    <div className="space-y-1">
      <div className="text-[10px] text-slate-500">Triggers on WhatsApp Inbound Message</div>
      {data.whatsappPhoneNumberId && (
        <div className="text-[9px] font-mono bg-slate-50 p-1 rounded border border-emerald-100 text-emerald-800 truncate">
          Phone ID: {data.whatsappPhoneNumberId}
        </div>
      )}
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-emerald-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const WhatsAppSendNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={MessageSquare} colorClass="bg-emerald-600">
    <div className="space-y-1">
      <div className="text-[10px] text-slate-500">Send WhatsApp Message</div>
      <div className="text-xs font-semibold text-slate-800 truncate">
        To: {data.whatsappPhone || 'Not set'}
      </div>
      <div className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-550 text-emerald-700 border border-emerald-100 font-bold uppercase inline-block">
        {data.whatsappMessageType || 'Text'}
      </div>
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-emerald-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const RazorpayTriggerNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={CreditCard} colorClass="bg-blue-600" isTrigger>
    <div className="space-y-1">
      <div className="text-[10px] text-slate-500">Triggers on Razorpay Event</div>
      <div className="text-[9px] font-mono bg-blue-50 p-1.5 rounded text-blue-700 border border-blue-100 uppercase font-bold truncate">
        {data.razorpayEvent || 'payment.captured'}
      </div>
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-blue-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const RazorpayActionNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={CreditCard} colorClass="bg-blue-600">
    <div className="space-y-1">
      <div className="text-[10px] text-slate-500">Razorpay Action</div>
      <div className="text-xs font-semibold text-slate-800 truncate">
        {data.razorpayOperation || 'Create Payment Link'}
      </div>
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-blue-600 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const TelegramTriggerNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={MessageCircle} colorClass="bg-sky-500" isTrigger>
    <div className="space-y-1">
      <div className="text-[10px] text-slate-500">Triggers on Telegram Message</div>
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-sky-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const TelegramSendNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={MessageCircle} colorClass="bg-sky-500">
    <div className="space-y-1">
      <div className="text-[10px] text-slate-500">Send Telegram Message</div>
      <div className="text-xs font-semibold text-slate-800 truncate">
        Chat: {data.telegramChatId || 'Not set'}
      </div>
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-sky-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const DiscordTriggerNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Bot} colorClass="bg-[#5865F2]" isTrigger>
    <div className="space-y-1">
      <div className="text-[10px] text-slate-500">Triggers on Discord Slash Command</div>
      <div className="text-[9px] font-mono bg-indigo-50 p-1.5 rounded text-indigo-700 border border-indigo-100 font-bold truncate">
        /{(data.discordCommandName || 'run').replace(/^\//, '')}
      </div>
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const DiscordSendNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Bot} colorClass="bg-[#5865F2]">
    <div className="space-y-1">
      <div className="text-[10px] text-slate-500">Send Discord Message</div>
      <div className="text-xs font-semibold text-slate-800 truncate">
        {(data.discordSendMode || 'webhook') === 'webhook'
          ? (data.discordWebhookUrl ? 'Via Incoming Webhook' : 'Webhook not set')
          : `Channel: ${data.discordChannelId || 'Not set'}`}
      </div>
    </div>
    <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-white !border-2 !border-slate-300 hover:!border-indigo-500 transition-colors -mr-[5px] z-[100] shadow-sm" />
  </BaseNode>
));

export const StripeNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={CreditCard} colorClass="bg-indigo-600">
    <div className="space-y-2">
      <div className="text-[10px] text-slate-500 font-medium bg-slate-50 p-1.5 rounded border border-slate-100 flex items-center gap-1.5">
        <CreditCard className="w-3 h-3 text-indigo-500" />
        {data.method === 'POST' ? 'Charge Customer' : data.method === 'GET' ? 'Get Customer' : 'Stripe Operation'}
      </div>
      {data.variableName && (
        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
          <Terminal className="w-3 h-3" />
          <span>Output: {data.variableName}</span>
        </div>
      )}
    </div>
  </BaseNode>
));

export const ZapierWebhookNode = memo(({ data }: NodeProps<NodeData>) => (
  <BaseNode data={data} icon={Zap} colorClass="bg-[#FF4F00]">
    <div className="space-y-2">
      <div className="text-[10px] text-slate-500 font-medium bg-slate-50 p-1.5 rounded border border-slate-100 flex items-center gap-1.5">
        <Zap className="w-3 h-3 text-[#FF4F00]" />
        {data.operation || 'Trigger Zap (POST)'}
      </div>
      {data.webhookUrl && (
        <div className="text-[10px] text-slate-600 truncate font-mono bg-slate-50 p-1.5 rounded border border-slate-100">
          {data.webhookUrl}
        </div>
      )}
    </div>
  </BaseNode>
));

export const nodeTypes = {
  [NodeType.START]: StartNode,
  [NodeType.FORM_TRIGGER]: FormTriggerNode,
  [NodeType.WEBHOOK]: WebhookNode,
  [NodeType.SCHEDULE]: ScheduleNode,

  [NodeType.LLM]: LLMNode,
  [NodeType.REASONING]: ReasoningNode,
  [NodeType.AGENT]: AgentNode,
  [NodeType.AI_VISION]: VisionNode,
  [NodeType.BATCH]: BatchNode,
  [NodeType.CONDITION]: ConditionNode,
  [NodeType.ROUTER]: RouterNode,
  [NodeType.WAIT]: WaitNode,
  [NodeType.APPROVAL]: ApprovalNode,
  [NodeType.RSS]: RSSNode,
  [NodeType.JSON]: JSONNode,
  [NodeType.MATH]: MathNode,
  [NodeType.TEXT]: TextNode,
  [NodeType.API_CALL]: APINode,
  [NodeType.SLACK]: SlackNode,
  [NodeType.EMAIL]: EmailNode,
  [NodeType.SHEETS]: SheetsNode,
  [NodeType.HUBSPOT]: HubSpotNode,
  [NodeType.STRIPE]: StripeNode,
  [NodeType.ZAPIER_WEBHOOK]: ZapierWebhookNode,
  [NodeType.WHATSAPP_TRIGGER]: WhatsAppTriggerNode,
  [NodeType.WHATSAPP_SEND]: WhatsAppSendNode,
  [NodeType.RAZORPAY_TRIGGER]: RazorpayTriggerNode,
  [NodeType.RAZORPAY_ACTION]: RazorpayActionNode,
  [NodeType.TELEGRAM_TRIGGER]: TelegramTriggerNode,
  [NodeType.TELEGRAM_SEND]: TelegramSendNode,
  [NodeType.DISCORD_TRIGGER]: DiscordTriggerNode,
  [NodeType.DISCORD_SEND]: DiscordSendNode,
  [NodeType.JAVASCRIPT]: JavascriptNode,
  [NodeType.INPUT]: InputNode,
  [NodeType.NOTE]: NoteNode,
  [NodeType.OUTPUT]: OutputNode,
  [NodeType.MCP]: MCPNode,
  [NodeType.WEB_SEARCH]: WebSearchNode,
  [NodeType.DEEP_RESEARCH]: DeepResearchNode,
  [NodeType.EXTRACT_URL]: ExtractUrlNode,
  [NodeType.CRAWL_SITE]: CrawlSiteNode,
  // Default fallback for custom/dynamic nodes
  'default': DynamicNode,
};
