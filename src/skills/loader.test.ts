import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter, skillMetaFromParsed } from "./frontmatter.ts";
import { getSkill, listSkills } from "./loader.ts";

describe("parseFrontmatter", () => {
  test("parses name, description, lists", () => {
    const raw = `---
name: shadcn
description: UI with shadcn
triggers: [shadcn, ui]
detect: [shadcn]
---

# Body
hello
`;
    const { meta, body } = parseFrontmatter(raw);
    expect(meta.name).toBe("shadcn");
    expect(meta.description).toBe("UI with shadcn");
    expect(meta.triggers).toEqual(["shadcn", "ui"]);
    expect(meta.detect).toEqual(["shadcn"]);
    expect(body.trim()).toBe("# Body\nhello");
  });

  test("returns full text when no frontmatter", () => {
    const { meta, body } = parseFrontmatter("# Just markdown");
    expect(meta).toEqual({});
    expect(body).toBe("# Just markdown");
  });

  test("skillMetaFromParsed fills defaults", () => {
    const m = skillMetaFromParsed("foo", {});
    expect(m.name).toBe("foo");
    expect(m.description).toBe("");
    expect(m.triggers).toEqual([]);
  });
});

describe("listSkills merge", () => {
  test("project overrides builtin/user by name", async () => {
    const root = await mkdtemp(join(tmpdir(), "anvil-skills-"));
    try {
      const projectDir = join(root, ".anvil", "skills", "docs");
      await mkdir(projectDir, { recursive: true });
      await writeFile(
        join(projectDir, "SKILL.md"),
        `---
name: docs
description: Project docs override
---
# Project docs
`,
      );

      const skills = await listSkills(root);
      const docs = skills.find((s) => s.name === "docs");
      expect(docs).toBeDefined();
      expect(docs!.source).toBe("project");
      expect(docs!.description).toBe("Project docs override");

      const content = await getSkill(root, "docs");
      expect(content?.raw).toContain("Project docs override");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("builtin pack is discoverable", async () => {
    const skills = await listSkills(process.cwd());
    const names = skills.map((s) => s.name);
    for (const n of ["docs", "shadcn", "frontend", "api", "database", "testing"]) {
      expect(names).toContain(n);
    }
    const shadcn = skills.find((s) => s.name === "shadcn");
    expect(shadcn?.description.length).toBeGreaterThan(10);
    expect(shadcn?.source).toBe("builtin");
  });
});
