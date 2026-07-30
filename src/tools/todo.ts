import { tool } from "ai";
import { z } from "zod";
import type { ToolContext, TodoItem } from "./types.ts";

export function createTodoWriteTool(ctx: ToolContext) {
  return tool({
    description:
      "Update the task checklist for the current session. Use to track multi-step work. Prefer merging updates rather than clearing silently.",
    inputSchema: z.object({
      todos: z
        .array(
          z.object({
            id: z.string(),
            content: z.string(),
            status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
          }),
        )
        .describe("Full todo list to set"),
    }),
    execute: async ({ todos }) => {
      ctx.todos.splice(0, ctx.todos.length, ...(todos as TodoItem[]));
      // The UI renders the checklist itself rather than the returned text.
      ctx.emit?.({ type: "todos", todos: [...ctx.todos] });
      const summary = ctx.todos
        .map((t) => `- [${t.status}] ${t.id}: ${t.content}`)
        .join("\n");
      return `Todos updated (${ctx.todos.length}):\n${summary}`;
    },
  });
}

export function createTaskTool(ctx: ToolContext) {
  return tool({
    description:
      "Spawn a subagent with an isolated context to research or complete a focused subtask. Returns a summary. Use for parallelizable exploration or long digressions.",
    inputSchema: z.object({
      prompt: z.string().describe("Task for the subagent"),
      tools: z
        .array(z.string())
        .optional()
        .describe("Optional allowlist of tool names (default: read-only tools)"),
    }),
    execute: async ({ prompt, tools }) => {
      const allow =
        tools ?? ["Read", "Glob", "Grep", "WebSearch", "WebFetch", "Skill"];
      return await ctx.runSubagent(prompt, allow);
    },
  });
}

export function createSkillTool(ctx: ToolContext) {
  return tool({
    description:
      "Load an on-demand skill playbook by name. Lists available skills when name is omitted or 'list'. Use before planning specialized work (e.g. shadcn, frontend, api, database, testing, docs).",
    inputSchema: z.object({
      name: z.string().optional().describe("Skill name, or 'list'"),
    }),
    execute: async ({ name }) => {
      if (!name || name === "list") {
        const skills = await ctx.listSkills();
        return skills.length
          ? `Available skills:\n${skills
              .map((s) => `- ${s.name} (${s.source}) — ${s.description || "(no description)"}`)
              .join("\n")}`
          : "No skills found in builtin pack, ~/.anvil/skills, or .anvil/skills";
      }
      const content = await ctx.getSkillContent(name);
      if (!content) return `Error: skill not found: ${name}`;
      return content;
    },
  });
}
