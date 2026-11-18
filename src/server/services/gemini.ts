import { type FunctionDeclaration, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { extractJsonSafely, normalizeSeverity } from '../../domain/agents.ts';
import { redactSecrets, sanitizeProjectPath } from '../../domain/diff.ts';
import type {
  AgentRole,
  FindingSeverity,
  GroundingCitation,
  PlanStep,
  ThinkingLevelName,
} from '../../domain/types.ts';

export interface ProjectFileContext {
  path: string;
  language: string;
  content: string;
}

export interface AgentChatInput {
  agentRole: AgentRole;
  modelId: string;
  thinkingLevel: ThinkingLevelName;
  searchGrounding: boolean;
  userPrompt: string;
  activeFilePath?: string;
  files: ProjectFileContext[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AgentChatOutput {
  replyText: string;
  modelId: string;
  thinkingSummary?: string;
  citations: GroundingCitation[];
  planSteps: PlanStep[];
  proposedChanges: Array<{
    path: string;
    action: 'create' | 'update' | 'delete';
    proposedContent?: string;
    rationale: string;
  }>;
  promptTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface CodeReviewOutput {
  summary: string;
  overallStatus: 'clean' | 'warnings' | 'critical';
  findings: Array<{
    filePath: string;
    lineStart: number;
    lineEnd: number;
    severity: FindingSeverity;
    category: string;
    title: string;
    description: string;
    suggestedPatch: string | null;
  }>;
  promptTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface AiProvider {
  readonly providerName: string;
  runAgentTurn(input: AgentChatInput): Promise<AgentChatOutput>;
  runQuickExplain(modelId: string, filePath: string, snippet: string): Promise<{
    explanation: string;
    promptTokens: number;
    outputTokens: number;
    latencyMs: number;
  }>;
  runCodeReview(
    modelId: string,
    thinkingLevel: ThinkingLevelName,
    files: ProjectFileContext[],
    targetPath?: string
  ): Promise<CodeReviewOutput>;
}

function toSdkThinkingLevel(level: ThinkingLevelName, modelId: string): ThinkingLevel | undefined {
  if (modelId === 'gemini-3.1-flash-lite') {
    return level === 'MINIMAL' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW;
  }
  switch (level) {
    case 'XHIGH':
      return modelId === 'gemini-4-hydrogen' ? ThinkingLevel.XHIGH : ThinkingLevel.HIGH;
    case 'HIGH':
      return ThinkingLevel.HIGH;
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'MINIMAL':
      return ThinkingLevel.LOW;
    default:
      return ThinkingLevel.MEDIUM;
  }
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add your key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapGeminiError(err: unknown, modelId: string): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return new Error(
      `Gemini API authentication failed for model "${modelId}". Check GEMINI_API_KEY in Settings > Secrets.`
    );
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return new Error(
      `Quota exceeded for model "${modelId}". Switch to gemini-4-hydrogen / gemini-3.1-flash-lite in Settings > AI Models or attach a billing-enabled key in Settings > Secrets.`
    );
  }
  if (msg.includes('404') || msg.includes('NOT_FOUND')) {
    return new Error(`Model "${modelId}" is unavailable or unsupported.`);
  }
  return new Error(redactSecrets(msg));
}

const readProjectFileDecl: FunctionDeclaration = {
  name: 'readProjectFile',
  description: 'Read the full source content of a single file in the active project workspace.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      path: {
        type: Type.STRING,
        description: 'Relative file path within the workspace (e.g. src/App.tsx).',
      },
    },
    required: ['path'],
  },
};

const listProjectFilesDecl: FunctionDeclaration = {
  name: 'listProjectFiles',
  description: 'List all file paths and byte sizes currently in the project workspace.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prefix: {
        type: Type.STRING,
        description: 'Optional folder prefix filter (e.g. src/).',
      },
    },
  },
};

const searchProjectCodeDecl: FunctionDeclaration = {
  name: 'searchProjectCode',
  description: 'Search workspace files for a case-insensitive substring match and return matching lines.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Substring or symbol name to search for.',
      },
    },
    required: ['query'],
  },
};

