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

describe("App", () => {
  test("boots with a welcome block, a prompt and a status footer", async () => {
    const session = await SessionStore.create(cwd);
    const { renderer, waitForFrame, captureCharFrame } = await testRender(
      <App config={config()} cwd={cwd} session={session} />,
      { width: 90, height: 26 },
    );
    try {
      await waitForFrame((frame) => frame.includes("Welcome to Anvil"), { maxPasses: 200 });
      const frame = captureCharFrame();

      // Welcome block, shown once in the transcript rather than pinned as chrome.
      expect(frame).toContain("✻ Welcome to Anvil");
      expect(frame).toContain("/help for commands");
      expect(frame).toContain(cwd);

      // Prompt and its placeholder.
      expect(frame).toContain("Ask Anvil");

      // Footer carries the status that used to occupy a four-row header.
      expect(frame).toContain("? for shortcuts");
      expect(frame).toContain("build · test-model");

      // The old always-on header is gone.
      expect(frame).not.toContain("◈ ANVIL");
      expect(frame).not.toContain("LOCAL AGENT");
      expect(frame).not.toContain("REQUEST · READY");
    } finally {
      renderer.destroy();
    }
  });

  test("an unreachable model server is reported in the transcript and the footer", async () => {
    const session = await SessionStore.create(cwd);
    const { renderer, waitForFrame } = await testRender(
      <App config={config()} cwd={cwd} session={session} />,
      { width: 90, height: 26 },
    );
    try {
      const frame = await waitForFrame((f) => f.includes("⏺ Error"), { maxPasses: 400 });
      expect(frame).toContain("Cannot reach");
      expect(frame).toContain("offline");
    } finally {
      renderer.destroy();
    }
  });
});
