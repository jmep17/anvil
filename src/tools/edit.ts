import { tool } from "ai";
import { z } from "zod";
import { unifiedDiff } from "../fs/diff.ts";
import {
  requirePermission,
  resolveProjectMutationPath,
  type ToolContext,
} from "./types.ts";

/**
 * `String.prototype.replace` expands `$&`, `` $` ``, `$'` and `$1` inside the
 * replacement, which silently corrupts edits to regex, shell and template code.
 * Splitting and joining treats the replacement as a literal.
 */
export function applyEdit(
  text: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): string {
  if (replaceAll) return text.split(oldString).join(newString);
  const at = text.indexOf(oldString);
  if (at === -1) return text;
  return text.slice(0, at) + newString + text.slice(at + oldString.length);
}

function editPreview(path: string, before: string, after: string): string {
  return unifiedDiff(path, before, after);
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
      // Validate before prompting so the user is never asked to approve an edit
      // that cannot succeed.
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
      const next = applyEdit(text, old_string, new_string, Boolean(replace_all));
      const ok = await requirePermission(
        ctx,
        "Edit",
        abs,
        editPreview(abs, text, next),
        abs,
      );
      if (!ok) return "Error: permission denied for Edit";
      await Bun.write(abs, next);
      return `Edited ${abs} (${replace_all ? count : 1} replacement(s))`;
    },
  });
}
