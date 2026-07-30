import { tool } from "ai";
import { z } from "zod";
import { requirePermission, resolvePath, type ToolContext } from "./types.ts";

export function createEditTool(ctx: ToolContext) {
  return tool({
    description:
      "Exact string replacement in an existing file. old_string must match uniquely unless replace_all is true.",
    inputSchema: z.object({
      path: z.string().describe("File path to edit"),
      old_string: z.string().describe("Exact text to find"),
      new_string: z.string().describe("Replacement text"),
      replace_all: z.boolean().optional().describe("Replace every occurrence"),
    }),
    execute: async ({ path, old_string, new_string, replace_all }) => {
      const abs = resolvePath(ctx.cwd, path);
      if (ctx.mode === "plan") {
        return "Error: Edit is disabled in plan mode. Switch to build mode to modify files.";
      }
      const ok = await requirePermission(ctx, "Edit", abs);
      if (!ok) return "Error: permission denied for Edit";
      const file = Bun.file(abs);
      if (!(await file.exists())) return `Error: file not found: ${abs}`;
      const text = await file.text();
      if (!text.includes(old_string)) {
        return "Error: old_string not found in file";
      }
      const count = text.split(old_string).length - 1;
      if (!replace_all && count > 1) {
        return `Error: old_string matched ${count} times; provide a more specific string or set replace_all=true`;
      }
      const next = replace_all
        ? text.split(old_string).join(new_string)
        : text.replace(old_string, new_string);
      await Bun.write(abs, next);
      return `Edited ${abs} (${replace_all ? count : 1} replacement(s))`;
    },
  });
}
