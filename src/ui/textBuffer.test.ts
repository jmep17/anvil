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
  charAt,
  deleteLine,
  lineAt,
  putAfter,
  putBefore,
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

/**
 * `p` did nothing at all before this: vim mode had no register, so `dd` and `x`
 * discarded what they removed and `p` / `P` / `yy` were unimplemented.
 */
describe("vim registers", () => {
  test("dd takes the line, and p puts it below wherever the cursor now is", () => {
    const start = createBuffer("one\ntwo\nthree", 4); // on "two"
    const register = { text: lineAt(start), linewise: true };
    expect(register.text).toBe("two\n");

    const after = deleteLine(start);
    expect(after.value).toBe("one\nthree");

    // Deleting moved the cursor onto "three", so p puts below *that* — the same
    // dd-then-p round trip vim performs, not a restore of the original order.
    const put = putAfter(after, register);
    expect(put.value).toBe("one\nthree\ntwo");
    // vim leaves the cursor on the first character of what it put.
    expect(put.value[put.cursor]).toBe("t");
  });

  test("dd then P is the round trip that restores the line", () => {
    const start = createBuffer("one\ntwo\nthree", 4);
    const register = { text: lineAt(start), linewise: true };
    const put = putBefore(deleteLine(start), register);
    expect(put.value).toBe("one\ntwo\nthree");
  });

  test("P puts a line above the current one", () => {
    const buf = createBuffer("one\ntwo", 4);
    const put = putBefore(buf, { text: "zero\n", linewise: true });
    expect(put.value).toBe("one\nzero\ntwo");
    expect(put.cursor).toBe(4);
  });

  test("a linewise put on the last line adds the newline it needs", () => {
    const buf = createBuffer("only", 0);
    expect(putAfter(buf, { text: "next\n", linewise: true }).value).toBe("only\nnext");
  });

  test("x takes the character under the cursor, p puts it after", () => {
    const buf = createBuffer("abc", 1);
    expect(charAt(buf)).toBe("b");

    const after = del(buf);
    expect(after.value).toBe("ac");

    // Charwise p lands after the character the cursor sits on: a-c with b
    // between them again.
    const put = putAfter(after, { text: "b", linewise: false });
    expect(put.value).toBe("acb");
    expect(put.cursor).toBe(2);
  });

  test("charwise P puts at the cursor rather than after it", () => {
    const put = putBefore(createBuffer("ac", 1), { text: "b", linewise: false });
    expect(put.value).toBe("abc");
  });

  test("putting an empty register changes nothing", () => {
    const buf = createBuffer("abc", 1);
    expect(putAfter(buf, null)).toBe(buf);
    expect(putBefore(buf, { text: "", linewise: true })).toBe(buf);
  });

  test("a multi-line register keeps its own indentation", () => {
    const body = '{\n  "name": "anvil",\n  "nested": {\n    "deep": true\n  }\n}\n';
    const put = putAfter(createBuffer("head", 0), { text: body, linewise: true });
    expect(put.value).toBe(`head\n${body.replace(/\n$/, "")}`);
  });
});

/**
 * Settles a report that pasting an object "gives the pasted text an indent".
 * This drives the real paste path — what `usePaste` does — and reads the buffer
 * back, rather than reasoning about what it ought to contain.
 */
describe("paste fidelity", () => {
  const object = '{\n  "name": "anvil",\n  "nested": {\n    "deep": true\n  }\n}';

  test("an indented object arrives exactly as it was copied", () => {
    const pasted = insert(createBuffer("", 0), normalizePaste(object));
    expect(pasted.value).toBe(object);
    expect(pasted.value.split("\n")).toEqual(object.split("\n"));
  });

  test("pasting into existing text splices without touching either side", () => {
    const buf = createBuffer("beforeafter", 6);
    expect(insert(buf, normalizePaste(object)).value).toBe(`before${object}after`);
  });

  test("a selection that began on the line above does not land a row down", () => {
    // Whole-line selections routinely start at the end of the previous line, so
    // the clipboard opens with a newline. Left in, the block renders one row
    // lower with the continuation gutter on every line of it.
    expect(normalizePaste(`\n${object}`)).toBe(object);
    expect(normalizePaste(`\n\n${object}`)).toBe(object);
  });

  test("no leading whitespace is added to any line", () => {
    const pasted = insert(createBuffer("", 0), normalizePaste(object));
    const indents = pasted.value.split("\n").map((line) => line.match(/^ */)![0].length);
    expect(indents).toEqual(object.split("\n").map((l) => l.match(/^ */)![0].length));
  });
});
