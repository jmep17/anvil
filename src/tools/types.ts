import type { ToolSet } from "ai";
import type { AgentMode } from "../config/types.ts";
import type { SkillInfo } from "../skills/types.ts";

export type PermissionDecision = "allow" | "always" | "deny";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; name: string; input: unknown }
  | { type: "tool_end"; name: string; output: string; error?: boolean }
  | { type: "status"; message: string }
  | { type: "error"; message: string }
  | { type: "step"; step: number };

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

export interface ToolContext {
  cwd: string;
  mode: AgentMode;
  alwaysAllowed: Set<string>;
  askPermission: (toolName: string, detail: string) => Promise<PermissionDecision>;
  abortSignal?: AbortSignal;
  emit?: (event: AgentEvent) => void;
  todos: TodoItem[];
  runSubagent: (prompt: string, toolNames?: string[]) => Promise<string>;
  getSkillContent: (name: string) => Promise<string | null>;
  listSkills: () => Promise<SkillInfo[]>;
}

export const MAX_TOOL_OUTPUT = 50_000;

export function truncate(text: string, max = MAX_TOOL_OUTPUT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n… truncated (${text.length - max} more chars)`;
}

export function resolvePath(cwd: string, filePath: string): string {
  if (filePath.startsWith("/")) return filePath;
  return `${cwd.replace(/\/$/, "")}/${filePath}`;
}

export async function requirePermission(
  ctx: ToolContext,
  toolName: string,
  detail: string,
): Promise<boolean> {
  if (ctx.mode === "plan" && ["Write", "Edit", "Bash"].includes(toolName)) {
    return false;
  }
  const key = `${toolName}:${detail}`;
  if (ctx.alwaysAllowed.has(toolName) || ctx.alwaysAllowed.has(key)) return true;
  const decision = await ctx.askPermission(toolName, detail);
  if (decision === "always") {
    ctx.alwaysAllowed.add(toolName);
    return true;
  }
  return decision === "allow";
}

export type BuiltinTools = ToolSet;
