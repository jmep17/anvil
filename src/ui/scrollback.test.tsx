import { beforeAll, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { commitItems, commitWelcome, itemLines, spacingBefore } from "./scrollback.ts";
import { warmMarkdownParser } from "./theme.ts";
import type { TimelineItem } from "./types.ts";

beforeAll(async () => {
  await warmMarkdownParser();
});

/** Commit items into a split-footer renderer and return the scrollback text. */
async function transcript(items: TimelineItem[], width = 76): Promise<string> {
  const { renderer, externalOutput, waitForVisualIdle } = await testRender(
    <box>
      <text>{"> "}</text>
    </box>,
    {
      width,
      height: 12,
      screenMode: "split-footer",
      footerHeight: 3,
      externalOutputMode: "capture-stdout",
    },
  );
  try {
    await waitForVisualIdle();
    await commitItems(renderer, items);
    await waitForVisualIdle();
    return externalOutput.takeText();
  } finally {
    renderer.destroy();
  }
}

describe("spacingBefore", () => {
  const user: TimelineItem = { kind: "user", id: "u", text: "x" };
  const tool: TimelineItem = {
    kind: "tool",
    id: "t",
    name: "Read",
    input: {},
    status: "done",
  };

  test("the first item has nothing above it", () => {
    expect(spacingBefore(user, undefined)).toBe(0);
  });

  test("a status line hugs whatever it annotates", () => {
    expect(spacingBefore({ kind: "status", id: "s", text: "x" }, user)).toBe(0);
  });

  test("consecutive tool calls stack as one block", () => {
    expect(spacingBefore(tool, tool)).toBe(0);
  });

  test("anything else gets a blank line", () => {
    expect(spacingBefore(user, tool)).toBe(1);
    expect(spacingBefore(tool, user)).toBe(1);
  });
});

describe("itemLines", () => {
  test("a tool call and its outcome share one row", () => {
    const [line] = itemLines(
      {
        kind: "tool",
        id: "t",
        name: "Read",
        input: { path: "src/cli.ts" },
        status: "done",
        output: "a\nb\nc",
      },
      76,
    );
    expect(line!.text).toBe("⏺ Read(src/cli.ts) · 3 lines");
  });

  test("expanding appends the payload beneath the row", () => {
    const lines = itemLines(
      {
        kind: "tool",
        id: "t",
        name: "Read",
        input: { path: "a.ts" },
        status: "done",
        output: "distinctive",
      },
      76,
      true,
    );
    expect(lines[0]!.text).toContain("⏺ Read(a.ts)");
    expect(lines.some((l) => l.text.includes("distinctive"))).toBe(true);
  });

  test("markdown kinds are rendered elsewhere", () => {
    expect(itemLines({ kind: "assistant", id: "a", text: "hi" }, 76)).toEqual([]);
  });
});

describe("committed transcript", () => {
  test("a user turn is one quoted line", async () => {
    const out = await transcript([{ kind: "user", id: "u1", text: "fix the parser" }]);
    expect(out).toContain("> fix the parser");
  });

  test("tool calls stack tight, other kinds get a blank line", async () => {
    const out = await transcript([
      { kind: "user", id: "u1", text: "do it" },
      { kind: "status", id: "s1", text: "model=qwen" },
      { kind: "tool", id: "t1", name: "Grep", input: { pattern: "x" }, status: "done", output: "a\nb" },
      { kind: "tool", id: "t2", name: "Read", input: { path: "a.ts" }, status: "done", output: "c" },
    ]);
    const rows = out.split("\n").map((r) => r.trimEnd());
    const at = (needle: string) => rows.findIndex((r) => r.includes(needle));

    expect(at("· model=qwen")).toBe(at("> do it") + 1);
    expect(rows[at("⏺ Grep") - 1]).toBe("");
    // Consecutive tools are adjacent.
    expect(at("⏺ Read(a.ts)")).toBe(at("⏺ Grep") + 1);
  });

  test("markdown is parsed, not written with its markers", async () => {
    const out = await transcript([
      {
        kind: "assistant",
        id: "a1",
        text: "## A heading\n\nSome **bold** and `code`.\n\n- first\n- second\n",
      },
    ]);

    expect(out).toContain("A heading");
    expect(out).toContain("bold");
    expect(out).toContain("first");
    // settle() guarantees highlighting landed before the rows were committed.
    expect(out).not.toContain("##");
    expect(out).not.toContain("**");
    expect(out).not.toContain("`code`");
  });

  test("a plan is labelled above its body", async () => {
    const out = await transcript([{ kind: "plan", id: "p1", text: "## Summary\n\nDo the thing." }]);
    expect(out).toContain("⏺ Plan for review");
    expect(out).toContain("Do the thing.");
  });

  test("todos render as a checklist", async () => {
    const out = await transcript([
      {
        kind: "todos",
        id: "td",
        todos: [
          { id: "1", content: "read the loop", status: "completed" },
          { id: "2", content: "check the tools", status: "in_progress" },
          { id: "3", content: "write it up", status: "pending" },
        ],
      },
    ]);
    expect(out).toContain("⏺ Update Todos");
    expect(out).toContain("☒ read the loop");
    expect(out).toContain("◐ check the tools");
    expect(out).toContain("☐ write it up");
  });

  test("an error is labelled and shown in full", async () => {
    const out = await transcript([
      { kind: "error", id: "e1", text: "Cannot reach the model server" },
    ]);
    expect(out).toContain("⏺ Error");
    expect(out).toContain("Cannot reach the model server");
  });

  test("the welcome block is committed at the top", async () => {
    const { renderer, externalOutput, waitForVisualIdle } = await testRender(
      <box>
        <text>{"> "}</text>
      </box>,
      { width: 76, height: 12, screenMode: "split-footer", footerHeight: 3, externalOutputMode: "capture-stdout" },
    );
    try {
      await waitForVisualIdle();
      commitWelcome(renderer, { cwd: "/repo", model: "qwen" });
      await commitItems(renderer, [{ kind: "user", id: "u1", text: "hello" }]);
      await waitForVisualIdle();

      const rows = externalOutput.takeText().split("\n");
      expect(rows[0]).toContain("╭");
      expect(rows.findIndex((r) => r.includes("Welcome to Anvil"))).toBeLessThan(
        rows.findIndex((r) => r.includes("> hello")),
      );
      expect(externalOutput.takeText).toBeDefined();
    } finally {
      renderer.destroy();
    }
  });
});
