import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONTEXT_CONFIG } from "../config/types.ts";
import { loadRepoContext } from "./context.ts";

describe("loadRepoContext", () => {
  test("loads ANVIL.md and .anvil/CONTEXT.md", async () => {
    const root = await mkdtemp(join(tmpdir(), "anvil-ctx-"));
    try {
      await writeFile(join(root, "ANVIL.md"), "# Project\nUse Bun.\n");
      await mkdir(join(root, ".anvil"), { recursive: true });
      await writeFile(join(root, ".anvil", "CONTEXT.md"), "Team note.\n");

      const ctx = await loadRepoContext(root, { ...DEFAULT_CONTEXT_CONFIG, localContext: false });
      expect(ctx.anvilMd).toContain("Use Bun");
      expect(ctx.projectContext).toContain("Team note");
      expect(ctx.combined).toContain("ANVIL.md");
      expect(ctx.combined).toContain("Team note");
      expect(ctx.truncated).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("truncates when over maxChars", async () => {
    const root = await mkdtemp(join(tmpdir(), "anvil-ctx-"));
    try {
      await writeFile(join(root, "ANVIL.md"), "x".repeat(500));
      const ctx = await loadRepoContext(root, {
        ...DEFAULT_CONTEXT_CONFIG,
        localContext: false,
        projectContext: false,
        maxChars: 100,
      });
      expect(ctx.truncated).toBe(true);
      expect(ctx.combined.length).toBeLessThanOrEqual(200);
      expect(ctx.combined).toContain("truncated");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
