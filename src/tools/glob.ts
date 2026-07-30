import { tool } from "ai";
import { glob } from "glob";
import { z } from "zod";
import { loadIgnore } from "../fs/ignore.ts";
import { truncate, type ToolContext } from "./types.ts";

export function createGlobTool(ctx: ToolContext) {
  return tool({
    description:
      "Find files by glob pattern (e.g. **/*.ts). Results capped at 200 paths.",
    inputSchema: z.object({
      pattern: z.string().describe("Glob pattern"),
      path: z.string().optional().describe("Directory to search (default: cwd)"),
    }),
    execute: async ({ pattern, path }) => {
      const root = path ? (path.startsWith("/") ? path : `${ctx.cwd}/${path}`) : ctx.cwd;
      const ig = await loadIgnore(ctx.cwd);
      const matches = await glob(pattern, {
        cwd: root,
        nodir: true,
        dot: false,
        absolute: false,
        // Apply these during traversal, not after it, so broad patterns do
        // not spend most of their time walking installed dependencies or Git.
        ignore: ["**/node_modules/**", "**/.git/**"],
      });
      const filtered = matches.filter((m) => !ig.ignores(m)).slice(0, 200);
      if (filtered.length === 0) return "No files matched.";
      return truncate(filtered.join("\n"));
    },
  });
}
