import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearFileIndexCache, filterFiles, listProjectFiles } from "./fileIndex.ts";
import {
  activeMention,
  activeMentionQuery,
  applyMentionSelection,
  expandFileMentions,
  findMentions,
} from "./fileMentions.ts";

describe("activeMention", () => {
  test("detects @ at start of line", () => {
    expect(activeMentionQuery("@src", 4)).toEqual({ start: 0, query: "src", end: 4 });
  });

  test("detects @ after whitespace", () => {
    expect(activeMentionQuery("look at @App", 12)).toEqual({
      start: 8,
      query: "App",
      end: 12,
    });
  });

  test("returns null when not in a mention", () => {
    expect(activeMentionQuery("hello", 5)).toBeNull();
    expect(activeMentionQuery("email@x.com", 11)).toBeNull();
  });

  test("activeMention includes text after cursor in the token", () => {
    const m = activeMention("see @src/foo.ts please", 8);
    expect(m).toEqual({ start: 4, query: "src/foo.ts", end: 15 });
  });

  test("bare @ is an active mention", () => {
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "", end: 1 });
  });
});

describe("findMentions / applyMentionSelection", () => {
  test("finds unique paths", () => {
    expect(findMentions("see @a.ts and @b.ts and @a.ts")).toEqual(["a.ts", "b.ts"]);
  });

  test("applies selection with trailing space", () => {
    const mention = activeMentionQuery("fix @App", 8)!;
    expect(applyMentionSelection("fix @App", mention, "src/App.tsx")).toEqual({
      value: "fix @src/App.tsx ",
      cursor: 17,
    });
  });
});

describe("filterFiles", () => {
  const files = [
    "src/ui/App.tsx",
    "src/ui/InputBox.tsx",
    "src/agent/loop.ts",
    "README.md",
    "package.json",
  ];

  test("empty query returns prefix of list", () => {
    expect(filterFiles("", files, 3)).toEqual(files.slice(0, 3));
  });

  test("basename prefix ranks highest", () => {
    expect(filterFiles("App", files)[0]).toBe("src/ui/App.tsx");
  });

  test("path substring matches", () => {
    expect(filterFiles("agent/loop", files)).toContain("src/agent/loop.ts");
  });
});

describe("listProjectFiles + expandFileMentions", () => {
  test("lists files and expands mentions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "anvil-mention-"));
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "hello.ts"), "export const n = 1;\n");
    await writeFile(join(dir, "README.md"), "# hi\n");
    await writeFile(join(dir, ".gitignore"), "secret.txt\n");
    await writeFile(join(dir, "secret.txt"), "nope\n");
    clearFileIndexCache(dir);

    const listed = await listProjectFiles(dir, { force: true });
    expect(listed).toContain("src/hello.ts");
    expect(listed).toContain("README.md");
    expect(listed).not.toContain("secret.txt");

    const { displayText, modelText } = await expandFileMentions(
      "check @src/hello.ts please",
      dir,
    );
    expect(displayText).toBe("check @src/hello.ts please");
    expect(modelText).toContain("Referenced files:");
    expect(modelText).toContain('<file path="src/hello.ts">');
    expect(modelText).toContain("export const n = 1;");

    const missing = await expandFileMentions("see @nope.ts", dir);
    expect(missing.modelText).toBe("see @nope.ts");
  });

  test("omits binary files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "anvil-bin-"));
    await writeFile(join(dir, "blob.bin"), Buffer.from([0, 1, 2, 3, 0]));
    const { modelText } = await expandFileMentions("x @blob.bin", dir);
    expect(modelText).toContain("binary file omitted");
  });
});

describe("mentions outside the project", () => {
  test("a directory selection keeps the mention open for the next level", () => {
    const result = applyMentionSelection("look at @~/sr", { start: 8, query: "~/sr", end: 13 }, "~/src/");
    expect(result.value).toBe("look at @~/src/");
    // No trailing space: the user is still typing the path.
    expect(result.cursor).toBe(result.value.length);
  });

  test("a file selection closes the mention with a space", () => {
    const result = applyMentionSelection("look at @~/src/i", { start: 8, query: "~/src/i", end: 16 }, "~/src/index.ts");
    expect(result.value).toBe("look at @~/src/index.ts ");
  });

  test("a tilde path is inlined from the home directory", async () => {
    const home = await mkdtemp(join(tmpdir(), "anvil-home-"));
    const previous = process.env.HOME;
    try {
      process.env.HOME = home;
      await writeFile(join(home, "outside.txt"), "content from outside the project");
      const cwd = await mkdtemp(join(tmpdir(), "anvil-cwd-"));
      try {
        const { modelText, displayText } = await expandFileMentions("check @~/outside.txt", cwd);
        expect(modelText).toContain("content from outside the project");
        // The transcript keeps the short form the user typed.
        expect(displayText).toBe("check @~/outside.txt");
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    } finally {
      if (previous === undefined) delete process.env.HOME;
      else process.env.HOME = previous;
      await rm(home, { recursive: true, force: true });
    }
  });

  test("an absolute path outside the project is inlined", async () => {
    const outside = await mkdtemp(join(tmpdir(), "anvil-outside-"));
    const cwd = await mkdtemp(join(tmpdir(), "anvil-cwd-"));
    try {
      const file = join(outside, "reference.txt");
      await writeFile(file, "referenced content");
      const { modelText } = await expandFileMentions(`see @${file}`, cwd);
      expect(modelText).toContain("referenced content");
    } finally {
      await rm(outside, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
