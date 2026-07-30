import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { SkillInfo } from "../skills/types.ts";
import { createBuiltinTools } from "./index.ts";
import type { ToolContext } from "./types.ts";
import { requirePermission, resolveProjectMutationPath } from "./types.ts";

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

  test("mutation paths cannot escape the project, including through symlinks", async () => {
    const project = await mkdtemp(join(tmpdir(), "anvil-project-"));
    const outside = await mkdtemp(join(tmpdir(), "anvil-outside-"));
    try {
      expect(await resolveProjectMutationPath(project, "../escape.txt")).toBeNull();
      await symlink(outside, join(project, "linked-outside"));
      expect(await resolveProjectMutationPath(project, "linked-outside/file.txt")).toBeNull();
      expect(await resolveProjectMutationPath(project, "nested/file.txt")).toEndWith(
        "/nested/file.txt",
      );
    } finally {
      await rm(project, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("session approval is limited to the exact approved action", async () => {
    let prompts = 0;
    const ctx = mockCtx({
      alwaysAllowed: new Set(),
      askPermission: async () => {
        prompts += 1;
        return "always";
      },
    });
    expect(await requirePermission(ctx, "Write", "file.ts", undefined, "one")).toBe(true);
    expect(await requirePermission(ctx, "Write", "file.ts", undefined, "one")).toBe(true);
    expect(await requirePermission(ctx, "Write", "file.ts", undefined, "two")).toBe(true);
    expect(prompts).toBe(2);
  });
});
