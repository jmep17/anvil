import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./load.ts";

describe("loadConfig skills/context", () => {
  test("merges project skills and context overrides", async () => {
    const root = await mkdtemp(join(tmpdir(), "anvil-cfg-"));
    try {
      await mkdir(join(root, ".anvil"), { recursive: true });
      await writeFile(
        join(root, ".anvil", "settings.json"),
        JSON.stringify({
          skills: { always: ["docs"], recommendOnly: false },
          context: { maxChars: 1234 },
        }),
      );
      const cfg = await loadConfig(root);
      expect(cfg.skills.always).toEqual(["docs"]);
      expect(cfg.skills.recommendOnly).toBe(false);
      expect(cfg.skills.autoDetect).toBe(true);
      expect(cfg.context.maxChars).toBe(1234);
      expect(cfg.context.anvilMd).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
