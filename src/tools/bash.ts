import { tool } from "ai";
import { z } from "zod";
import { requirePermission, truncate, type ToolContext } from "./types.ts";

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
      const ok = await requirePermission(ctx, "Bash", command);
      if (!ok) return "Error: permission denied for Bash";
      const timeout = timeout_ms ?? 120_000;
      const proc = Bun.spawn(["bash", "-lc", command], {
        cwd: ctx.cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      });
      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
      }, timeout);
      try {
        const [stdout, stderr] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);
        const code = await proc.exited;
        const parts = [
          `exit_code: ${code}`,
          stdout ? `stdout:\n${stdout}` : "stdout: (empty)",
          stderr ? `stderr:\n${stderr}` : null,
        ].filter(Boolean);
        return truncate(parts.join("\n\n"));
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
