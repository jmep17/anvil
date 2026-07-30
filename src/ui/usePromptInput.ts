import { useCallback, useEffect, useRef, useState } from "react";
import { decodePasteBytes, type KeyEvent } from "@opentui/core";
import { useKeyboard, usePaste } from "@opentui/react";
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
import {
  filterFiles,
  isExternalQuery,
  listExternalMatches,
  listProjectFiles,
} from "./fileIndex.ts";
import {
  activeMention,
  activeMentionQuery,
  applyMentionSelection,
} from "./fileMentions.ts";
import { keyChar } from "./keys.ts";
import { matchCommands, type SlashCommand } from "./commands.ts";
import {
  createHistory,
  next as historyNext,
  previous as historyPrevious,
  release,
  remember,
} from "./history.ts";

export type VimMode = "insert" | "normal";

export interface FilePickerState {
  query: string;
  matches: string[];
  selected: number;
}

export interface CommandPickerState {
  matches: SlashCommand[];
  selected: number;
}

export interface PromptInputState {
  buffer: TextBuffer;
  vimMode: VimMode;
  pasteHint: string | null;
  filePicker: FilePickerState | null;
  commandPicker: CommandPickerState | null;
}

interface Options {
  busy: boolean;
  blocked: boolean;
  editorMode: EditorMode;
  editor?: string;
  cwd: string;
  suspendTerminal: (fn: () => Promise<void>) => Promise<void>;
  onSubmit: (text: string) => void;
  onAbort: () => void;
  onToggleAgentMode: () => void;
  allowModeToggle?: boolean;
  onPasteNotice?: (msg: string) => void;
  isActive?: boolean;
  initialHistory?: string[];
  /**
   * Called when ↑ is pressed on an empty prompt. Return true to consume the
   * key — the owner is showing a picker over the same history.
   */
  onHistoryRecall?: () => boolean;
}

/** True when the cursor sits on the buffer's first line. */
function onFirstLine(buf: TextBuffer): boolean {
  return !buf.value.slice(0, buf.cursor).includes("\n");
}

/** True when the cursor sits on the buffer's last line. */
function onLastLine(buf: TextBuffer): boolean {
  return !buf.value.slice(buf.cursor).includes("\n");
}

