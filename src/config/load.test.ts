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

describe("loadConfig precedence", () => {
  test("a CLI override beats ANVIL_MODEL, which beats project settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "anvil-cfg-"));
    const previous = process.env.ANVIL_MODEL;
    try {
      await mkdir(join(root, ".anvil"), { recursive: true });
      await writeFile(
        join(root, ".anvil", "settings.json"),
        JSON.stringify({ model: "from-project" }),
      );

      expect((await loadConfig(root)).model).toBe("from-project");

      process.env.ANVIL_MODEL = "from-env";
      expect((await loadConfig(root)).model).toBe("from-env");
      expect((await loadConfig(root, { model: "from-cli" })).model).toBe("from-cli");
    } finally {
      if (previous === undefined) delete process.env.ANVIL_MODEL;
      else process.env.ANVIL_MODEL = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
});
