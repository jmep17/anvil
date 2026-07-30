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
import { createPlanHarnessTools } from "../tools/plan.ts";
import { toolOutputBudget, type PermissionDecision } from "../tools/types.ts";
import { compactMessages } from "./compact.ts";
import { describeNow } from "./datetime.ts";
import { nextStepNudge, withNudge } from "./discipline.ts";
import { createModel } from "./model.ts";
import {
  PlanHarness,
  planHarnessTools,
  type PlanClarification,
  type ReviewedPlan,
} from "./planHarness.ts";
import { shouldPauseReadTool } from "./stall.ts";
import { buildSystemPrompt } from "./system.ts";
import { StallDetector, stallMessage, type StallPhase } from "./watchdog.ts";

/** How often the silence detector is consulted. */
const STALL_POLL_MS = 1_000;

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
  /**
   * Approvals the user granted with "always" earlier in this session. Owned by
   * the caller so a grant outlives the single turn that produced it.
   */
  alwaysAllowed?: Set<string>;
}

export interface RunAgentResult {
  messages: ModelMessage[];
  /**
   * Only the messages this turn produced. Callers must persist these rather
   * than slicing `messages`, whose head may have been compacted away.
   */
  responseMessages: ModelMessage[];
  text: string;
  mcpHandles: McpHandle[];
  plan?: ReviewedPlan;
  clarification?: PlanClarification;
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

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const seen = new Set<unknown>();
  const findResponseBody = (value: unknown): string | undefined => {
    if (!value || typeof value !== "object" || seen.has(value)) return undefined;
    seen.add(value);
    const candidate = value as {
      responseBody?: unknown;
      cause?: unknown;
      lastError?: unknown;
      errors?: unknown;
    };
    if (typeof candidate.responseBody === "string" && candidate.responseBody.trim()) {
      return candidate.responseBody;
    }
    const nested = [candidate.cause, candidate.lastError];
    if (Array.isArray(candidate.errors)) nested.push(...candidate.errors);
    for (const item of nested) {
      const responseBody = findResponseBody(item);
      if (responseBody) return responseBody;
    }
    return undefined;
  };
  const responseBody = findResponseBody(error);
  return responseBody ? `${message}\n${responseBody.slice(0, 2_000)}` : message;
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

/**
 * An abort signal that fires when the caller's does, and also when this run
 * decides to give up on a silent server. Returned rather than mutating the
 * caller's so an interrupt still means exactly what it did before.
 */
function chainAbort(parent?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (!parent) return controller;
  if (parent.aborted) controller.abort(parent.reason);
  else parent.addEventListener("abort", () => controller.abort(parent.reason), { once: true });
  return controller;
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const depth = opts.depth ?? 0;
  const planHarness = opts.config.mode === "plan" && depth === 0 ? new PlanHarness() : undefined;
  const alwaysAllowed = opts.alwaysAllowed ?? new Set<string>();
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

  // Declared ahead of `ctx` so the subagent closure can capture them, but
  // populated after it: MCP tools are permission-gated through the same
  // context as the builtins.
  let mcpTools: ToolSet = opts.mcpTools ?? {};
  let mcpHandles: McpHandle[] = [];

  // Every stall shape ends here: the caller's interrupt, and this run giving up
  // on a server that has stopped answering.
  const abort = chainAbort(opts.abortSignal);
  const stall = new StallDetector(opts.config.timeouts, Date.now());
  // Held in an object: a plain `let` assigned only inside a callback is
  // narrowed to `never` by the time the catch below reads it.
  const stalled: { hit: { phase: StallPhase; idleMs: number } | null } = { hit: null };
  const beat = (phase?: StallPhase) => stall.beat(Date.now(), phase);

  const ctx: ToolContext = {
    cwd: opts.cwd,
    mode: opts.config.mode,
    alwaysAllowed,
    askPermission: opts.askPermission,
    abortSignal: abort.signal,
    maxOutputChars: toolOutputBudget(opts.config.contextLength),
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
        abortSignal: abort.signal,
        skipMcp: true,
        mcpTools,
        toolAllowlist: toolNames,
        depth: depth + 1,
        alwaysAllowed,
      });
      return sub.text || "(subagent finished with no text)";
    },
  };

  if (!opts.skipMcp && !opts.mcpTools) {
    const connected = await connectMcpServers(
      opts.config.mcpServers,
      (message) => opts.onEvent?.({ type: "error", message }),
      ctx,
    );
    mcpTools = connected.tools;
    mcpHandles = connected.handles;
  }

  const tools: ToolSet = {
    ...createBuiltinTools(ctx, opts.toolAllowlist),
    ...pickTools(mcpTools, opts.toolAllowlist),
    ...(planHarness ? createPlanHarnessTools(planHarness) : {}),
  };

  const system = buildSystemPrompt({
    cwd: opts.cwd,
    mode: opts.config.mode,
    // Rebuilt per turn, so a long session does not drift out of date.
    now: describeNow(new Date(), opts.config.timezone),
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
  let streamedText = false;
  const result = streamText({
    model,
    instructions: system,
    messages,
    tools,
    abortSignal: abort.signal,
    stopWhen: planHarness
      ? [isStepCount(opts.config.maxSteps), () => planHarness.isComplete]
      : isStepCount(opts.config.maxSteps),
    maxRetries: 2,
    // A local server under memory pressure stops producing tokens without ever
    // closing the connection, and the agent would otherwise wait on it for as
    // long as the user let it. These bound the silence rather than the work:
    // the first-token budget is deliberately large because prompt processing on
    // a long conversation is legitimately slow.
    timeout: {
      firstChunkMs: opts.config.timeouts.firstChunkMs,
      chunkMs: opts.config.timeouts.chunkMs,
      toolMs: opts.config.timeouts.toolMs,
    },
    // The system prompt is never rewritten between steps. It is the prompt
    // prefix, and a local server caches its KV state; changing it forces the
    // whole context to be re-encoded before each step, which is felt as the
    // agent hanging. Per-step guidance is appended to the messages instead,
    // where it only costs the new tokens.
    prepareStep: ({ steps, messages: stepMessages }) => {
      const planControl = planHarness?.nextStep();
      if (planControl) {
        opts.onEvent?.({ type: "status", message: `plan · ${planControl.stage.replace(/_/g, " ")}` });
        return {
          activeTools: planHarnessTools(tools, planControl),
          messages: withNudge(stepMessages, `Plan harness stage: ${planControl.instruction}`),
        };
      }
      const pauseRead = shouldPauseReadTool(steps);
      const nudge = nextStepNudge(Boolean(steps.at(-1)?.toolCalls.length));

      if (pauseRead) {
        opts.onEvent?.({
          type: "status",
          message: "Repeated Read paused for one step; choose an action or report the blocker.",
        });
      }
      return {
        ...(nudge ? { messages: withNudge(stepMessages, nudge) } : {}),
        ...(pauseRead ? { activeTools: Object.keys(tools).filter((name) => name !== "Read") } : {}),
      };
    },
    onError: ({ error }) => {
      opts.onEvent?.({
        type: "error",
        message: errorMessage(error),
      });
    },
    onChunk: ({ chunk }) => {
      // Only a delta means tokens are actually flowing. The stream's opening
      // chunk arrives before prompt processing has even started, and must not
      // downgrade the budget from the generous first-token one.
      beat(chunk.type.endsWith("-delta") ? "chunk" : undefined);
      if (chunk.type === "reasoning-delta") {
        opts.onEvent?.({ type: "thinking", text: chunk.text });
      } else if (chunk.type === "text-delta") {
        streamedText = true;
        opts.onEvent?.({ type: "text", text: chunk.text });
      }
    },
    onToolExecutionStart: ({ toolCall }) => {
      beat("tool");
      opts.onEvent?.({
        type: "tool_start",
        id: toolCall.toolCallId,
        name: toolCall.toolName,
        input: toolCall.input,
      });
    },
    onToolExecutionEnd: ({ toolCall, toolOutput, toolExecutionMs }) => {
      // Back to waiting on the model, which gets the larger budget.
      beat("first-chunk");
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
      planHarness?.recordEvidence(toolCall.toolName, toolCall.input);
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
      beat("first-chunk");
      step += 1;
      // Fallback for providers that return a step's prose in one piece rather
      // than as deltas; without it the response would never reach the UI.
      if (!planHarness && !streamedText && toolCalls.length === 0 && text) {
        opts.onEvent?.({ type: "text", text });
      }
      streamedText = false;
      opts.onEvent?.({ type: "step", step });
    },
  });

  const watch = setInterval(() => {
    const idleMs = stall.overdue(Date.now());
    if (idleMs == null) return;
    stalled.hit = { phase: stall.phase, idleMs };
    opts.onEvent?.({ type: "error", message: stallMessage(stall.phase, idleMs) });
    abort.abort(new Error(stallMessage(stall.phase, idleMs)));
  }, STALL_POLL_MS);

  let finalText: string;
  let responseMessages: ModelMessage[];
  try {
    finalText = await result.text;
    responseMessages = (await result.response).messages;
  } catch (err) {
    // Report the stall, not the abort it caused — "operation was aborted" reads
    // as if the user had pressed Esc.
    if (stalled.hit) throw new Error(stallMessage(stalled.hit.phase, stalled.hit.idleMs));
    throw err;
  } finally {
    clearInterval(watch);
  }
  const nextMessages = [...messages, ...responseMessages];

  // Ensure callers always get the assembled assistant text even if chunk streaming was sparse
  opts.onEvent?.({ type: "status", message: `done (${step} step(s))` });

  // A review route answers in prose, so finishing without a SubmitPlan is the
  // expected outcome there — only a turn that owed a plan is a failure.
  if (planHarness && planHarness.expectsPlan && !planHarness.isComplete) {
    opts.onEvent?.({
      type: "error",
      message: "Plan harness ended before a clarification or structured plan was submitted.",
    });
  }

  return {
    messages: nextMessages,
    responseMessages,
    text: finalText,
    mcpHandles,
    plan: planHarness?.reviewedPlan,
    clarification: planHarness?.clarification,
  };
}
