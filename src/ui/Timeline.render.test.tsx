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

  test("thinking is labelled and indented", async () => {
    const frame = await frameFor([{ kind: "thinking", id: "th1", text: "weighing options" }]);
    expect(frame).toContain("✻ Thinking…");
    expect(frame).toContain("weighing options");
    // The old live block leaked box-art into the title.
    expect(frame).not.toContain("╭─");
  });
});
