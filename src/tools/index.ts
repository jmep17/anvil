import type { ToolSet } from "ai";
import { createBashTool } from "./bash.ts";
import { createEditTool } from "./edit.ts";
import { createGlobTool } from "./glob.ts";
import { createGrepTool } from "./grep.ts";
import { createReadTool } from "./read.ts";
import { createSkillTool, createTaskTool, createTodoWriteTool } from "./todo.ts";
import type { ToolContext } from "./types.ts";
import { createWebFetchTool, createWebSearchTool } from "./web.ts";
import { createWriteTool } from "./write.ts";

const PLAN_READONLY = new Set([
  "Read",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "TodoWrite",
  "Task",
  "Skill",
]);

export function createBuiltinTools(ctx: ToolContext, allowlist?: string[]): ToolSet {
  const all: ToolSet = {
    Read: createReadTool(ctx),
    Write: createWriteTool(ctx),
    Edit: createEditTool(ctx),
    Glob: createGlobTool(ctx),
    Grep: createGrepTool(ctx),
    Bash: createBashTool(ctx),
    WebSearch: createWebSearchTool(ctx),
    WebFetch: createWebFetchTool(ctx),
    TodoWrite: createTodoWriteTool(ctx),
    Task: createTaskTool(ctx),
    Skill: createSkillTool(ctx),
  };

  let names = Object.keys(all);
  if (ctx.mode === "plan") {
    names = names.filter((n) => PLAN_READONLY.has(n));
  }
  if (allowlist?.length) {
    const set = new Set(allowlist);
    names = names.filter((n) => set.has(n));
  }

  const out: ToolSet = {};
  for (const name of names) {
    const t = all[name];
    if (t) out[name] = t;
  }
  return out;
}

export type { ToolContext, AgentEvent, TodoItem, PermissionDecision } from "./types.ts";
