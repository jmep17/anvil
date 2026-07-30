import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { requirePermission, resolvePath, type ToolContext } from "./types.ts";

export function createWriteTool(ctx: ToolContext) {
  return tool({
    description:
      "Write contents to a file, creating it if needed (and parent directories). Overwrites existing files. Prefer Edit for small changes to existing files.",
    inputSchema: z.object({
      path: z.string().describe("File path to write"),
      content: z.string().describe("Full file contents"),
    }),
    execute: async ({ path, content }) => {
      const abs = resolvePath(ctx.cwd, path);
      if (ctx.mode === "plan") {
        return "Error: Write is disabled in plan mode. Switch to build mode to modify files.";
      }
      const ok = await requirePermission(ctx, "Write", abs);
      if (!ok) return "Error: permission denied for Write";
      await mkdir(dirname(abs), { recursive: true });
      await Bun.write(abs, content);
      return `Wrote ${content.length} bytes to ${abs}`;
    },
  });
}
