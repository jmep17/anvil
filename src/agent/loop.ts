import {
  isStepCount,
  streamText,
  type ModelMessage,
  type ToolSet,
} from "ai";
import type { AnvilConfig } from "../config/types.ts";
import { connectMcpServers, type McpHandle } from "../mcp/client.ts";
import { loadRepoContext } from "../skills/context.ts";
import { detectStack, recommendSkillsFromTags } from "../skills/detect.ts";
import { getSkillContent, listSkills, loadSkillBodies } from "../skills/loader.ts";
import {
  createBuiltinTools,
  type AgentEvent,
  type TodoItem,
  type ToolContext,
} from "../tools/index.ts";
import type { PermissionDecision } from "../tools/types.ts";
import { compactMessages } from "./compact.ts";
import { nextStepInstructions } from "./discipline.ts";
import { createModel } from "./model.ts";
import { shouldPauseReadTool } from "./stall.ts";
import { buildSystemPrompt } from "./system.ts";

export interface RunAgentOptions {
  config: AnvilConfig;
  cwd: string;
  messages: ModelMessage[];
  askPermission: (toolName: string, detail: string) => Promise<PermissionDecision>;
  onEvent?: (event: AgentEvent) => void;
  abortSignal?: AbortSignal;
  skipMcp?: boolean;
  toolAllowlist?: string[];
  mcpTools?: ToolSet;
  depth?: number;
}

export interface RunAgentResult {
  messages: ModelMessage[];
  text: string;
  mcpHandles: McpHandle[];
}

function pickTools(all: ToolSet, allowlist?: string[]): ToolSet {
  if (!allowlist?.length) return all;
  const allow = new Set(allowlist);
  const out: ToolSet = {};
  for (const [name, t] of Object.entries(all)) {
    if (allow.has(name)) out[name] = t;
  }
  return out;
}

