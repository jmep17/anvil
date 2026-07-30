import { describe, expect, test } from "bun:test";
import type { SkillInfo } from "../skills/types.ts";
import { approvalScope } from "./bash.ts";
import { createBuiltinTools } from "./index.ts";
import type { ToolContext } from "./types.ts";

const execOpts = {
  toolCallId: "1",
  messages: [] as never[],
  abortSignal: new AbortController().signal,
  context: {},
};

function ctxWith(signal?: AbortSignal): ToolContext {
  return {
    cwd: "/tmp",
    mode: "build",
    alwaysAllowed: new Set<string>(),
    askPermission: async () => "allow",
    abortSignal: signal,
    todos: [],
    runSubagent: async () => "ok",
    getSkillContent: async () => null,
    listSkills: async () => [] as SkillInfo[],
  };
}

describe("Bash tool", () => {
  test("an interrupted turn kills the command instead of orphaning it", async () => {
    const controller = new AbortController();
    const tools = createBuiltinTools(ctxWith(controller.signal));
    setTimeout(() => controller.abort(), 300);

    const started = Date.now();
    const out = String(await tools.Bash!.execute!({ command: "sleep 30" }, execOpts));

    expect(Date.now() - started).toBeLessThan(10_000);
    expect(out).toContain("interrupted by the user");
  });

  test("a timeout says so rather than reporting a bare exit code", async () => {
    const tools = createBuiltinTools(ctxWith());
    const out = String(
      await tools.Bash!.execute!({ command: "sleep 30", timeout_ms: 300 }, execOpts),
    );
    expect(out).toContain("timed out after 300ms");
    expect(out).toContain("exit_code:");
  });
});

describe("approvalScope", () => {
  test("a plain command is scoped to its program", () => {
    expect(approvalScope("ls -la src")).toBe("ls");
    expect(approvalScope("ls -la")).toBe("ls");
  });

  test("subcommand-driven tools keep the subcommand", () => {
    expect(approvalScope("git status --short")).toBe("git status");
    expect(approvalScope("git push --force")).toBe("git push");
    expect(approvalScope("bun test src/foo")).toBe("bun test");
  });

  test("approving one subcommand does not approve another", () => {
    expect(approvalScope("git status")).not.toBe(approvalScope("git push"));
  });

  test("a leading flag leaves the scope at the program", () => {
    expect(approvalScope("npm --version")).toBe("npm");
  });

  test("compound commands are never scoped down", () => {
    for (const command of [
      "ls && rm -rf /",
      "ls; rm -rf /",
      "ls | grep x",
      "echo $(rm -rf /)",
      "echo `rm -rf /`",
    ]) {
      expect(approvalScope(command)).toBe(command);
    }
  });

  test("surrounding whitespace does not change the scope", () => {
    expect(approvalScope("   git   status   ")).toBe("git status");
  });
});
