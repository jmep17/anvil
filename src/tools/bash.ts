import { tool } from "ai";
import { z } from "zod";
import { requirePermission, truncate, type ToolContext } from "./types.ts";

/** Tools whose meaning lives in the subcommand, not the binary name. */
const SUBCOMMAND_DRIVEN = new Set([
  "bun",
  "bunx",
  "cargo",
  "docker",
  "git",
  "go",
  "npm",
  "npx",
  "pnpm",
  "yarn",
]);

/**
 * The unit a session-wide Bash approval applies to. Keying on the full command
 * string means "don't ask again" never matches a second time; keying on the
 * program (plus its subcommand where that is what carries the meaning) grants
 * `git status` without also granting `rm -rf`.
 */
export function approvalScope(command: string): string {
  const words = command.trim().split(/\s+/).filter(Boolean);
  const program = words[0];
  if (!program) return command.trim();
  // A compound command re-approves each time: its parts are not scoped by the
  // leading program alone.
  if (/[;&|]|\$\(|`/.test(command)) return command.trim();
  if (SUBCOMMAND_DRIVEN.has(program)) {
    const sub = words[1];
    if (sub && !sub.startsWith("-")) return `${program} ${sub}`;
  }
  return program;
}

export function createBashTool(ctx: ToolContext) {
  return tool({
    description:
      "Run a bash command in the project working directory. Use for git, builds, tests, package managers. Prefer dedicated tools for file read/search when available.",
    inputSchema: z.object({
      command: z.string().describe("Shell command to run"),
      timeout_ms: z.number().int().positive().optional().describe("Timeout in ms (default 120000)"),
    }),
    execute: async ({ command, timeout_ms }) => {
      if (ctx.mode === "plan") {
        return "Error: Bash is disabled in plan mode. Switch to build mode to run commands.";
      }
      const ok = await requirePermission(ctx, "Bash", command, undefined, approvalScope(command));
      if (!ok) return "Error: permission denied for Bash";
      const timeout = timeout_ms ?? 120_000;
      // `-c` without `-l`: a login shell re-sources the user's profile on every
      // call, which is slow and pulls in interactive-only configuration.
      const proc = Bun.spawn(["bash", "-c", command], {
        cwd: ctx.cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });

      let timedOut = false;
      let aborted = false;
      const kill = () => {
        try {
          proc.kill();
        } catch {
          // already exited
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, timeout);
      const onAbort = () => {
        aborted = true;
        kill();
      };
      ctx.abortSignal?.addEventListener("abort", onAbort, { once: true });
      if (ctx.abortSignal?.aborted) onAbort();

      try {
        const [stdout, stderr] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);
        const code = await proc.exited;
        const parts = [
          aborted
            ? "status: interrupted by the user before completion"
            : timedOut
              ? `status: timed out after ${timeout}ms and was killed`
              : null,
          `exit_code: ${code}`,
          stdout ? `stdout:\n${stdout}` : "stdout: (empty)",
          stderr ? `stderr:\n${stderr}` : null,
        ].filter(Boolean);
        return truncate(parts.join("\n\n"), ctx.maxOutputChars);
      } finally {
        clearTimeout(timer);
        ctx.abortSignal?.removeEventListener("abort", onAbort);
      }
    },
  });
}
