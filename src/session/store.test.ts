import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { SessionStore } from "./store.ts";

const originalHome = process.env.ANVIL_HOME;
let testHome: string | undefined;

afterEach(async () => {
  if (testHome) await rm(testHome, { recursive: true, force: true });
  testHome = undefined;
  if (originalHome === undefined) delete process.env.ANVIL_HOME;
  else process.env.ANVIL_HOME = originalHome;
});

describe("SessionStore transcript", () => {
  test("persists timeline records independently from model messages", async () => {
    testHome = await mkdtemp(join(tmpdir(), "anvil-home-"));
    process.env.ANVIL_HOME = testHome;
    const cwd = join(testHome, "project");
    const session = await SessionStore.create(cwd, "resume-me");
    await session.appendMessage({ role: "user", content: "hello" });
    await session.appendTimelineItem({ kind: "user", id: "u-1", text: "hello" });
    await session.appendTimelineItem({ kind: "assistant", id: "a-1", text: "hi" });

    const reopened = await SessionStore.open(cwd, "resume-me");
    expect(await reopened.loadMessages()).toEqual([{ role: "user", content: "hello" }]);
    expect(await reopened.loadTimeline()).toEqual([
      { kind: "user", id: "u-1", text: "hello" },
      { kind: "assistant", id: "a-1", text: "hi" },
    ]);
  });
});
