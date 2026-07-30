import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { SessionStore, type SessionSummary } from "../session/store.ts";
import { SessionPicker, sessionPickerRows } from "./SessionPicker.tsx";

/**
 * Keyboard interaction is not covered here: mock key events do not reach
 * `useKeyboard` under the OpenTUI test renderer, so the picker's key handling
 * in App.tsx has no headless coverage. What is covered is the data the picker
 * is built from and what it draws for it.
 */

const originalHome = process.env.ANVIL_HOME;
let testHome: string | undefined;

afterEach(async () => {
  if (testHome) await rm(testHome, { recursive: true, force: true });
  testHome = undefined;
  if (originalHome === undefined) delete process.env.ANVIL_HOME;
  else process.env.ANVIL_HOME = originalHome;
});

async function frameFor(
  sessions: SessionSummary[],
  selected = 0,
  currentId?: string,
): Promise<string> {
  const { renderer, captureCharFrame, waitForVisualIdle } = await testRender(
    <SessionPicker
      sessions={sessions}
      selected={selected}
      currentId={currentId}
      columns={96}
    />,
    { width: 96, height: 16 },
  );
  try {
    await waitForVisualIdle();
    return captureCharFrame();
  } finally {
    renderer.destroy();
  }
}

describe("SessionPicker", () => {
  test("renders real sessions read back off disk", async () => {
    testHome = await mkdtemp(join(tmpdir(), "anvil-home-"));
    process.env.ANVIL_HOME = testHome;
    const cwd = join(testHome, "project");

    const earlier = await SessionStore.create(cwd, "2024-01-01T00-00-00-000Z");
    await earlier.appendMessage({ role: "user", content: "fix the parser" });
    await earlier.appendMessage({ role: "assistant", content: "done" });
    const current = await SessionStore.create(cwd, "2024-09-09T00-00-00-000Z");
    await current.appendMessage({ role: "user", content: "add a test" });

    const sessions = await SessionStore.list(cwd);
    const frame = await frameFor(sessions, 0, current.id);

    expect(frame).toContain("Resume a session  (2)");
    expect(frame).toContain("add a test");
    expect(frame).toContain("fix the parser");
    expect(frame).toContain("2 msg");
    // The session already open is called out so it is not picked by mistake.
    expect(frame).toContain("(current)");
  });

  test("marks the selected row", async () => {
    const sessions: SessionSummary[] = [
      { id: "a", updatedAt: "", messageCount: 1, preview: "first entry" },
      { id: "b", updatedAt: "", messageCount: 1, preview: "second entry" },
    ];
    expect(await frameFor(sessions, 0)).toContain("› ");

    const second = await frameFor(sessions, 1);
    const lines = second.split("\n").filter((line) => line.includes("›"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("second entry");
  });

  test("a session with no user message falls back to its id", async () => {
    const frame = await frameFor([
      { id: "2024-05-05T00-00-00-000Z", updatedAt: "", messageCount: 0, preview: "" },
    ]);
    expect(frame).toContain("2024-05-05T00-00-00-000Z");
  });

  test("says so when there is nothing to resume", async () => {
    const frame = await frameFor([]);
    expect(frame).toContain("No earlier sessions");
  });
});

describe("sessionPickerRows", () => {
  test("reserves a row per session plus the frame", () => {
    const one: SessionSummary[] = [{ id: "a", updatedAt: "", messageCount: 0, preview: "" }];
    expect(sessionPickerRows(one)).toBe(4);
    expect(sessionPickerRows([...one, { ...one[0]!, id: "b" }])).toBe(5);
  });

  test("still reserves a row for the empty state", () => {
    expect(sessionPickerRows([])).toBe(4);
  });
});
