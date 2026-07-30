import { describe, expect, test } from "bun:test";
import { COMMANDS, findCommand, helpText, matchCommands, parseCommand } from "./commands.ts";

describe("parseCommand", () => {
  test("splits the name from its arguments", () => {
    expect(parseCommand("/mode plan")).toEqual({ name: "mode", args: "plan" });
    expect(parseCommand("/help")).toEqual({ name: "help", args: "" });
  });

  test("tolerates surrounding and repeated whitespace", () => {
    expect(parseCommand("  /mode   plan  ")).toEqual({ name: "mode", args: "plan" });
  });

  test("is case-insensitive on the name only", () => {
    expect(parseCommand("/MODE Plan")).toEqual({ name: "mode", args: "Plan" });
  });

  test("ordinary prose is not a command", () => {
    expect(parseCommand("fix the /parser")).toBeNull();
    expect(parseCommand("what about a/b")).toBeNull();
    expect(parseCommand("/")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});

describe("findCommand", () => {
  test("recognizes every registered command", () => {
    for (const command of COMMANDS) {
      expect(findCommand(command.name)).toBeDefined();
    }
  });

  test("an unregistered name is rejected rather than guessed at", () => {
    expect(findCommand("nope")).toBeUndefined();
  });
});

describe("matchCommands", () => {
  test("offers every command for a bare slash", () => {
    expect(matchCommands("/")).toHaveLength(COMMANDS.length);
  });

  test("narrows by prefix", () => {
    expect(matchCommands("/co")?.map((c) => c.name).sort()).toEqual(["compact", "config"]);
    expect(matchCommands("/help")?.map((c) => c.name)).toEqual(["help"]);
  });

  test("closes once an argument is being typed", () => {
    expect(matchCommands("/mode ")).toBeNull();
    expect(matchCommands("/mode plan")).toBeNull();
  });

  test("stays closed for ordinary text", () => {
    expect(matchCommands("hello")).toBeNull();
  });

  test("an unmatched prefix offers nothing", () => {
    expect(matchCommands("/zzz")).toEqual([]);
  });
});

describe("helpText", () => {
  test("lists every command and the key bindings", () => {
    const text = helpText();
    for (const command of COMMANDS) {
      expect(text).toContain(`/${command.name}`);
      expect(text).toContain(command.description);
    }
    expect(text).toContain("shift+tab");
    expect(text).toContain("ctrl+o");
  });
});
