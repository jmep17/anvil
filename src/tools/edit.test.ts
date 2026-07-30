import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { SkillInfo } from "../skills/types.ts";
import { applyEdit } from "./edit.ts";
import { createBuiltinTools } from "./index.ts";
import type { PermissionDecision, ToolContext } from "./types.ts";

const execOpts = {
  toolCallId: "1",
  messages: [] as never[],
  abortSignal: new AbortController().signal,
  context: {},
};

function ctxFor(cwd: string, askPermission?: ToolContext["askPermission"]): ToolContext {
  return {
    cwd,
    mode: "build",
    alwaysAllowed: new Set<string>(),
    askPermission: askPermission ?? (async (): Promise<PermissionDecision> => "allow"),
    todos: [],
    runSubagent: async () => "ok",
    getSkillContent: async () => null,
    listSkills: async () => [] as SkillInfo[],
  };
}

describe("applyEdit", () => {
  // String.prototype.replace expands these in the replacement argument.
  test.each([["$&"], ["$1"], ["$`"], ["$'"], ["$$"]])(
    "inserts %s literally instead of expanding it",
    (token) => {
      expect(applyEdit("keep TARGET keep", "TARGET", token, false)).toBe(`keep ${token} keep`);
    },
  );

  test("replace_all is literal too", () => {
    expect(applyEdit("a X b X", "X", "$&", true)).toBe("a $& b $&");
  });

  test("single replacement touches only the first occurrence", () => {
    expect(applyEdit("X and X", "X", "Y", false)).toBe("Y and X");
  });
});

describe("Edit tool", () => {
  test("writes $-patterns to disk literally", async () => {
    const dir = await mkdtemp(join(tmpdir(), "anvil-edit-"));
    try {
      const file = join(dir, "sample.ts");
      await Bun.write(file, 'const re = "PLACEHOLDER";\n');
      const tools = createBuiltinTools(ctxFor(dir));
      await tools.Edit!.execute!(
        { path: "sample.ts", old_string: "PLACEHOLDER", new_string: "$1-$&-end" },
        execOpts,
      );
      expect(await Bun.file(file).text()).toBe('const re = "$1-$&-end";\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("does not prompt for an edit that cannot succeed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "anvil-edit-"));
    try {
      let prompts = 0;
      const tools = createBuiltinTools(
        ctxFor(dir, async () => {
          prompts += 1;
          return "allow";
        }),
      );
      const missing = await tools.Edit!.execute!(
        { path: "nope.ts", old_string: "a", new_string: "b" },
        execOpts,
      );
      expect(String(missing)).toContain("file not found");

      await Bun.write(join(dir, "sample.ts"), "hello\n");
      const absent = await tools.Edit!.execute!(
        { path: "sample.ts", old_string: "not-there", new_string: "b" },
        execOpts,
      );
      expect(String(absent)).toContain("old_string not found");
      expect(prompts).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("the approval preview is a unified diff", async () => {
    const dir = await mkdtemp(join(tmpdir(), "anvil-edit-"));
    try {
      await Bun.write(join(dir, "sample.ts"), "one\ntwo\nthree\n");
      let preview = "";
      const tools = createBuiltinTools(
        ctxFor(dir, async (_tool, _detail, shown) => {
          preview = shown ?? "";
          return "allow";
        }),
      );
      await tools.Edit!.execute!(
        { path: "sample.ts", old_string: "two", new_string: "TWO" },
        execOpts,
      );
      expect(preview).toContain("@@");
      expect(preview).toContain("-two");
      expect(preview).toContain("+TWO");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
