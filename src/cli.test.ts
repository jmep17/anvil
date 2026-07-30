import { describe, expect, test } from "bun:test";
import { findSubcommandIndex } from "./cli.ts";

describe("findSubcommandIndex", () => {
  test("detects bare config", () => {
    expect(findSubcommandIndex(["config"])).toBe(0);
    expect(findSubcommandIndex(["config", "set", "model", "x"])).toBe(0);
  });

  test("detects config after flags", () => {
    expect(findSubcommandIndex(["--cwd", "/tmp", "config"])).toBe(2);
    expect(findSubcommandIndex(["-m", "qwen/x", "config", "show"])).toBe(2);
  });

  test("ignores prompt text that is not a subcommand", () => {
    expect(findSubcommandIndex(["fix the bug"])).toBe(-1);
    // -p takes no value, so "config" is still the first positional subcommand
    expect(findSubcommandIndex(["-p", "config"])).toBe(1);
    expect(findSubcommandIndex(["-p", "please help"])).toBe(-1);
  });
});
