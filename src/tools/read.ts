import { tool } from "ai";
import { z } from "zod";
import { resolvePath, truncate, type ToolContext } from "./types.ts";

export function createReadTool(ctx: ToolContext) {
  return tool({
    description:
      "Read a file from the filesystem. Prefer absolute or cwd-relative paths. For large files, use offset and limit (1-indexed line numbers).",
    inputSchema: z.object({
      path: z.string().describe("File path to read"),
      offset: z.number().int().positive().optional().describe("Start line (1-indexed)"),
      limit: z.number().int().positive().optional().describe("Max lines to return"),
    }),
    execute: async ({ path, offset, limit }) => {
      const abs = resolvePath(ctx.cwd, path);
      const file = Bun.file(abs);
      if (!(await file.exists())) {
        return `Error: file not found: ${abs}`;
      }
      const text = await file.text();
      const lines = text.split("\n");
      const start = offset ? offset - 1 : 0;
      const end = limit ? start + limit : lines.length;
      const slice = lines.slice(start, end);
      const numbered = slice
        .map((line, i) => `${String(start + i + 1).padStart(6)}|${line}`)
        .join("\n");
      return truncate(numbered || "(empty file)");
    },
  });
}
