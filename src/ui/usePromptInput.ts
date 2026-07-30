import { useCallback, useRef, useState } from "react";
import { useInput, usePaste, type Key } from "ink";
import type { EditorMode } from "../config/types.ts";
import {
  backspace,
  clearLine,
  createBuffer,
  del,
  deleteLine,
  insert,
  lineEnd,
  lineHome,
  moveDown,
  moveLeft,
  moveRight,
  moveUp,
  normalizePaste,
  openLineAbove,
  openLineBelow,
  type TextBuffer,
  wordBackward,
  wordForward,
} from "./textBuffer.ts";
import { editInExternalEditor } from "./openInEditor.ts";

export type VimMode = "insert" | "normal";

export interface PromptInputState {
  buffer: TextBuffer;
  vimMode: VimMode;
  pasteHint: string | null;
}

interface Options {
  busy: boolean;
  blocked: boolean;
  editorMode: EditorMode;
  editor?: string;
  suspendTerminal: (fn: () => Promise<void>) => Promise<void>;
  onSubmit: (text: string) => void;
  onAbort: () => void;
  onToggleAgentMode: () => void;
  onPasteNotice?: (msg: string) => void;
  isActive?: boolean;
}

function applyEmacsNav(buf: TextBuffer, ch: string, key: Key): TextBuffer | null {
  if (key.leftArrow) return moveLeft(buf);
  if (key.rightArrow) return moveRight(buf);
  if (key.upArrow) return moveUp(buf);
  if (key.downArrow) return moveDown(buf);
  if (key.home || (key.ctrl && ch === "a")) return lineHome(buf);
  if (key.end || (key.ctrl && ch === "e")) return lineEnd(buf);
  if (key.ctrl && ch === "u") return clearLine(buf);
  if (key.ctrl && ch === "w") {
    // delete word backward via repeated backspace on whitespace boundary
    let i = buf.cursor;
    while (i > 0 && /\s/.test(buf.value[i - 1]!)) i--;
    while (i > 0 && !/\s/.test(buf.value[i - 1]!)) i--;
    return {
      value: buf.value.slice(0, i) + buf.value.slice(buf.cursor),
      cursor: i,
      preferredCol: null,
    };
  }
  return null;
}

export function usePromptInput(opts: Options) {
  const [buffer, setBuffer] = useState<TextBuffer>(() => createBuffer(""));
  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;
  const [vimMode, setVimMode] = useState<VimMode>("insert");
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const pendingD = useRef(false);
  const editingRef = useRef(false);

  const resetBuffer = useCallback(() => {
    setBuffer(createBuffer(""));
    setVimMode("insert");
    pendingD.current = false;
  }, []);

  const setValue = useCallback((value: string, cursor?: number) => {
    setBuffer(createBuffer(value, cursor));
  }, []);

  usePaste(
    (text) => {
      if (opts.busy || opts.blocked || editingRef.current) return;
      const cleaned = normalizePaste(text);
      setBuffer((b) => insert(b, cleaned));
      const lines = cleaned.split("\n").length;
      if (cleaned.length > 200 || lines > 1) {
        const msg = `pasted ${cleaned.length} chars · ${lines} line${lines === 1 ? "" : "s"}`;
        setPasteHint(msg);
        opts.onPasteNotice?.(msg);
        setTimeout(() => setPasteHint(null), 2500);
      }
    },
    { isActive: opts.isActive !== false && !opts.busy && !opts.blocked },
  );

  const openEditor = useCallback(async () => {
    if (opts.busy || opts.blocked || editingRef.current) return;
    editingRef.current = true;
    try {
      const next = await editInExternalEditor(bufferRef.current.value, {
        editor: opts.editor,
        suspendTerminal: opts.suspendTerminal,
      });
      setBuffer(createBuffer(next));
      setVimMode("insert");
    } finally {
      editingRef.current = false;
    }
  }, [opts.blocked, opts.busy, opts.editor, opts.suspendTerminal]);

  useInput(
    (ch, key) => {
      if (opts.blocked || editingRef.current) return;

      if (key.escape && opts.busy) {
        opts.onAbort();
        return;
      }
      if (opts.busy) return;

      if (key.shift && key.tab) {
        opts.onToggleAgentMode();
        return;
      }

      // Ctrl+G → external editor
      if (key.ctrl && ch === "g") {
        void openEditor();
        return;
      }

      const vim = opts.editorMode === "vim";

      // Esc handling
      if (key.escape) {
        if (vim && vimMode === "insert") {
          setVimMode("normal");
          pendingD.current = false;
          return;
        }
        if (buffer.value) {
          resetBuffer();
        }
        return;
      }

      // Newline
      if (key.ctrl && (ch === "j" || ch === "\n" || ch === "\r")) {
        if (!vim || vimMode === "insert") {
          setBuffer((b) => insert(b, "\n"));
        }
        return;
      }
      if (key.return && key.shift) {
        if (!vim || vimMode === "insert") {
          setBuffer((b) => insert(b, "\n"));
        }
        return;
      }

      // Submit
      if (key.return) {
        const value = buffer.value;
        resetBuffer();
        opts.onSubmit(value);
        return;
      }

      // Vim normal mode
      if (vim && vimMode === "normal") {
        if (pendingD.current) {
          pendingD.current = false;
          if (ch === "d") {
            setBuffer((b) => deleteLine(b));
          }
          return;
        }
        if (ch === "d") {
          pendingD.current = true;
          return;
        }
        if (ch === "h" || key.leftArrow) {
          setBuffer((b) => moveLeft(b));
          return;
        }
        if (ch === "l" || key.rightArrow) {
          setBuffer((b) => moveRight(b));
          return;
        }
        if (ch === "k" || key.upArrow) {
          setBuffer((b) => moveUp(b));
          return;
        }
        if (ch === "j" || key.downArrow) {
          setBuffer((b) => moveDown(b));
          return;
        }
        if (ch === "0") {
          setBuffer((b) => lineHome(b));
          return;
        }
        if (ch === "$") {
          setBuffer((b) => lineEnd(b));
          return;
        }
        if (ch === "w") {
          setBuffer((b) => wordForward(b));
          return;
        }
        if (ch === "b") {
          setBuffer((b) => wordBackward(b));
          return;
        }
        if (ch === "x") {
          setBuffer((b) => del(b));
          return;
        }
        if (ch === "i") {
          setVimMode("insert");
          return;
        }
        if (ch === "a") {
          setBuffer((b) => moveRight(b));
          setVimMode("insert");
          return;
        }
        if (ch === "I") {
          setBuffer((b) => lineHome(b));
          setVimMode("insert");
          return;
        }
        if (ch === "A") {
          setBuffer((b) => lineEnd(b));
          setVimMode("insert");
          return;
        }
        if (ch === "o") {
          setBuffer((b) => openLineBelow(b));
          setVimMode("insert");
          return;
        }
        if (ch === "O") {
          setBuffer((b) => openLineAbove(b));
          setVimMode("insert");
          return;
        }
        return;
      }

      // Insert / emacs
      setBuffer((b) => {
        const nav = applyEmacsNav(b, ch, key);
        if (nav) return nav;
        if (key.backspace) return backspace(b);
        if (key.delete) return del(b);
        if (ch && !key.ctrl && !key.meta) return insert(b, ch);
        return b;
      });
    },
    { isActive: opts.isActive !== false },
  );

  return {
    buffer,
    vimMode: opts.editorMode === "vim" ? vimMode : "insert",
    pasteHint,
    resetBuffer,
    setValue,
    setBuffer,
  };
}
