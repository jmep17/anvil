import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { unifiedDiff } from "../fs/diff.ts";
import {
  requirePermission,
  resolveProjectMutationPath,
  type ToolContext,
} from "./types.ts";

async function contentPreview(abs: string, content: string): Promise<string> {
  const file = Bun.file(abs);
  const before = (await file.exists()) ? await file.text() : "";
  return unifiedDiff(abs, before, content);
}

export function createWriteTool(ctx: ToolContext) {
  return tool({
    description:
      "Write contents to a file, creating it if needed (and parent directories). Overwrites existing files. Prefer Edit for small changes to existing files.",
    inputSchema: z.object({
      path: z.string().describe("File path to write"),
      content: z.string().describe("Full file contents"),
    }),
    execute: async ({ path, content }) => {
      if (ctx.mode === "plan") {
        return "Error: Write is disabled in plan mode. Switch to build mode to modify files.";
      }
      const abs = await resolveProjectMutationPath(ctx.cwd, path);
      if (!abs) return `Error: Write target must remain inside the project: ${path}`;
      const ok = await requirePermission(
        ctx,
        "Write",
        abs,
        await contentPreview(abs, content),
        abs,
      );
      if (!ok) return "Error: permission denied for Write";
      await mkdir(dirname(abs), { recursive: true });
      await Bun.write(abs, content);
      return `Wrote ${content.length} bytes to ${abs}`;
    },
  });
}
