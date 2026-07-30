import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { expandHome, isExternalQuery, listExternalMatches } from "./fileIndex.ts";

let home = "";

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "anvil-home-"));
  await mkdir(join(home, "src", "nested"), { recursive: true });
  await mkdir(join(home, "docs"), { recursive: true });
  await writeFile(join(home, "src", "index.ts"), "x");
  await writeFile(join(home, "src", "server.ts"), "x");
  await writeFile(join(home, "src", "nested", "deep.ts"), "x");
  await writeFile(join(home, "notes.md"), "x");
  await writeFile(join(home, ".hidden"), "x");
});

afterAll(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("isExternalQuery", () => {
  test("recognizes paths that leave the project", () => {
    for (const q of ["~", "~/", "~/src/", "/etc/", "./local", "../sibling/"]) {
      expect(isExternalQuery(q)).toBe(true);
    }
  });

  test("ordinary project queries stay on the index", () => {
    for (const q of ["", "src", "src/cli.ts", "App.tsx", "~notafile"]) {
      expect(isExternalQuery(q)).toBe(false);
    }
  });
});

describe("expandHome", () => {
  test("expands a leading tilde only", () => {
    expect(expandHome("~", "/home/u")).toBe("/home/u");
    expect(expandHome("~/src/a.ts", "/home/u")).toBe("/home/u/src/a.ts");
    expect(expandHome("/abs/path", "/home/u")).toBe("/abs/path");
    expect(expandHome("relative/path", "/home/u")).toBe("relative/path");
    // Not a home reference — a file that merely starts with a tilde.
    expect(expandHome("~weird", "/home/u")).toBe("~weird");
  });
});

describe("listExternalMatches", () => {
  test("lists a home directory, keeping the ~ the user typed", async () => {
    const matches = await listExternalMatches("~/", 20, home);
    expect(matches).toContain("~/src/");
    expect(matches).toContain("~/docs/");
    expect(matches).toContain("~/notes.md");
  });

  test("directories sort first and are marked so browsing can continue", async () => {
    const matches = await listExternalMatches("~/", 20, home);
    const firstFile = matches.findIndex((m) => !m.endsWith("/"));
    const lastDir = matches.map((m) => m.endsWith("/")).lastIndexOf(true);
    expect(lastDir).toBeLessThan(firstFile);
  });

  test("filters by the partial name after the last slash", async () => {
    const matches = await listExternalMatches("~/src/s", 20, home);
    expect(matches).toEqual(["~/src/server.ts"]);
  });

  test("descends into a nested directory", async () => {
    expect(await listExternalMatches("~/src/nested/", 20, home)).toEqual([
      "~/src/nested/deep.ts",
    ]);
  });

  test("hides dotfiles until the dot is typed", async () => {
    expect(await listExternalMatches("~/", 20, home)).not.toContain("~/.hidden");
    expect(await listExternalMatches("~/.", 20, home)).toContain("~/.hidden");
  });

  test("absolute paths work without a tilde", async () => {
    const matches = await listExternalMatches(`${home}/src/`, 20, home);
    expect(matches).toContain(`${home}/src/index.ts`);
  });

  test("a directory that does not exist offers nothing rather than throwing", async () => {
    expect(await listExternalMatches("~/nope/", 20, home)).toEqual([]);
  });

  test("respects the result cap", async () => {
    expect((await listExternalMatches("~/", 2, home)).length).toBe(2);
  });
});
