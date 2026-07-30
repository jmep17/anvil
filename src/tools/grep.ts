import { existsSync } from "node:fs";
import { tool } from "ai";
import { z } from "zod";
import { truncate, type ToolContext } from "./types.ts";

function resolveRg(): string | null {
  const which = Bun.spawnSync(["bash", "-lc", "command -v rg"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (which.exitCode === 0) {
    return new TextDecoder().decode(which.stdout).trim();
  }
  const cursorRg =
    "/Applications/Cursor.app/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg";
  if (existsSync(cursorRg)) return cursorRg;
  return null;
}

export function createGrepTool(ctx: ToolContext) {
  return tool({
    description:
      "Search file contents with regex (ripgrep). Returns matching lines with paths and line numbers.",
    inputSchema: z.object({
      pattern: z.string().describe("Regex pattern"),
      path: z.string().optional().describe("File or directory to search"),
      glob: z.string().optional().describe("Glob filter e.g. *.ts"),
      case_insensitive: z.boolean().optional(),
      head_limit: z.number().int().positive().optional(),
    }),
    execute: async ({ pattern, path, glob: globFilter, case_insensitive, head_limit }) => {
      const rg = resolveRg();
      if (!rg) return "Error: ripgrep (rg) not found on PATH";
      const target = path
        ? path.startsWith("/")
          ? path
          : `${ctx.cwd}/${path}`
        : ctx.cwd;
      const args = ["--line-number", "--color", "never", "--no-heading"];
      if (case_insensitive) args.push("-i");
      if (globFilter) args.push("--glob", globFilter);
      args.push("--glob", "!node_modules/**", "--glob", "!.git/**");
      args.push(pattern, target);
      const proc = Bun.spawn([rg, ...args], {
        cwd: ctx.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      await proc.exited;
      if (proc.exitCode === 1 && !stdout) return "No matches found.";
      if (proc.exitCode !== 0 && proc.exitCode !== 1) {
        return truncate(`Error: ${stderr || stdout}`);
      }
      const limit = head_limit ?? 100;
      const lines = stdout.split("\n").filter(Boolean).slice(0, limit);
      return truncate(lines.join("\n") || "No matches found.");
    },
  });
}
