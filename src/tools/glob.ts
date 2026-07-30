import { tool } from "ai";
import { glob } from "glob";
import ignore from "ignore";
import { z } from "zod";
import { truncate, type ToolContext } from "./types.ts";

async function loadIgnore(cwd: string) {
  const ig = ignore();
  ig.add([".git", "node_modules", "dist", "build", ".next", "coverage"]);
  for (const name of [".gitignore", ".anvilignore"]) {
    const file = Bun.file(`${cwd}/${name}`);
    if (await file.exists()) {
      ig.add(await file.text());
    }
  }
  return ig;
}

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
      });
      const filtered = matches.filter((m) => !ig.ignores(m)).slice(0, 200);
      if (filtered.length === 0) return "No files matched.";
      return truncate(filtered.join("\n"));
    },
  });
}