function executeReadOnlyTool(
  name: string,
  args: Record<string, unknown>,
  files: ProjectFileContext[]
): Record<string, unknown> {
  if (name === 'listProjectFiles') {
    const prefix = typeof args.prefix === 'string' ? args.prefix.trim() : '';
    const filtered = prefix ? files.filter((f) => f.path.startsWith(prefix)) : files;
    return {
      files: filtered.map((f) => ({
        path: f.path,
        language: f.language,
        bytes: Buffer.byteLength(f.content, 'utf8'),
      })),
    };
  }

  if (name === 'readProjectFile') {
    const rawPath = String(args.path || '');
    try {
      const safePath = sanitizeProjectPath(rawPath);
      const found = files.find((f) => f.path === safePath);
      if (!found) return { error: `File not found: ${safePath}` };
      return { path: found.path, language: found.language, content: found.content };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid path' };
    }
  }

  if (name === 'searchProjectCode') {
    const query = String(args.query || '').trim().toLowerCase();
    if (!query) return { matches: [] };
    const matches: Array<{ path: string; line: number; text: string }> = [];
    for (const file of files) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query)) {
          matches.push({ path: file.path, line: i + 1, text: lines[i].slice(0, 160) });
          if (matches.length >= 25) break;
        }
      }
      if (matches.length >= 25) break;
    }
    return { matches };
  }

  return { error: `Unknown tool: ${name}` };
}

export class GeminiAiProvider implements AiProvider {
  readonly providerName = 'gemini';

