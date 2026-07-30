import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ToolSet } from "ai";
import type { AgentMode } from "../config/types.ts";
import type { SkillInfo } from "../skills/types.ts";

export type PermissionDecision = "allow" | "always" | "deny";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | {
      type: "tool_end";
      id: string;
      name: string;
      output: string;
      error?: boolean;
      ms?: number;
    }
  | { type: "todos"; todos: TodoItem[] }
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
  askPermission: (
    toolName: string,
    detail: string,
    preview?: string,
  ) => Promise<PermissionDecision>;
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
  return resolve(cwd, filePath);
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Resolve a mutation target without allowing path traversal or symlink escapes
 * outside the working directory. Read-only tools intentionally remain broader.
 */
export async function resolveProjectMutationPath(
  cwd: string,
  filePath: string,
): Promise<string | null> {
  const root = await realpath(cwd);
  const candidate = resolve(root, filePath);
  if (!isWithin(root, candidate)) return null;

  // Resolve the target when it exists; otherwise resolve its nearest existing
  // parent. This catches symlinked files and directories before Write creates
  // anything below them.
  let existing = candidate;
  while (true) {
    try {
      const canonical = await realpath(existing);
      return isWithin(root, canonical) ? candidate : null;
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return null;
      existing = parent;
    }
  }
}

export async function requirePermission(
  ctx: ToolContext,
  toolName: string,
  detail: string,
  preview?: string,
  approvalKey = detail,
): Promise<boolean> {
  if (ctx.mode === "plan" && ["Write", "Edit", "Bash"].includes(toolName)) {
    return false;
  }
  const key = `${toolName}:${approvalKey}`;
  if (ctx.alwaysAllowed.has(key)) return true;
  const decision = await ctx.askPermission(toolName, detail, preview);
  if (decision === "always") {
    ctx.alwaysAllowed.add(key);
    return true;
  }
  return decision === "allow";
}

export type BuiltinTools = ToolSet;
