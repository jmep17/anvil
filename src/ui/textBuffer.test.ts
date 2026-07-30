import { describe, expect, test } from "bun:test";
import {
  backspace,
  createBuffer,
  del,
  insert,
  lineEnd,
  lineHome,
  moveDown,
  moveLeft,
  moveRight,
  moveUp,
  normalizePaste,
  wordBackward,
  wordForward,
} from "./textBuffer.ts";

describe("textBuffer", () => {
  test("insert at cursor", () => {
    let b = createBuffer("ac", 1);
    b = insert(b, "b");
    expect(b.value).toBe("abc");
    expect(b.cursor).toBe(2);
  });

  test("backspace and delete", () => {
    expect(backspace(createBuffer("ab", 2)).value).toBe("a");
    expect(del(createBuffer("ab", 0)).value).toBe("b");
  });

  test("horizontal move", () => {
    expect(moveLeft(createBuffer("ab", 1)).cursor).toBe(0);
    expect(moveRight(createBuffer("ab", 1)).cursor).toBe(2);
  });

  test("line home/end", () => {
    const b = createBuffer("hi\nthere", 5);
    expect(lineHome(b).cursor).toBe(3);
    expect(lineEnd(b).cursor).toBe(8);
  });

  test("vertical move preserves preferred column when possible", () => {
    let b = createBuffer("abcd\nxyzz\n!", 2); // col 2 on first line
    b = moveDown(b);
    expect(b.cursor).toBe(7); // line 1 col 2 → 'z' of xyzz (offset 5+2)
    b = moveUp(b);
    expect(b.cursor).toBe(2);
  });

  test("word motion", () => {
    const b = createBuffer("foo bar", 0);
    expect(wordForward(b).cursor).toBe(4);
    expect(wordBackward(createBuffer("foo bar", 4)).cursor).toBe(0);
  });

  test("normalizePaste strips trailing newline for single line", () => {
    expect(normalizePaste("hello\n")).toBe("hello");
    expect(normalizePaste("a\nb\n")).toBe("a\nb\n");
    expect(normalizePaste("hello")).toBe("hello");
  });
});
