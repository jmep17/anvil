import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { DECISION_CHECKPOINT, currentTimeNote, nextStepNudge, withNudge } from "./discipline.ts";

const conversation: ModelMessage[] = [
  { role: "user", content: "fix the parser" },
  { role: "assistant", content: "looking" },
];

describe("nextStepNudge", () => {
  test("re-anchors the model after a tool result", () => {
    expect(nextStepNudge(true)).toBe(DECISION_CHECKPOINT);
  });

  test("stays quiet when no tool ran", () => {
    expect(nextStepNudge(false)).toBeNull();
  });

  test("carries the exact time, which the system prompt no longer can", () => {
    const nudge = nextStepNudge(false, "17:42 (BST, UTC+01:00)");
    expect(nudge).toBe(currentTimeNote("17:42 (BST, UTC+01:00)"));
  });

  test("carries the time alongside the checkpoint after a tool result", () => {
    const nudge = nextStepNudge(true, "17:42 (BST, UTC+01:00)")!;
    expect(nudge).toContain("17:42");
    expect(nudge).toContain(DECISION_CHECKPOINT);
  });
});

describe("withNudge", () => {
  test("appends the nudge at the end, leaving the prefix untouched", () => {
    const next = withNudge(conversation, DECISION_CHECKPOINT);

    expect(next).toHaveLength(conversation.length + 1);
    // Everything before the nudge is identical, so a cached prompt prefix
    // stays valid and only the new tokens need encoding.
    expect(next.slice(0, conversation.length)).toEqual(conversation);
    expect(next.at(-1)).toEqual({ role: "user", content: DECISION_CHECKPOINT });
  });

  test("returns the original array when there is nothing to add", () => {
    expect(withNudge(conversation, null)).toBe(conversation);
  });

  test("does not mutate the conversation it was given", () => {
    const before = [...conversation];
    withNudge(conversation, DECISION_CHECKPOINT);
    expect(conversation).toEqual(before);
  });
});
