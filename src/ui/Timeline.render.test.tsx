import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { Timeline } from "./Timeline.tsx";
import type { TimelineItem } from "./types.ts";

async function frameFor(items: TimelineItem[], width = 72, height = 24): Promise<string> {
  const { renderer, captureCharFrame, waitForVisualIdle } = await testRender(
    <Timeline items={items} columns={width} />,
    { width, height },
  );
  try {
    await waitForVisualIdle();
    return captureCharFrame();
  } finally {
    renderer.destroy();
  }
}

describe("Timeline rendering", () => {
  test("a user turn is a single quoted line, not a bordered block", async () => {
    const frame = await frameFor([{ kind: "user", id: "u1", text: "fix the parser" }]);
    expect(frame).toContain("> fix the parser");
    // The old treatment drew a left border *and* a literal bar per line.
    expect(frame).not.toContain("│ │");
    expect(frame).not.toContain("YOU");
  });

  test("a completed tool shows a bullet and a summarized result", async () => {
    const frame = await frameFor([
      {
        kind: "tool",
        id: "t1",
        name: "Read",
        input: { path: "src/cli.ts" },
        status: "done",
        output: "     1|one\n     2|two\n     3|three\n",
        ms: 42,
      },
    ]);
    expect(frame).toContain("⏺ Read(src/cli.ts)");
    expect(frame).toContain("⎿");
    expect(frame).toContain("3 lines");
    // The raw output stays hidden until it is expanded.
    expect(frame).not.toContain("|one");
  });

  test("expandAll reveals the full tool output", async () => {
    const items: TimelineItem[] = [
      {
        kind: "tool",
        id: "t1",
        name: "Read",
        input: { path: "src/cli.ts" },
        status: "done",
        output: "     1|distinctive-content",
      },
    ];
    const { renderer, captureCharFrame, waitForVisualIdle } = await testRender(
      <Timeline items={items} columns={72} expandAll />,
      { width: 72, height: 24 },
    );
    try {
      await waitForVisualIdle();
      expect(captureCharFrame()).toContain("distinctive-content");
    } finally {
      renderer.destroy();
    }
  });

  test("a failed tool is reported on the result line", async () => {
    const frame = await frameFor([
      {
        kind: "tool",
        id: "t1",
        name: "Bash",
        input: { command: "false" },
        status: "error",
        output: "Error: permission denied for Bash",
      },
    ]);
    expect(frame).toContain("⏺ Bash(false)");
    expect(frame).toContain("permission denied");
  });

  test("todos render as a checklist with completed items struck through", async () => {
    const frame = await frameFor([
      {
        kind: "todos",
        id: "td1",
        todos: [
          { id: "1", content: "wire the picker", status: "completed" },
          { id: "2", content: "add the spinner", status: "in_progress" },
          { id: "3", content: "write tests", status: "pending" },
        ],
      },
    ]);
    expect(frame).toContain("Update Todos");
    expect(frame).toContain("☒ wire the picker");
    expect(frame).toContain("◐ add the spinner");
    expect(frame).toContain("☐ write tests");
  });

  test("errors are labelled once and shown in full", async () => {
    const frame = await frameFor([
      { kind: "error", id: "e1", text: "Cannot reach the model server" },
    ]);
    expect(frame).toContain("⏺ Error");
    expect(frame).toContain("Cannot reach the model server");
  });

  // Assistant and plan bodies go through OpenTUI's markdown renderable, whose
  // tree-sitter client is unavailable under the test renderer — the body text
  // cannot be asserted here. The surrounding chrome still can.
  test("assistant prose carries no label or gutter of its own", async () => {
    const frame = await frameFor([{ kind: "assistant", id: "a1", text: "Here is what I found." }]);
    expect(frame).not.toContain("ANVIL");
    expect(frame).not.toContain("╭─");
    expect(frame).not.toContain("│");
  });

  test("a plan is labelled above its body", async () => {
    const frame = await frameFor([{ kind: "plan", id: "p1", text: "## Summary" }]);
    expect(frame).toContain("⏺ Plan for review");
  });

  test("no scrollbar is drawn even when the content overflows", async () => {
    const many: TimelineItem[] = Array.from({ length: 40 }, (_, i) => ({
      kind: "user" as const,
      id: `u${i}`,
      text: `message number ${i}`,
    }));
    const frame = await frameFor(many, 72, 12);

    // The scrollbar track and thumb glyphs OpenTUI would otherwise draw.
    for (const glyph of ["█", "▓", "▒", "░", "▐", "▌"]) {
      expect(frame).not.toContain(glyph);
    }
  });

  test("a status line hugs what it annotates, turns and tools breathe", async () => {
    const frame = await frameFor([
      { kind: "user", id: "u1", text: "do the thing" },
      { kind: "status", id: "s1", text: "model=qwen mode=plan" },
      {
        kind: "tool",
        id: "t1",
        name: "Grep",
        input: { pattern: "x" },
        status: "done",
        output: "a\nb",
      },
    ]);
    const lines = frame.split("\n").map((line) => line.trimEnd());
    const at = (needle: string) => lines.findIndex((line) => line.includes(needle));

    // Status sits directly under the turn it describes...
    expect(at("· model=qwen")).toBe(at("> do the thing") + 1);
    // ...and the tool block gets a blank line of its own.
    expect(lines[at("⏺ Grep") - 1]).toBe("");
  });

  test("a fast tool is not stamped with a duration", async () => {
    const frame = await frameFor([
      {
        kind: "tool",
        id: "t1",
        name: "Read",
        input: { path: "a.ts" },
        status: "done",
        output: "x",
        ms: 40,
      },
    ]);
    expect(frame).not.toContain("40ms");
    expect(frame).toContain("⏺ Read(a.ts)");
  });

  test("a slow tool still reports how long it took", async () => {
    const frame = await frameFor([
      {
        kind: "tool",
        id: "t1",
        name: "Bash",
        input: { command: "bun test" },
        status: "done",
        output: "x",
        ms: 4200,
      },
    ]);
    expect(frame).toContain("4.2s");
  });

  test("the expand hint appears once, on the newest row", async () => {
    const two: TimelineItem[] = [
      {
        kind: "tool",
        id: "t1",
        name: "Read",
        input: { path: "a.ts" },
        status: "done",
        output: "x",
      },
      {
        kind: "tool",
        id: "t2",
        name: "Read",
        input: { path: "b.ts" },
        status: "done",
        output: "y",
      },
    ];
    const frame = await frameFor(two);
    const lines = frame.split("\n");
    const hintRows = lines.flatMap((line, i) => (line.includes("ctrl+o") ? [i] : []));

    expect(hintRows).toHaveLength(1);
    // It hangs off the newest call's result row, not the older one's.
    expect(hintRows[0]).toBeGreaterThan(lines.findIndex((l) => l.includes("b.ts")));
  });

  test("thinking is labelled and indented", async () => {
    const frame = await frameFor([{ kind: "thinking", id: "th1", text: "weighing options" }]);
    expect(frame).toContain("✻ Thinking…");
    expect(frame).toContain("weighing options");
    // The old live block leaked box-art into the title.
    expect(frame).not.toContain("╭─");
  });
});
