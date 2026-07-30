import { describe, expect, test } from "bun:test";
import { buildTranscriptLines, streamDisplayLines } from "./Timeline.tsx";

describe("buildTranscriptLines", () => {
  test("renders every tool input and output character in narrow terminals", () => {
    const input = { path: `src/${"deep/".repeat(12)}file.ts`, offset: 123 };
    const output = `first line\n${"z".repeat(61)}\nlast line`;
    const lines = buildTranscriptLines([
      { kind: "tool", id: "tool-1", name: "Read", input, output, status: "done", ms: 12 },
    ], 18);
    const content = lines.map((line) => line.text.replace(/^│  /, "")).join("\n");

    expect(content.replace(/\s/g, "")).toContain("Read·complete·12ms");
    expect(content.replace(/\s/g, "")).toContain('"offset":123');
    expect(content.replace(/\n/g, "")).toContain("z".repeat(61));
    expect(content).toContain("first line");
    expect(content).toContain("last line");
  });

  test("keeps active tools, reasoning, and streamed output in the same transcript", () => {
    const lines = buildTranscriptLines(
      [{ kind: "tool", id: "tool-1", name: "Glob", input: { pattern: "**/*" }, status: "running" }],
      80,
      "checking every file",
      "still streaming",
    );
    const content = lines.map((line) => line.text).join("\n");

    expect(content).toContain("Glob · running");
    expect(content).toContain("checking every file");
    expect(content).toContain("still streaming");
  });

  test("keeps assistant text interleaved with tools (not all tools then all text)", () => {
    const lines = buildTranscriptLines(
      [
        { kind: "user", id: "u-1", text: "refactor helpers" },
        { kind: "assistant", id: "a-1", text: "I will inspect the helpers first." },
        {
          kind: "tool",
          id: "tool-1",
          name: "Read",
          input: { path: "src/helpers.ts" },
          status: "done",
          output: "export const x = 1",
          ms: 5,
        },
        { kind: "assistant", id: "a-2", text: "Next I will update the call sites." },
        {
          kind: "tool",
          id: "tool-2",
          name: "Grep",
          input: { pattern: "helpers" },
          status: "done",
          output: "src/app.ts:1",
          ms: 8,
        },
        { kind: "assistant", id: "a-3", text: "Done." },
      ],
      80,
    );
    const content = lines.map((line) => line.text).join("\n");
    const first = content.indexOf("I will inspect the helpers first.");
    const tool1 = content.indexOf("╭─ ✓ Read");
    const second = content.indexOf("Next I will update the call sites.");
    const tool2 = content.indexOf("╭─ ✓ Grep");
    const third = content.indexOf("Done.");

    expect(first).toBeGreaterThan(-1);
    expect(tool1).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(tool1);
    expect(tool2).toBeGreaterThan(second);
    expect(third).toBeGreaterThan(tool2);
  });

  test("labels plan output for review", () => {
    const lines = buildTranscriptLines(
      [{ kind: "plan", id: "p-1", text: "1. Update the parser" }],
      80,
    );
    expect(lines.map((line) => line.text).join("\n")).toContain("plan for review");
  });
});

describe("streamDisplayLines", () => {
  test("preserves every streamed character without Markdown reformatting", () => {
    const text = "## still typing\n`partial code`\n" + "x".repeat(70);
    const lines = streamDisplayLines(text, 20);

    expect(lines.join("\n")).toContain("## still");
    expect(lines.join("\n")).toContain("`partial code`");
    expect(lines.join("\n").replace(/\n/g, "")).toContain("x".repeat(70));
  });
});
