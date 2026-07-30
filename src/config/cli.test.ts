import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  coerceConfigValue,
  explainConfig,
  formatConfigShow,
  getAtPath,
  parseConfigKey,
  setAtPath,
  setConfigValue,
  unsetConfigValue,
} from "./cli.ts";

describe("config key helpers", () => {
  test("parse and get/set nested paths", () => {
    expect(parseConfigKey("skills.autoDetect")).toEqual(["skills", "autoDetect"]);
    const obj: Record<string, unknown> = {};
    setAtPath(obj, ["skills", "autoDetect"], false);
    expect(getAtPath(obj, ["skills", "autoDetect"])).toBe(false);
  });

  test("coerce numbers and booleans", () => {
    expect(coerceConfigValue(["contextLength"], "65536")).toBe(65536);
    expect(coerceConfigValue(["skills", "autoDetect"], "false")).toBe(false);
    expect(coerceConfigValue(["skills", "always"], "docs,shadcn")).toEqual([
      "docs",
      "shadcn",
    ]);
  });
});

describe("config set/unset", () => {
  test("writes project settings and explain shows override", async () => {
    const root = await mkdtemp(join(tmpdir(), "anvil-cfgcli-"));
    const prevAnvilHome = process.env.ANVIL_HOME;
    const fakeHome = await mkdtemp(join(tmpdir(), "anvil-home-"));
    const anvilDir = join(fakeHome, ".anvil");
    process.env.ANVIL_HOME = anvilDir;
    try {
      await mkdir(anvilDir, { recursive: true });
      await writeFile(
        join(anvilDir, "config.json"),
        JSON.stringify({ model: "global-model", contextLength: 32_768 }),
      );

      await setConfigValue("project", root, "model", "project-model");
      const info = await explainConfig(root);
      expect(info.effective.model).toBe("project-model");
      expect(info.sources.model).toBe("project");
      expect(formatConfigShow(info)).toContain("override");

      await unsetConfigValue("project", root, "model");
      const after = await explainConfig(root);
      expect(after.effective.model).toBe("global-model");
      expect(after.sources.model).toBe("global");
    } finally {
      if (prevAnvilHome === undefined) delete process.env.ANVIL_HOME;
      else process.env.ANVIL_HOME = prevAnvilHome;
      await rm(root, { recursive: true, force: true });
      await rm(fakeHome, { recursive: true, force: true });
    }
  });
});
