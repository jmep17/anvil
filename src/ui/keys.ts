import type { KeyEvent } from "@opentui/core";

/** Printable character for buffer insert, or "" for non-printables. */
export function keyChar(key: KeyEvent): string {
  if (key.ctrl || key.meta) return "";
  if (key.name === "space") return " ";
  if (key.name.length === 1) return key.name;
  if (key.sequence.length === 1 && key.sequence >= " ") return key.sequence;
  return "";
}

export function isArrow(key: KeyEvent, dir: "left" | "right" | "up" | "down"): boolean {
  return key.name === dir;
}
