import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { DEFAULT_CONFIG, DEFAULT_CONTEXT_CONFIG, DEFAULT_SKILLS_CONFIG, DEFAULT_UI_CONFIG } from "../config/types.ts";
import { SessionStore } from "../session/store.ts";
import { App } from "./App.tsx";

const originalHome = process.env.HOME;
let home = "";
let cwd = "";

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "anvil-home-"));
  cwd = await mkdtemp(join(tmpdir(), "anvil-cwd-"));
  process.env.HOME = home;
});

afterAll(async () => {
  process.env.HOME = originalHome;
  await rm(home, { recursive: true, force: true });
  await rm(cwd, { recursive: true, force: true });
});

/** The app's real renderer shape: pinned footer, transcript in scrollback. */
const SPLIT = {
  width: 90,
  height: 26,
  screenMode: "split-footer" as const,
  externalOutputMode: "capture-stdout" as const,
  footerHeight: 6,
};

function config() {
  return {
    ...DEFAULT_CONFIG,
    // A port nothing is listening on, so the offline path runs quickly.
    baseURL: "http://127.0.0.1:1/v1",
    model: "test-model",
    skills: { ...DEFAULT_SKILLS_CONFIG },
    context: { ...DEFAULT_CONTEXT_CONFIG },
    ui: { ...DEFAULT_UI_CONFIG },
  };
}

function completionChunk(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({
    id: "chunk",
    object: "chat.completion.chunk",
    created: 0,
    model: "test-model",
    choices: [{ index: 0, delta, finish_reason: null }],
  })}\n\n`;
}

/**
 * A stand-in for LM Studio that streams `pieces` slowly enough for the pinned
 * region to be sampled mid-turn, then holds the connection open.
 */
function serveModel(pieces: string[]): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname.endsWith("/models")) {
        return Response.json({ data: [{ id: "test-model" }] });
      }
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          for (const piece of pieces) {
            controller.enqueue(encoder.encode(completionChunk({ content: piece })));
            await Bun.sleep(60);
          }
          // Deliberately never closed: the turn stays in flight so the live
          // preview is what the frame shows.
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    },
  });
}

/**
 * `waitForFrame` counts render passes, not time, so it exhausts its budget in
 * milliseconds — no use for anything waiting on a socket. This samples the
 * pinned region against the clock instead.
 */
async function pollFrame(
  setup: { renderOnce: () => Promise<void>; captureCharFrame: () => string },
  predicate: (frame: string) => boolean,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let frame = "";
  while (Date.now() < deadline) {
    await Bun.sleep(25);
    await setup.renderOnce();
    frame = setup.captureCharFrame();
    if (predicate(frame)) return frame;
  }
  throw new Error(`timed out waiting for frame; last frame:\n${frame}`);
}

describe("App", () => {
  test("boots with a welcome block, a prompt and a status footer", async () => {
    const session = await SessionStore.create(cwd);
    const { renderer, externalOutput, waitForFrame, waitForVisualIdle } = await testRender(
      <App config={config()} cwd={cwd} session={session} />,
      SPLIT,
    );
    try {
      // The prompt and status live in the pinned region React owns.
      const frame = await waitForFrame((f) => f.includes("Ask Anvil"), { maxPasses: 400 });
      expect(frame).toContain("? for shortcuts");
      expect(frame).toContain("build · test-model");

      // The welcome block goes to the terminal's scrollback, above the footer.
      await waitForVisualIdle();
      const scrollback = externalOutput.takeText();
      expect(scrollback).toContain("✻ Welcome to Anvil");
      expect(scrollback).toContain("/help for commands");
      expect(scrollback).toContain(cwd);
      // It is not painted into the pinned region.
      expect(frame).not.toContain("Welcome to Anvil");
    } finally {
      renderer.destroy();
    }
  });

  test("an unreachable model server is reported in the transcript and the footer", async () => {
    const session = await SessionStore.create(cwd);
    const { renderer, externalOutput, waitForFrame, waitForVisualIdle } = await testRender(
      <App config={config()} cwd={cwd} session={session} />,
      SPLIT,
    );
    try {
      // The footer reports the connection state...
      const frame = await waitForFrame((f) => f.includes("offline"), { maxPasses: 400 });
      expect(frame).toContain("offline");

      // ...and the failure itself is written to the transcript.
      await waitForVisualIdle();
      const scrollback = externalOutput.takeText();
      expect(scrollback).toContain("⏺ Error");
      expect(scrollback).toContain("Cannot reach");
    } finally {
      renderer.destroy();
    }
  });

  test("reasoning streams into the pinned region while the turn runs", async () => {
    const server = serveModel(["<think>", "weighing the options", " carefully"]);
    const session = await SessionStore.create(cwd);
    const setup = await testRender(
      <App
        config={{ ...config(), baseURL: `http://localhost:${server.port}/v1` }}
        cwd={cwd}
        session={session}
        yes
        initialPrompt="hello"
      />,
      SPLIT,
    );
    const { renderer } = setup;
    try {
      const frame = await pollFrame(setup, (f) => f.includes("weighing the options"));
      expect(frame).toContain("Thinking");
    } finally {
      renderer.destroy();
      server.stop(true);
    }
  }, 20_000);

  test("streamed prose replaces the reasoning preview", async () => {
    const server = serveModel(["<think>secret reasoning</think>", "the visible answer"]);
    const session = await SessionStore.create(cwd);
    const setup = await testRender(
      <App
        config={{ ...config(), baseURL: `http://localhost:${server.port}/v1` }}
        cwd={cwd}
        session={session}
        yes
        initialPrompt="hello"
      />,
      SPLIT,
    );
    const { renderer } = setup;
    try {
      const frame = await pollFrame(setup, (f) => f.includes("the visible answer"));
      expect(frame).not.toContain("secret reasoning");
    } finally {
      renderer.destroy();
      server.stop(true);
    }
  }, 20_000);
});
