import { existsSync } from "node:fs";
import { tool } from "ai";
import { z } from "zod";
import { truncate, type ToolContext } from "./types.ts";

/** Bundled with editors that ship ripgrep, in install-location order. */
const VENDORED_RG = [
  "/Applications/Cursor.app/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg",
  "/Applications/Visual Studio Code.app/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg",
];

let cachedRg: string | null | undefined;

/** Memoized: this spawns a subprocess, and Grep can run many times per turn. */
function resolveRg(): string | null {
  if (cachedRg !== undefined) return cachedRg;
  const which = Bun.spawnSync(["bash", "-c", "command -v rg"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (which.exitCode === 0) {
    const found = new TextDecoder().decode(which.stdout).trim();
    if (found) return (cachedRg = found);
  }
  cachedRg = VENDORED_RG.find((path) => existsSync(path)) ?? null;
  return cachedRg;
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
      output_mode: z
        .enum(["content", "files_with_matches", "count"])
        .optional()
        .describe("content (default) shows matching lines; files_with_matches lists paths; count tallies per file"),
      context: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Lines of context around each match (content mode only)"),
    }),
    execute: async ({
      pattern,
      path,
      glob: globFilter,
      case_insensitive,
      head_limit,
      output_mode,
      context,
    }) => {
      const rg = resolveRg();
      if (!rg) return "Error: ripgrep (rg) not found on PATH";
      const target = path
        ? path.startsWith("/")
          ? path
          : `${ctx.cwd}/${path}`
        : ctx.cwd;
      const mode = output_mode ?? "content";
      const args = ["--color", "never"];
      if (mode === "files_with_matches") {
        args.push("--files-with-matches");
      } else if (mode === "count") {
        args.push("--count-matches");
      } else {
        args.push("--line-number", "--no-heading");
        if (context) args.push("--context", String(context));
      }
      if (case_insensitive) args.push("-i");
      if (globFilter) args.push("--glob", globFilter);
      args.push("--glob", "!node_modules/**", "--glob", "!.git/**");
      // `--` keeps a pattern that starts with `-` from being read as a flag.
      args.push("--", pattern, target);
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
        return truncate(`Error: ${stderr || stdout}`, ctx.maxOutputChars);
      }
      const limit = head_limit ?? 100;
      const lines = stdout.split("\n").filter(Boolean).slice(0, limit);
      return truncate(lines.join("\n") || "No matches found.", ctx.maxOutputChars);
    },
  });
}
