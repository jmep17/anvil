import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { compactMessages, estimateTokens } from "./compact.ts";

describe("compactMessages", () => {
  test("leaves short histories alone", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(compactMessages(messages, 16384)).toEqual(messages);
  });

  test("inserts summary when oversized", () => {
    const messages: ModelMessage[] = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: "x".repeat(2000),
    })) as ModelMessage[];
    const next = compactMessages(messages, 2000, 4);
    expect(next.length).toBeLessThan(messages.length);
    expect(estimateTokens(next)).toBeLessThan(estimateTokens(messages));
    expect(JSON.stringify(next)).toContain("Context compacted");
  });

  test("retains recent omitted user requests in the checkpoint", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "first task" },
      { role: "assistant", content: "ack" },
      { role: "user", content: "Preserve the migration decision" },
      { role: "assistant", content: "x".repeat(5000) },
      { role: "user", content: "Keep the error message concise" },
      { role: "assistant", content: "x".repeat(5000) },
      { role: "user", content: "Most recent request" },
      { role: "assistant", content: "latest answer" },
    ];
    const next = compactMessages(messages, 2000, 2);
    const checkpoint = next[2];
    expect(JSON.stringify(checkpoint)).toContain("Preserve the migration decision");
    expect(JSON.stringify(checkpoint)).toContain("Keep the error message concise");
  });
});
