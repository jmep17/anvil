import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectStack, recommendSkillsFromTags } from "./detect.ts";

describe("detectStack", () => {
  test("detects next + shadcn from package.json and components.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "anvil-detect-"));
    try {
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({
          dependencies: {
            next: "15.0.0",
            react: "19.0.0",
            "react-dom": "19.0.0",
            tailwindcss: "4.0.0",
          },
        }),
      );
      await writeFile(join(root, "components.json"), JSON.stringify({ $schema: "…" }));
      await writeFile(join(root, "next.config.ts"), "export default {};\n");

      const tags = await detectStack(root);
      expect(tags).toContain("next");
      expect(tags).toContain("react");
      expect(tags).toContain("shadcn");
      expect(tags).toContain("tailwind");
      expect(tags).toContain("frontend");

      const recommended = recommendSkillsFromTags(tags);
      expect(recommended).toContain("shadcn");
      expect(recommended).toContain("frontend");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("detects prisma and maps to database skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "anvil-detect-"));
    try {
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ dependencies: { "@prisma/client": "6.0.0" } }),
      );
      await mkdir(join(root, "prisma"), { recursive: true });
      await writeFile(join(root, "prisma", "schema.prisma"), "generator client {}\n");

      const tags = await detectStack(root);
      expect(tags).toContain("prisma");
      expect(tags).toContain("database");
      expect(recommendSkillsFromTags(tags)).toContain("database");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("merges skill frontmatter detect map", () => {
    const map = new Map([["custom-ui", ["shadcn"]]]);
    const rec = recommendSkillsFromTags(["shadcn"], map);
    expect(rec).toContain("custom-ui");
    expect(rec).toContain("shadcn");
  });
});
