import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { sessionDir } from "../session/store.ts";
import { MAX_HISTORY } from "./history.ts";
import {
  appendPromptHistory,
  loadPromptHistory,
  promptHistoryPath,
} from "./promptHistory.ts";

const originalHome = process.env.ANVIL_HOME;
let testHome: string | undefined;

afterEach(async () => {
  if (testHome) await rm(testHome, { recursive: true, force: true });
  testHome = undefined;
  if (originalHome === undefined) delete process.env.ANVIL_HOME;
  else process.env.ANVIL_HOME = originalHome;
});

async function scratch(): Promise<string> {
  testHome = await mkdtemp(join(tmpdir(), "anvil-home-"));
  process.env.ANVIL_HOME = testHome;
  return join(testHome, "project");
}

describe("prompt history persistence", () => {
  test("round-trips prompts, oldest first", async () => {
    const cwd = await scratch();
    await appendPromptHistory(cwd, "first");
    await appendPromptHistory(cwd, "second");

    expect(await loadPromptHistory(cwd)).toEqual(["first", "second"]);
  });

  test("keeps multi-line prompts in one piece", async () => {
    const cwd = await scratch();
    const prompt = "review this\nand then\nfix it";
    await appendPromptHistory(cwd, prompt);

    expect(await loadPromptHistory(cwd)).toEqual([prompt]);
  });

  test("skips blanks and consecutive repeats", async () => {
    const cwd = await scratch();
    await appendPromptHistory(cwd, "same");
    await appendPromptHistory(cwd, "same");
    await appendPromptHistory(cwd, "   ");
    await appendPromptHistory(cwd, "other");
    await appendPromptHistory(cwd, "same");

    expect(await loadPromptHistory(cwd)).toEqual(["same", "other", "same"]);
  });

  test("caps the file at MAX_HISTORY entries", async () => {
    const cwd = await scratch();
    const entries = Array.from({ length: MAX_HISTORY + 25 }, (_, i) => `prompt ${i}`);
    await mkdir(sessionDir(cwd), { recursive: true });
    await writeFile(
      promptHistoryPath(cwd),
      entries.map((e) => `${JSON.stringify(e)}\n`).join(""),
      "utf8",
    );

    const after = await appendPromptHistory(cwd, "newest");
    expect(after.length).toBe(MAX_HISTORY);
    expect(after.at(-1)).toBe("newest");
    expect(await loadPromptHistory(cwd)).toEqual(after);
  });

  test("a missing file is an empty history, not an error", async () => {
    const cwd = await scratch();
    expect(await loadPromptHistory(cwd)).toEqual([]);
  });

  test("a corrupt file keeps whatever is still readable", async () => {
    const cwd = await scratch();
    await mkdir(sessionDir(cwd), { recursive: true });
    await writeFile(
      promptHistoryPath(cwd),
      `${JSON.stringify("good one")}\nnot json at all\n\n${JSON.stringify("good two")}\n`,
      "utf8",
    );

    expect(await loadPromptHistory(cwd)).toEqual(["good one", "not json at all", "good two"]);
  });

  test("appending is what a later launch reads back", async () => {
    const cwd = await scratch();
    await appendPromptHistory(cwd, "before restart");
    // A fresh process only has the file to go on.
    expect(await loadPromptHistory(cwd)).toEqual(["before restart"]);
  });
});