function applyEmacsNav(buf: TextBuffer, key: KeyEvent): TextBuffer | null {
  if (key.name === "left") return moveLeft(buf);
  if (key.name === "right") return moveRight(buf);
  if (key.name === "up") return moveUp(buf);
  if (key.name === "down") return moveDown(buf);
  if (key.name === "home" || (key.ctrl && key.name === "a")) return lineHome(buf);
  if (key.name === "end" || (key.ctrl && key.name === "e")) return lineEnd(buf);
  if (key.ctrl && key.name === "u") return clearLine(buf);
  if (key.ctrl && key.name === "w") {
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
  const [filePicker, setFilePicker] = useState<FilePickerState | null>(null);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [commandPicker, setCommandPicker] = useState<CommandPickerState | null>(null);
  const [commandDismissed, setCommandDismissed] = useState(false);
  const [history, setHistory] = useState(() => createHistory(opts.initialHistory));
  const historyRef = useRef(history);
  historyRef.current = history;
  const pendingD = useRef(false);
  const editingRef = useRef(false);
  const filesRef = useRef<string[]>([]);
  const loadGen = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // History is read from disk after mount, so the ring cannot be seeded at
  // first render. Adopt it only while nothing has been typed this session,
  // which keeps a late load from discarding prompts made in the meantime.
  useEffect(() => {
    const entries = opts.initialHistory;
    if (!entries?.length) return;
    setHistory((h) => (h.entries.length > 0 ? h : createHistory(entries)));
  }, [opts.initialHistory]);

  const resetBuffer = useCallback(() => {
    setBuffer(createBuffer(""));
    setVimMode("insert");
    pendingD.current = false;
    setFilePicker(null);
    setPickerDismissed(false);
    setCommandPicker(null);
    setCommandDismissed(false);
    setHistory((h) => release(h));
  }, []);

  /** Submit, recording the text for ↑ recall. */
  const submit = useCallback((value: string) => {
    setHistory((h) => remember(h, value));
    resetBuffer();
    optsRef.current.onSubmit(value);
  }, [resetBuffer]);

  const setValue = useCallback((value: string, cursor?: number) => {
    setBuffer(createBuffer(value, cursor));
  }, []);

  const selectMention = useCallback((path: string) => {
    const buf = bufferRef.current;
    const mention = activeMention(buf.value, buf.cursor) ?? activeMentionQuery(buf.value, buf.cursor);
    if (!mention) return;
    const next = applyMentionSelection(buf.value, mention, path);
    setBuffer(createBuffer(next.value, next.cursor));
    // Choosing a directory is a step, not an answer: keep the picker open so
    // the next level lists immediately.
    const isDirectory = path.endsWith("/");
    setFilePicker(null);
    setPickerDismissed(!isDirectory);
  }, []);

  useEffect(() => {
    const o = optsRef.current;
    const vim = o.editorMode === "vim";
    const insertOk = !vim || vimMode === "insert";
    if (o.blocked || !insertOk) {
      setFilePicker(null);
      return;
    }

    const mention = activeMentionQuery(buffer.value, buffer.cursor);
    if (!mention) {
      setPickerDismissed(false);
      setFilePicker(null);
      return;
    }
    if (pickerDismissed) {
      setFilePicker(null);
      return;
    }

    const gen = ++loadGen.current;
    void (async () => {
      try {
        // `@~/…`, `@/…` and `@../…` browse the filesystem directly; everything
        // else matches against the project index.
        const matches = isExternalQuery(mention.query)
          ? await listExternalMatches(mention.query)
          : filterFiles(mention.query, (filesRef.current = await listProjectFiles(o.cwd)));
        if (gen !== loadGen.current) return;
        setFilePicker((prev) => ({
          query: mention.query,
          matches,
          selected:
            prev && prev.query === mention.query && matches.length > 0
              ? Math.min(prev.selected, matches.length - 1)
              : 0,
        }));
      } catch {
        if (gen !== loadGen.current) return;
        setFilePicker({ query: mention.query, matches: [], selected: 0 });
      }
    })();
  }, [buffer.value, buffer.cursor, pickerDismissed, vimMode, opts.busy, opts.blocked, opts.cwd, opts.editorMode]);

  useEffect(() => {
    void listProjectFiles(opts.cwd)
      .then((files) => {
        filesRef.current = files;
      })
      .catch(() => {});
  }, [opts.cwd]);

  useEffect(() => {
    if (opts.blocked || commandDismissed) {
      setCommandPicker(null);
      return;
    }
    const matches = matchCommands(buffer.value);
    if (!matches || matches.length === 0) {
      setCommandPicker(null);
      return;
    }
    setCommandPicker((prev) => ({
      matches,
      selected: prev ? Math.min(prev.selected, matches.length - 1) : 0,
    }));
  }, [buffer.value, commandDismissed, opts.blocked]);

  usePaste((event) => {
    if (opts.isActive === false || opts.blocked || editingRef.current) return;
    const text = decodePasteBytes(event.bytes);
    const cleaned = normalizePaste(text);
    setBuffer((b) => insert(b, cleaned));
    const lines = cleaned.split("\n").length;
    if (cleaned.length > 200 || lines > 1) {
      const msg = `pasted ${cleaned.length} chars · ${lines} line${lines === 1 ? "" : "s"}`;
      setPasteHint(msg);
      opts.onPasteNotice?.(msg);
      setTimeout(() => setPasteHint(null), 2500);
    }
  });

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

  useKeyboard((key: KeyEvent) => {
    if (opts.isActive === false) return;
    if (opts.blocked || editingRef.current) return;

    if (key.name === "escape" && opts.busy) {
      opts.onAbort();
      return;
    }

    // Typing stays live while the agent works; Enter queues the message rather
    // than dropping the keystrokes.
    if (!opts.busy && key.shift && key.name === "tab" && opts.allowModeToggle !== false) {
      opts.onToggleAgentMode();
      return;
    }

    if (!opts.busy && key.ctrl && key.name === "g") {
      void openEditor();
      return;
    }

    const vim = opts.editorMode === "vim";
    const pickerOpen = Boolean(filePicker) && (!vim || vimMode === "insert");
    const commandOpen = Boolean(commandPicker) && (!vim || vimMode === "insert");
    const ch = keyChar(key);

    if (commandOpen && commandPicker) {
      if (key.name === "escape") {
        setCommandDismissed(true);
        setCommandPicker(null);
        return;
      }
      if (key.name === "up" || key.name === "down") {
        const delta = key.name === "up" ? -1 : 1;
        setCommandPicker((p) =>
          p && p.matches.length
            ? { ...p, selected: (p.selected + delta + p.matches.length) % p.matches.length }
            : p,
        );
        return;
      }
      if (key.name === "tab") {
        const command = commandPicker.matches[commandPicker.selected];
        if (command) {
          const completed = `/${command.name}${command.args ? " " : ""}`;
          setBuffer(createBuffer(completed));
          setCommandDismissed(Boolean(command.args));
        }
        return;
      }
    }

    if (pickerOpen && filePicker) {
      if (key.name === "escape") {
        setPickerDismissed(true);
        setFilePicker(null);
        return;
      }
      if (key.name === "up") {
        setFilePicker((p) =>
          p && p.matches.length
            ? { ...p, selected: (p.selected - 1 + p.matches.length) % p.matches.length }
            : p,
        );
        return;
      }
      if (key.name === "down") {
        setFilePicker((p) =>
          p && p.matches.length
            ? { ...p, selected: (p.selected + 1) % p.matches.length }
            : p,
        );
        return;
      }
      if (key.name === "tab" || (key.name === "return" && filePicker.matches.length > 0 && !key.shift)) {
        const path = filePicker.matches[filePicker.selected];
        if (path) {
          selectMention(path);
          return;
        }
      }
      if (key.name === "return" && filePicker.matches.length === 0 && !key.shift) {
        submit(buffer.value);
        return;
      }
      if (key.name === "tab") return;
    }

    if (key.name === "escape") {
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

    if (key.ctrl && (key.name === "j" || key.name === "return")) {
      if (!vim || vimMode === "insert") {
        setBuffer((b) => insert(b, "\n"));
      }
      return;
    }
    if (key.name === "return" && key.shift) {
      if (!vim || vimMode === "insert") {
        setBuffer((b) => insert(b, "\n"));
      }
      return;
    }

    if (key.name === "return") {
      submit(buffer.value);
      return;
    }

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
      if (ch === "h" || key.name === "left") {
        setBuffer((b) => moveLeft(b));
        return;
      }
      if (ch === "l" || key.name === "right") {
        setBuffer((b) => moveRight(b));
        return;
      }
      if (ch === "k" || key.name === "up") {
        setBuffer((b) => moveUp(b));
        return;
      }
      if (ch === "j" || key.name === "down") {
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

    if (pickerOpen && (key.name === "up" || key.name === "down")) return;

    // At the buffer's edges the arrows recall earlier prompts instead of doing
    // nothing; inside a multi-line draft they still move the cursor.
    if (key.name === "up" && onFirstLine(buffer)) {
      // Nothing typed yet: show the whole history rather than making the user
      // step blindly back through it one prompt at a time.
      if (!buffer.value && optsRef.current.onHistoryRecall?.()) return;
      const step = historyPrevious(historyRef.current, buffer.value);
      setHistory(step.history);
      if (step.value !== null) {
        setBuffer(createBuffer(step.value));
        return;
      }
    }
    if (key.name === "down" && onLastLine(buffer)) {
      const step = historyNext(historyRef.current);
      setHistory(step.history);
      if (step.value !== null) {
        setBuffer(createBuffer(step.value));
        return;
      }
    }

    if (key.name === "backspace" || key.name === "delete" || ch) {
      setPickerDismissed(false);
      setCommandDismissed(false);
      setHistory((h) => release(h));
    }

    setBuffer((b) => {
      const nav = applyEmacsNav(b, key);
      if (nav) return nav;
      if (key.name === "backspace") return backspace(b);
      if (key.name === "delete") return del(b);
      if (ch) return insert(b, ch);
      return b;
    });
  });

  return {
    buffer,
    vimMode: opts.editorMode === "vim" ? vimMode : "insert",
    pasteHint,
    filePicker,
    commandPicker,
    resetBuffer,
    setValue,
    setBuffer,
  };
}