  async runAgentTurn(input: AgentChatInput): Promise<AgentChatOutput> {
    const start = Date.now();
    const ai = getClient();
    const sdkThinking = toSdkThinkingLevel(input.thinkingLevel, input.modelId);

    const fileIndexText = input.files
      .map((f) => `- ${f.path} (${f.language}, ${f.content.split('\n').length} lines)`)
      .join('\n');

    const activeFileObj = input.activeFilePath
      ? input.files.find((f) => f.path === input.activeFilePath)
      : undefined;

    const systemInstruction = [
      `You are the ${input.agentRole.toUpperCase()} agent inside Advanced Coding Studio (ACS).`,
      'SECURITY & EDITING SAFETY INVARIANT: You MUST NEVER claim you directly wrote to disk. All file modifications MUST be proposed cleanly in the structured JSON "proposedChanges" array so the user can inspect the diff and approve a checkpoint.',
      'Only propose complete, valid, self-contained file contents (no "..." placeholders) when proposing updates or creations.',
      `Current workspace file inventory:\n${fileIndexText}`,
      activeFileObj
        ? `Currently open active file (${activeFileObj.path}):\n\`\`\`${activeFileObj.language}\n${activeFileObj.content}\n\`\`\``
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      // Phase 1: If searchGrounding is requested on gemini-4-hydrogen / flash-lite, run grounded research / tool inspection first
      const citations: GroundingCitation[] = [];
      let groundedResearchNotes = '';

      if (input.searchGrounding) {
        const searchResp = await ai.models.generateContent({
          model: input.modelId === 'gemini-3.1-flash-lite' ? 'gemini-4-hydrogen' : input.modelId,
          contents: `Research & verify up-to-date technical facts if needed for this developer request: ${input.userPrompt}`,
          config: {
            tools: [{ googleSearch: {} }],
            ...(sdkThinking ? { thinkingConfig: { thinkingLevel: sdkThinking } } : {}),
          },
        });
        groundedResearchNotes = searchResp.text || '';
        const chunks = searchResp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        for (const chunk of chunks) {
          const web = (chunk as { web?: { uri?: string; title?: string } }).web;
          if (web?.uri) {
            citations.push({
              title: web.title || web.uri,
              uri: web.uri,
            });
          }
        }
      }

      // Phase 2: Server-controlled read-only tool inspection loop (max 3 turns)
      const toolHistory: Array<{ role: 'user' | 'model'; parts: unknown[] }> = [
        ...input.history.slice(-6).map((m) => ({
          role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
          parts: [{ text: redactSecrets(m.content) }],
        })),
        {
          role: 'user',
          parts: [
            {
              text: [
                redactSecrets(input.userPrompt),
                groundedResearchNotes ? `\n[Grounded Search Context]\n${groundedResearchNotes}` : '',
                '\nFirst inspect any workspace files you need using the read-only tools, then explain your reasoning.',
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
        },
      ];

      let promptTokens = 0;
      let outputTokens = 0;
      let inspectedContext = '';

      for (let step = 0; step < 3; step++) {
        const toolResp = await ai.models.generateContent({
          model: input.modelId,
          contents: toolHistory as never,
          config: {
            systemInstruction,
            tools: [
              {
                functionDeclarations: [readProjectFileDecl, listProjectFilesDecl, searchProjectCodeDecl],
              },
            ],
            ...(sdkThinking ? { thinkingConfig: { thinkingLevel: sdkThinking } } : {}),
          },
        });

        promptTokens += toolResp.usageMetadata?.promptTokenCount || 0;
        outputTokens += toolResp.usageMetadata?.candidatesTokenCount || 0;

        const fnCalls = toolResp.functionCalls;
        const candidateContent = toolResp.candidates?.[0]?.content;
        if (fnCalls && fnCalls.length > 0 && candidateContent) {
          toolHistory.push({ role: 'model', parts: candidateContent.parts || [] });
          const fnResponseParts = fnCalls.map((call) => {
            const result = executeReadOnlyTool(
              call.name || '',
              (call.args as Record<string, unknown>) || {},
              input.files
            );
            inspectedContext += `\n[Tool ${call.name}(${JSON.stringify(call.args)})]: ${JSON.stringify(result).slice(0, 3000)}`;
            return {
              functionResponse: {
                id: call.id,
                name: call.name,
                response: result,
              },
            };
          });
          toolHistory.push({ role: 'user', parts: fnResponseParts });
        } else {
          if (toolResp.text) {
            inspectedContext += `\n[Analysis]: ${toolResp.text}`;
          }
          break;
        }
      }

      // Phase 3: Produce validated structured output (reply + optional planSteps + optional proposedChanges)
      const structuredPrompt = [
        `User request (${input.agentRole} role): ${redactSecrets(input.userPrompt)}`,
        inspectedContext ? `Workspace inspection notes:\n${inspectedContext}` : '',
        groundedResearchNotes ? `Search grounding notes:\n${groundedResearchNotes}` : '',
        'Return a JSON object matching the schema. Include "proposedChanges" ONLY if code or file edits are warranted by the request. For planner tasks, populate "planSteps".',
      ]
        .filter(Boolean)
        .join('\n\n');

      const finalResp = await ai.models.generateContent({
        model: input.modelId,
        contents: structuredPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          ...(sdkThinking ? { thinkingConfig: { thinkingLevel: sdkThinking } } : {}),
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              replyText: {
                type: Type.STRING,
                description: 'Clear technical response explaining the answer, plan, or proposed patch.',
              },
              thinkingSummary: {
                type: Type.STRING,
                description: 'Concise 1-2 sentence architectural reasoning summary.',
              },
              planSteps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    detail: { type: Type.STRING },
                    targetFiles: { type: Type.ARRAY, items: { type: Type.STRING } },
                    status: { type: Type.STRING },
                  },
                  required: ['id', 'title', 'detail', 'targetFiles', 'status'],
                },
              },
              proposedChanges: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    path: { type: Type.STRING },
                    action: { type: Type.STRING },
                    proposedContent: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                  },
                  required: ['path', 'action', 'proposedContent', 'rationale'],
                },
              },
            },
            required: ['replyText', 'planSteps', 'proposedChanges'],
          },
        },
      });

      promptTokens += finalResp.usageMetadata?.promptTokenCount || 0;
      outputTokens += finalResp.usageMetadata?.candidatesTokenCount || 0;

      const parsed = extractJsonSafely<{
        replyText?: string;
        thinkingSummary?: string;
        planSteps?: Array<{
          id: string;
          title: string;
          detail: string;
          targetFiles: string[];
          status: string;
        }>;
        proposedChanges?: Array<{
          path: string;
          action: string;
          proposedContent?: string;
          rationale?: string;
        }>;
      }>(finalResp.text || '{}', {});

      const planSteps: PlanStep[] = Array.isArray(parsed.planSteps)
        ? parsed.planSteps.map((s, idx) => ({
            id: s.id || `step-${idx + 1}`,
            title: s.title || `Step ${idx + 1}`,
            detail: s.detail || '',
            targetFiles: Array.isArray(s.targetFiles) ? s.targetFiles : [],
            status:
              s.status === 'completed' || s.status === 'in_progress' ? s.status : 'pending',
          }))
        : [];

      const proposedChanges = Array.isArray(parsed.proposedChanges)
        ? parsed.proposedChanges
            .filter((c) => typeof c.path === 'string' && c.path.trim().length > 0)
            .map((c) => ({
              path: c.path,
              action: (c.action === 'create' || c.action === 'delete' ? c.action : 'update') as
                | 'create'
                | 'update'
                | 'delete',
              proposedContent: c.proposedContent ?? '',
              rationale: c.rationale || 'Proposed change',
            }))
        : [];

      return {
        replyText: parsed.replyText || finalResp.text || 'Completed analysis.',
        modelId: input.modelId,
        thinkingSummary: parsed.thinkingSummary,
        citations,
        planSteps,
        proposedChanges,
        promptTokens,
        outputTokens,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      throw mapGeminiError(error, input.modelId);
    }
  }

  async runQuickExplain(modelId: string, filePath: string, snippet: string) {
    const start = Date.now();
    const ai = getClient();
    const resolvedModel = modelId || 'gemini-3.1-flash-lite';
    const thinking = toSdkThinkingLevel('LOW', resolvedModel);

    try {
      const response = await ai.models.generateContent({
        model: resolvedModel,
        contents: `Provide a crisp, senior-engineer explanation and 2 concrete improvement suggestions for ${filePath}:\n\n\`\`\`\n${redactSecrets(snippet.slice(0, 6000))}\n\`\`\``,
        config: {
          systemInstruction: 'Be concise, direct, and technical.',
          ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
        },
      });

      return {
        explanation: response.text || 'No explanation generated.',
        promptTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      throw mapGeminiError(error, resolvedModel);
    }
  }

  async runCodeReview(
    modelId: string,
    thinkingLevel: ThinkingLevelName,
    files: ProjectFileContext[],
    targetPath?: string
  ): Promise<CodeReviewOutput> {
    const start = Date.now();
    const ai = getClient();
    const resolvedModel = modelId || 'gemini-4-hydrogen';
    const sdkThinking = toSdkThinkingLevel(thinkingLevel, resolvedModel);

    const targetFiles = targetPath
      ? files.filter((f) => f.path === targetPath)
      : files.slice(0, 12);

    const codeBundle = targetFiles
      .map(
        (f) =>
          `=== FILE: ${f.path} ===\n${f.content
            .split('\n')
            .map((line, i) => `${i + 1}: ${line}`)
            .join('\n')}`
      )
      .join('\n\n');

    try {
      const resp = await ai.models.generateContent({
        model: resolvedModel,
        contents: `Perform a thorough security, reliability, TypeScript strictness, and accessibility code review on these project files:\n\n${redactSecrets(codeBundle)}`,
        config: {
          systemInstruction:
            'You are a Principal Code & Security Reviewer. Identify real, concrete findings with exact file paths and line numbers. Never invent nonexistent files.',
          responseMimeType: 'application/json',
          ...(sdkThinking ? { thinkingConfig: { thinkingLevel: sdkThinking } } : {}),
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              overallStatus: { type: Type.STRING },
              findings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    filePath: { type: Type.STRING },
                    lineStart: { type: Type.INTEGER },
                    lineEnd: { type: Type.INTEGER },
                    severity: { type: Type.STRING },
                    category: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    suggestedPatch: { type: Type.STRING },
                  },
                  required: [
                    'filePath',
                    'lineStart',
                    'lineEnd',
                    'severity',
                    'category',
                    'title',
                    'description',
                  ],
                },
              },
            },
            required: ['summary', 'overallStatus', 'findings'],
          },
        },
      });

      const parsed = extractJsonSafely<{
        summary?: string;
        overallStatus?: string;
        findings?: Array<{
          filePath: string;
          lineStart: number;
          lineEnd: number;
          severity: string;
          category: string;
          title: string;
          description: string;
          suggestedPatch?: string;
        }>;
      }>(resp.text || '{}', {});

      const validPaths = new Set(targetFiles.map((f) => f.path));
      const findings = (parsed.findings || [])
        .filter((f) => validPaths.has(f.filePath))
        .map((f) => ({
          filePath: f.filePath,
          lineStart: Math.max(1, Number(f.lineStart) || 1),
          lineEnd: Math.max(1, Number(f.lineEnd) || Number(f.lineStart) || 1),
          severity: normalizeSeverity(f.severity || 'medium'),
          category: f.category || 'quality',
          title: f.title || 'Review finding',
          description: f.description || '',
          suggestedPatch: f.suggestedPatch || null,
        }));

      const hasCritical = findings.some((f) => f.severity === 'critical' || f.severity === 'high');
      const overallStatus =
        findings.length === 0 ? 'clean' : hasCritical ? 'critical' : 'warnings';

      return {
        summary: parsed.summary || `Reviewed ${targetFiles.length} file(s) with ${findings.length} finding(s).`,
        overallStatus,
        findings,
        promptTokens: resp.usageMetadata?.promptTokenCount || 0,
        outputTokens: resp.usageMetadata?.candidatesTokenCount || 0,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      throw mapGeminiError(error, resolvedModel);
    }
  }
}

export const aiProvider: AiProvider = new GeminiAiProvider();
