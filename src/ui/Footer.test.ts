import { describe, expect, test } from "bun:test";
import { footerHint, footerStatus } from "./Footer.tsx";

describe("footerHint", () => {
  test("prioritizes plan review actions", () => {
    expect(footerHint({ busy: false, planReview: "ready" })).toContain("approve & implement");
    expect(footerHint({ busy: false, planReview: "denying" })).toContain("revise");
  });

  test("points at /help when there is nothing more urgent", () => {
    expect(footerHint({ busy: false })).toBe("? for shortcuts");
  });

  test("offers interrupt and reports the queue while busy", () => {
    expect(footerHint({ busy: true })).toContain("esc interrupt");
    expect(footerHint({ busy: true, queued: 2 })).toContain("2 queued");
  });

  test("stays on one line in every state", () => {
    const states = [
      { busy: false },
      { busy: true, queued: 3 },
      { busy: false, showConfig: true },
      { busy: false, filePicker: true },
      { busy: false, commandPicker: true },
      { busy: false, browsingHistory: true },
      { busy: false, planReview: "ready" as const },
      { busy: false, editorMode: "vim" as const, vimMode: "normal" as const },
    ];
    for (const state of states) {
      expect(footerHint(state).length).toBeLessThanOrEqual(60);
      expect(footerHint(state)).not.toContain("\n");
    }
  });
});

describe("footerStatus", () => {
  test("shows mode, model and context usage", () => {
    expect(footerStatus({ mode: "build", model: "qwen", contextUsed: 0.34 })).toBe(
      "build · qwen · 34% context",
    );
  });

  test("omits context when nothing has been used yet", () => {
    expect(footerStatus({ mode: "plan", model: "qwen" })).toBe("plan · qwen");
  });

  test("flags an offline server", () => {
    expect(footerStatus({ mode: "build", model: "qwen", online: false })).toContain("offline");
  });

  test("clamps a context estimate that overshoots the window", () => {
    expect(footerStatus({ mode: "build", model: "qwen", contextUsed: 1.4 })).toContain(
      "100% context",
    );
  });
});
