import { describe, expect, test } from "bun:test";
import { approvalScope } from "./bash.ts";

describe("approvalScope", () => {
  test("a plain command is scoped to its program", () => {
    expect(approvalScope("ls -la src")).toBe("ls");
    expect(approvalScope("ls -la")).toBe("ls");
  });

  test("subcommand-driven tools keep the subcommand", () => {
    expect(approvalScope("git status --short")).toBe("git status");
    expect(approvalScope("git push --force")).toBe("git push");
    expect(approvalScope("bun test src/foo")).toBe("bun test");
  });

  test("approving one subcommand does not approve another", () => {
    expect(approvalScope("git status")).not.toBe(approvalScope("git push"));
  });

  test("a leading flag leaves the scope at the program", () => {
    expect(approvalScope("npm --version")).toBe("npm");
  });

  test("compound commands are never scoped down", () => {
    for (const command of [
      "ls && rm -rf /",
      "ls; rm -rf /",
      "ls | grep x",
      "echo $(rm -rf /)",
      "echo `rm -rf /`",
    ]) {
      expect(approvalScope(command)).toBe(command);
    }
  });

  test("surrounding whitespace does not change the scope", () => {
    expect(approvalScope("   git   status   ")).toBe("git status");
  });
});
