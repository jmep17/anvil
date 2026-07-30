import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import {
  LIVE_PREVIEW_ROWS,
  LiveOutput,
  liveOutputRows,
  livePreview,
} from "./LiveOutput.tsx";

const COLUMNS = 60;

async function frameFor(thinking: string, streaming: string): Promise<string[]> {
  const { renderer, captureCharFrame, waitForVisualIdle } = await testRender(
    <LiveOutput thinking={thinking} streaming={streaming} columns={COLUMNS} />,
    { width: COLUMNS, height: 16 },
  );
  try {
    await waitForVisualIdle();
    return captureCharFrame()
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
  } finally {
    renderer.destroy();
  }
}

describe("live output preview", () => {
  test("shows reasoning as it arrives, under a thinking header", async () => {
    const lines = await frameFor("weighing the options", "");
    expect(lines[0]).toContain("Thinking");
    expect(lines.join("\n")).toContain("weighing the options");
  });

  test("keeps the tail of long reasoning, not the head", async () => {
    const thinking = Array.from({ length: 40 }, (_, i) => `reasoning step ${i}`).join("\n");
    const preview = livePreview(thinking, "", COLUMNS);

    expect(preview.lines.length).toBe(LIVE_PREVIEW_ROWS - 1);
    expect(preview.lines.at(-1)).toContain("reasoning step 39");
    expect(preview.lines.join("\n")).not.toContain("reasoning step 0");
  });

  test("prose replaces reasoning once the model starts answering", async () => {
    const lines = await frameFor("earlier reasoning", "here is the answer");
    expect(lines.join("\n")).toContain("here is the answer");
    expect(lines.join("\n")).not.toContain("earlier reasoning");
    expect(lines.join("\n")).not.toContain("Thinking");
  });

  test("never exceeds the rows it reserves", async () => {
    const thinking = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const streaming = Array.from({ length: 40 }, (_, i) => `prose ${i}`).join("\n");

    for (const [t, s] of [
      ["", ""],
      [thinking, ""],
      ["", streaming],
      [thinking, streaming],
    ] as const) {
      const rows = liveOutputRows(t, s, COLUMNS);
      expect(rows).toBeLessThanOrEqual(LIVE_PREVIEW_ROWS);
      expect(rows).toBe((await frameFor(t, s)).length);
    }
  });

  test("reserves nothing when there is nothing in flight", () => {
    expect(liveOutputRows("", "", COLUMNS)).toBe(0);
    expect(liveOutputRows("   \n  ", "  ", COLUMNS)).toBe(0);
  });

  test("wraps to the available width", () => {
    const preview = livePreview("", "x".repeat(200), 40);
    for (const line of preview.lines) expect(line.length).toBeLessThanOrEqual(38);
  });
});
