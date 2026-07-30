import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CONFIG,
  DEFAULT_CONTEXT_CONFIG,
  DEFAULT_SKILLS_CONFIG,
  DEFAULT_UI_CONFIG,
  type AnvilConfig,
} from "../config/types.ts";
import { errorMessage, runAgent } from "./loop.ts";

describe("errorMessage", () => {
  test("includes a nested provider response body", () => {
    const error = Object.assign(new Error("Bad Request"), {
      lastError: Object.assign(new Error("provider"), {
        responseBody: '{"error":{"message":"unsupported schema"}}',
      }),
    });
    expect(errorMessage(error)).toContain("unsupported schema");
  });
});

/**
 * The failure this guards against is a local server that accepts the request
 * and then goes quiet — no tokens, no error, no close. Anvil used to wait on
 * that for as long as the user let it.
 */
describe("a silent model server", () => {
  test("gives up on its own rather than waiting forever", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        if (new URL(request.url).pathname.endsWith("/models")) {
          return Response.json({ data: [{ id: "test-model" }] });
        }
        // Accepted, held open, never written to.
        return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    });
    const cwd = await mkdtemp(join(tmpdir(), "anvil-loop-"));
    const config: AnvilConfig = {
      ...DEFAULT_CONFIG,
      baseURL: `http://localhost:${server.port}/v1`,
      model: "test-model",
      maxSteps: 1,
      skills: { ...DEFAULT_SKILLS_CONFIG, autoDetect: false },
      context: { ...DEFAULT_CONTEXT_CONFIG },
      ui: { ...DEFAULT_UI_CONFIG },
      timeouts: { firstChunkMs: 400, chunkMs: 400, toolMs: 400 },
    } as AnvilConfig;

    const startedAt = Date.now();
    const errors: string[] = [];
    try {
      await expect(
        runAgent({
          config,
          cwd,
          messages: [{ role: "user", content: "hello" }],
          askPermission: async () => "deny",
          onEvent: (event) => {
            if (event.type === "error") errors.push(event.message);
          },
          skipMcp: true,
        }),
        // Not "operation was aborted": the user did not interrupt anything.
      ).rejects.toThrow(/went quiet/);
      // Well inside the wait a user would otherwise be subjected to.
      expect(Date.now() - startedAt).toBeLessThan(15_000);
      expect(errors.join("\n")).toContain("waiting for the model to start responding");
    } finally {
      server.stop(true);
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
