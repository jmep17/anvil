import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { relativeTime, SessionStore } from "./store.ts";

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

describe("SessionStore discovery", () => {
  async function project(): Promise<string> {
    testHome = await mkdtemp(join(tmpdir(), "anvil-home-"));
    process.env.ANVIL_HOME = testHome;
    return join(testHome, "project");
  }

  test("lists sessions newest first with a preview of the first request", async () => {
    const cwd = await project();
    const first = await SessionStore.create(cwd, "2024-01-01T00-00-00-000Z");
    await first.appendMessage({ role: "user", content: "fix the parser" });
    await first.appendMessage({ role: "assistant", content: "done" });
    const second = await SessionStore.create(cwd, "2024-06-01T00-00-00-000Z");
    await second.appendMessage({ role: "user", content: "add a test" });

    const sessions = await SessionStore.list(cwd);
    expect(sessions.map((s) => s.id)).toEqual([
      "2024-06-01T00-00-00-000Z",
      "2024-01-01T00-00-00-000Z",
    ]);
    expect(sessions[0]!.preview).toBe("add a test");
    expect(sessions[1]!.preview).toBe("fix the parser");
    expect(sessions[1]!.messageCount).toBe(2);
    expect(sessions[0]!.updatedAt).not.toBe("");
  });

  test("the preview skips inlined file bodies from @ mentions", async () => {
    const cwd = await project();
    const session = await SessionStore.create(cwd, "s1");
    await session.appendMessage({
      role: "user",
      content: 'review @a.ts\n\n<file path="a.ts">const x = 1;\nconst y = 2;</file>',
    });

    const [summary] = await SessionStore.list(cwd);
    expect(summary!.preview).toBe("review @a.ts");
  });

  test("respects the scan limit", async () => {
    const cwd = await project();
    for (let i = 0; i < 5; i++) await SessionStore.create(cwd, `s-${i}`);
    expect(await SessionStore.list(cwd, 3)).toHaveLength(3);
  });

  test("reports the most recent session, or nothing in an unused project", async () => {
    const cwd = await project();
    expect(await SessionStore.mostRecent(cwd)).toBeNull();
    await SessionStore.create(cwd, "2024-01-01T00-00-00-000Z");
    await SessionStore.create(cwd, "2024-09-01T00-00-00-000Z");
    expect(await SessionStore.mostRecent(cwd)).toBe("2024-09-01T00-00-00-000Z");
  });

  test("distinguishes an existing session from a mistyped id", async () => {
    const cwd = await project();
    await SessionStore.create(cwd, "real");
    expect(await (await SessionStore.open(cwd, "real")).exists()).toBe(true);
    expect(await (await SessionStore.open(cwd, "typo")).exists()).toBe(false);
  });

  test("a session with no user message still lists", async () => {
    const cwd = await project();
    await SessionStore.create(cwd, "empty");
    const [summary] = await SessionStore.list(cwd);
    expect(summary!.preview).toBe("");
    expect(summary!.messageCount).toBe(0);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2024-06-01T12:00:00.000Z");

  test("describes recent times in the largest sensible unit", () => {
    expect(relativeTime("2024-06-01T11:59:30.000Z", now)).toBe("just now");
    expect(relativeTime("2024-06-01T11:30:00.000Z", now)).toBe("30m ago");
    expect(relativeTime("2024-06-01T06:00:00.000Z", now)).toBe("6h ago");
    expect(relativeTime("2024-05-29T12:00:00.000Z", now)).toBe("3d ago");
  });

  test("falls back to a date for anything old", () => {
    expect(relativeTime("2024-01-02T12:00:00.000Z", now)).toBe("2024-01-02");
  });

  test("does not invent a time for a missing or malformed stamp", () => {
    expect(relativeTime("", now)).toBe("unknown");
    expect(relativeTime("not-a-date", now)).toBe("unknown");
  });
});
