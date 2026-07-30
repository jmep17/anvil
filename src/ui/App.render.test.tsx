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
});
