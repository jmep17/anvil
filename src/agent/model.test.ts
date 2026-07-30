import { afterEach, describe, expect, test } from "bun:test";
import { streamText } from "ai";
import type { AnvilConfig } from "../config/types.ts";
import { createModel } from "./model.ts";

/**
 * Reasoning models behind LM Studio's OpenAI-compatible endpoint stream their
 * chain of thought inline, wrapped in <think>…</think>. Nothing in the provider
 * separates it, so this checks the model Anvil builds does.
 */

let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
  server?.stop(true);
  server = undefined;
});

function chunk(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({
    id: "chunk",
    object: "chat.completion.chunk",
    created: 0,
    model: "test-model",
    choices: [{ index: 0, delta, finish_reason: null }],
  })}\n\n`;
}

/** A server that streams `pieces` back as one content delta each. */
function serveDeltas(pieces: string[]): string {
  server = Bun.serve({
    port: 0,
    fetch() {
      const body = [
        ...pieces.map((text) => chunk({ content: text })),
        `data: ${JSON.stringify({
          id: "chunk",
          object: "chat.completion.chunk",
          created: 0,
          model: "test-model",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        })}\n\n`,
        "data: [DONE]\n\n",
      ].join("");
      return new Response(body, {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  return `http://localhost:${server.port}/v1`;
}

function configFor(baseURL: string): AnvilConfig {
  return { baseURL, apiKey: "test", model: "test-model" } as AnvilConfig;
}

async function collect(pieces: string[]): Promise<{ reasoning: string; text: string }> {
  const result = streamText({
    model: createModel(configFor(serveDeltas(pieces))),
    messages: [{ role: "user", content: "hi" }],
  });
  let reasoning = "";
  let text = "";
  for await (const part of result.fullStream) {
    if (part.type === "reasoning-delta") reasoning += part.text;
    else if (part.type === "text-delta") text += part.text;
  }
  return { reasoning, text };
}

describe("createModel", () => {
  test("streams an inline <think> block as reasoning, not as the answer", async () => {
    const { reasoning, text } = await collect([
      "<think>",
      "weighing ",
      "the options",
      "</think>",
      "Here is ",
      "the answer.",
    ]);

    expect(reasoning).toContain("weighing the options");
    expect(text).toContain("Here is the answer.");
    expect(text).not.toContain("weighing the options");
    expect(text).not.toContain("<think>");
  });

  test("passes a response with no reasoning through untouched", async () => {
    const { reasoning, text } = await collect(["Just ", "an answer."]);

    expect(reasoning).toBe("");
    expect(text).toBe("Just an answer.");
  });
});
