import { describe, expect, test } from "bun:test";
import { resolveEditor, splitEditorCommand } from "./openInEditor.ts";

describe("openInEditor helpers", () => {
  test("splitEditorCommand", () => {
    expect(splitEditorCommand("nvim")).toEqual({ bin: "nvim", args: [] });
    expect(splitEditorCommand("nvim -b")).toEqual({ bin: "nvim", args: ["-b"] });
  });

  test("resolveEditor prefers override", () => {
    expect(resolveEditor("helix")).toBe("helix");
  });
});
