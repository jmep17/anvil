import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { openSession } from "./cli.ts";
import { SessionStore } from "./session/store.ts";

const originalHome = process.env.ANVIL_HOME;
let testHome: string | undefined;

afterEach(async () => {
  if (testHome) await rm(testHome, { recursive: true, force: true });
  testHome = undefined;
  if (originalHome === undefined) delete process.env.ANVIL_HOME;
  else process.env.ANVIL_HOME = originalHome;
});

async function project(): Promise<string> {
  testHome = await mkdtemp(join(tmpdir(), "anvil-home-"));
  process.env.ANVIL_HOME = testHome;
  return join(testHome, "project");
}

/** Silence the diagnostics these paths print, and capture them for assertions. */
function captureErrors(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  return { lines, restore: () => spy.mockRestore() };
}

describe("openSession", () => {
  test("starts a new session when nothing is requested", async () => {
    const cwd = await project();
    const session = await openSession(cwd, {});
    expect(session).not.toBeNull();
    expect(await SessionStore.listIds(cwd)).toEqual([session!.id]);
  });

  test("--resume opens the named session rather than creating one", async () => {
    const cwd = await project();
    const existing = await SessionStore.create(cwd, "keep-me");
    await existing.appendMessage({ role: "user", content: "earlier work" });

    const session = await openSession(cwd, { resume: "keep-me" });
    expect(session!.id).toBe("keep-me");
    expect(await session!.loadMessages()).toEqual([{ role: "user", content: "earlier work" }]);
    expect(await SessionStore.listIds(cwd)).toEqual(["keep-me"]);
  });

  test("a mistyped id fails loudly instead of silently starting fresh", async () => {
    const cwd = await project();
    await SessionStore.create(cwd, "real-session");
    const { lines, restore } = captureErrors();
    try {
      expect(await openSession(cwd, { resume: "typo" })).toBeNull();
      expect(lines.join("\n")).toContain('no session "typo"');
      // It points at what does exist.
      expect(lines.join("\n")).toContain("real-session");
    } finally {
      restore();
    }
    // Crucially, no empty session was left behind.
    expect(await SessionStore.listIds(cwd)).toEqual(["real-session"]);
  });

  test("--continue picks up the most recent session", async () => {
    const cwd = await project();
    await SessionStore.create(cwd, "2024-01-01T00-00-00-000Z");
    await SessionStore.create(cwd, "2024-09-01T00-00-00-000Z");

    const session = await openSession(cwd, { continue: true });
    expect(session!.id).toBe("2024-09-01T00-00-00-000Z");
  });

  test("--continue in a fresh project says so and starts a new session", async () => {
    const cwd = await project();
    const { lines, restore } = captureErrors();
    try {
      const session = await openSession(cwd, { continue: true });
      expect(session).not.toBeNull();
      expect(lines.join("\n")).toContain("no earlier sessions");
    } finally {
      restore();
    }
  });

  test("a bare --resume behaves like --continue", async () => {
    const cwd = await project();
    await SessionStore.create(cwd, "2024-02-02T00-00-00-000Z");
    // parseArgs yields `true` for a value flag given without a value.
    const session = await openSession(cwd, { resume: true });
    expect(session!.id).toBe("2024-02-02T00-00-00-000Z");
  });

  test("whitespace is not mistaken for a session id", async () => {
    const cwd = await project();
    await SessionStore.create(cwd, "2024-03-03T00-00-00-000Z");
    const session = await openSession(cwd, { resume: "   " });
    expect(session!.id).toBe("2024-03-03T00-00-00-000Z");
  });
});
