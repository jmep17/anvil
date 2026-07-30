import { describe, expect, test } from "bun:test";
import type { SkillInfo } from "../skills/types.ts";
import { createBuiltinTools } from "./index.ts";
import type { ToolContext } from "./types.ts";

function mockCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    cwd: process.cwd(),
    mode: "build",
    alwaysAllowed: new Set(["Write", "Edit", "Bash"]),
    askPermission: async () => "allow",
    todos: [],
    runSubagent: async () => "ok",
    getSkillContent: async () => null,
    listSkills: async () => [] as SkillInfo[],
    ...overrides,
  };
}

describe("builtin tools", () => {
  const execOpts = {
    toolCallId: "1",
    messages: [] as never[],
    abortSignal: new AbortController().signal,
    context: {},
  };

  test("Glob finds README", async () => {
    const tools = createBuiltinTools(mockCtx());
    const result = await tools.Glob!.execute!({ pattern: "README.md" }, execOpts);
    expect(String(result)).toContain("README.md");
  });

  test("Read returns numbered lines", async () => {
    const tools = createBuiltinTools(mockCtx());
    const result = await tools.Read!.execute!(
      { path: "README.md", limit: 5 },
      execOpts,
    );
    expect(String(result)).toContain("Anvil");
  });

  test("plan mode excludes Write", () => {
    const tools = createBuiltinTools(mockCtx({ mode: "plan" }));
    expect(tools.Write).toBeUndefined();
    expect(tools.Read).toBeDefined();
  });
});
