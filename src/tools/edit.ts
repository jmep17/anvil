import { tool } from "ai";
import { z } from "zod";
import {
  requirePermission,
  resolveProjectMutationPath,
  type ToolContext,
} from "./types.ts";

function editPreview(oldString: string, newString: string): string {
  const compact = (value: string) =>
    (value.length > 120 ? `${value.slice(0, 119)}…` : value).replace(/\n/g, " ↵ ");
  return `- ${compact(oldString)}\n+ ${compact(newString)}`;
}

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
      if (ctx.mode === "plan") {
        return "Error: Edit is disabled in plan mode. Switch to build mode to modify files.";
      }
      const abs = await resolveProjectMutationPath(ctx.cwd, path);
      if (!abs) return `Error: Edit target must remain inside the project: ${path}`;
      const ok = await requirePermission(
        ctx,
        "Edit",
        abs,
        editPreview(old_string, new_string),
        `${abs}\0${old_string}\0${new_string}\0${Boolean(replace_all)}`,
      );
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