async function resolveInjectedSkills(
  cwd: string,
  config: AnvilConfig,
  recommended: string[],
): Promise<string> {
  const toLoad: string[] = [...config.skills.always];
  if (!config.skills.recommendOnly) {
    for (const name of recommended) {
      if (!toLoad.includes(name)) toLoad.push(name);
    }
  }
  if (toLoad.length === 0) return "";
  return loadSkillBodies(cwd, toLoad, {
    maxSkills: config.skills.maxInjectSkills,
    maxChars: config.skills.maxInjectChars,
  });
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const depth = opts.depth ?? 0;
  const alwaysAllowed = new Set<string>();
  const todos: TodoItem[] = [];
  const skills = await listSkills(opts.cwd);
  const repo = await loadRepoContext(opts.cwd, opts.config.context);

  const detectedStack = opts.config.skills.autoDetect
    ? await detectStack(opts.cwd)
    : [];
  const detectMap = new Map(
    skills.filter((s) => s.detect.length > 0).map((s) => [s.name, s.detect] as const),
  );
  const recommendedSkills = opts.config.skills.autoDetect
    ? recommendSkillsFromTags(detectedStack, detectMap).filter((name) =>
        skills.some((s) => s.name === name),
      )
    : [];
  const injectedSkills = await resolveInjectedSkills(
    opts.cwd,
    opts.config,
    recommendedSkills,
  );

  let mcpTools: ToolSet = opts.mcpTools ?? {};
  let mcpHandles: McpHandle[] = [];
  if (!opts.skipMcp && !opts.mcpTools) {
    const connected = await connectMcpServers(opts.config.mcpServers, (message) => {
      opts.onEvent?.({ type: "error", message });
    });
    mcpTools = connected.tools;
    mcpHandles = connected.handles;
  }

  const ctx: ToolContext = {
    cwd: opts.cwd,
    mode: opts.config.mode,
    alwaysAllowed,
    askPermission: opts.askPermission,
    abortSignal: opts.abortSignal,
    emit: opts.onEvent,
    todos,
    listSkills: () => listSkills(opts.cwd),
    getSkillContent: (name) => getSkillContent(opts.cwd, name),
    runSubagent: async (prompt, toolNames) => {
      if (depth >= 1) {
        return "Error: nested subagents are not allowed (depth limit 1).";
      }
      opts.onEvent?.({ type: "status", message: `Subagent: ${prompt}` });
      const sub = await runAgent({
        config: { ...opts.config, maxSteps: Math.min(opts.config.maxSteps, 20) },
        cwd: opts.cwd,
        messages: [{ role: "user", content: prompt }],
        askPermission: opts.askPermission,
        onEvent: opts.onEvent,
        abortSignal: opts.abortSignal,
        skipMcp: true,
        mcpTools,
        toolAllowlist: toolNames,
        depth: depth + 1,
      });
      return sub.text || "(subagent finished with no text)";
    },
  };

  const tools: ToolSet = {
    ...createBuiltinTools(ctx, opts.toolAllowlist),
    ...pickTools(mcpTools, opts.toolAllowlist),
  };

  const system = buildSystemPrompt({
    cwd: opts.cwd,
    mode: opts.config.mode,
    skills,
    repoContext: repo.combined,
    detectedStack,
    recommendedSkills,
    injectedSkills,
    skillsConfig: opts.config.skills,
  });

  const messages = compactMessages(opts.messages, opts.config.contextLength);
  const model = createModel(opts.config);

  opts.onEvent?.({
    type: "status",
    message: `model=${opts.config.model} mode=${opts.config.mode}`,
  });

  let step = 0;
  const result = streamText({
    model,
    system,
    messages,
    tools,
    abortSignal: opts.abortSignal,
    stopWhen: isStepCount(opts.config.maxSteps),
    maxRetries: 2,
    prepareStep: ({ steps }) => {
      const pauseRead = shouldPauseReadTool(steps);
      const instructions = nextStepInstructions(
        system,
        Boolean(steps.at(-1)?.toolCalls.length),
      );
      if (!pauseRead && !instructions) return undefined;

      if (pauseRead) {
        opts.onEvent?.({
          type: "status",
          message: "Repeated Read paused for one step; choose an action or report the blocker.",
        });
      }
      return {
        ...(instructions ? { instructions } : {}),
        ...(pauseRead ? { activeTools: Object.keys(tools).filter((name) => name !== "Read") } : {}),
      };
    },
    onError: ({ error }) => {
      opts.onEvent?.({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    },
    onChunk: ({ chunk }) => {
      // Reasoning is intentionally surfaced. User-facing prose is held until
      // step completion so tentative pre-tool chatter cannot pollute the transcript.
      if (chunk.type === "reasoning-delta") {
        opts.onEvent?.({ type: "thinking", text: chunk.text });
      }
    },
    onToolExecutionStart: ({ toolCall }) => {
      opts.onEvent?.({
        type: "tool_start",
        id: toolCall.toolCallId,
        name: toolCall.toolName,
        input: toolCall.input,
      });
    },
    onToolExecutionEnd: ({ toolCall, toolOutput, toolExecutionMs }) => {
      if (toolOutput.type === "tool-error") {
        const err =
          toolOutput.error instanceof Error
            ? toolOutput.error.message
            : String(toolOutput.error);
        opts.onEvent?.({
          type: "tool_end",
          id: toolCall.toolCallId,
          name: toolCall.toolName,
          // Tool implementations already apply their own model-safety limits.
          // Keep the complete returned result for the transcript and session.
          output: err,
          error: true,
          ms: toolExecutionMs,
        });
        return;
      }
      const output =
        typeof toolOutput.output === "string"
          ? toolOutput.output
          : JSON.stringify(toolOutput.output);
      opts.onEvent?.({
        type: "tool_end",
        id: toolCall.toolCallId,
        name: toolCall.toolName,
        output,
        ms: toolExecutionMs,
      });
    },
    onStepFinish: async ({ text, toolCalls }) => {
      step += 1;
      if (toolCalls.length === 0 && text) {
        opts.onEvent?.({ type: "text", text });
      }
      opts.onEvent?.({ type: "step", step });
    },
  });

  const finalText = await result.text;
  const responseMessages = (await result.response).messages;
  const nextMessages = [...messages, ...responseMessages];

  // Ensure callers always get the assembled assistant text even if chunk streaming was sparse
  opts.onEvent?.({ type: "status", message: `done (${step} step(s))` });

  return { messages: nextMessages, text: finalText, mcpHandles };
}
