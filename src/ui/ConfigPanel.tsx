import { useState } from "react";
import { TextAttributes, type KeyEvent } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { AgentMode, AnvilConfig, EditorMode } from "../config/types.ts";
import {
  globalConfigPath,
  readJsonObject,
  setAtPath,
  writeJsonObject,
} from "../config/cli.ts";
import { keyChar } from "./keys.ts";
import { colors } from "./theme.ts";
import { wrapDisplayLines } from "./format.ts";

export type ConfigField =
  | "model"
  | "mode"
  | "editorMode"
  | "editor"
  | "contextLength"
  | "maxSteps"
  | "baseURL";

const FIELDS: { id: ConfigField; label: string; kind: "text" | "toggle" | "number" }[] = [
  { id: "model", label: "Model", kind: "text" },
  { id: "mode", label: "Mode", kind: "toggle" },
  { id: "editorMode", label: "Editor mode", kind: "toggle" },
  { id: "editor", label: "External editor", kind: "text" },
  { id: "contextLength", label: "Context length", kind: "number" },
  { id: "maxSteps", label: "Max steps", kind: "number" },
  { id: "baseURL", label: "Base URL", kind: "text" },
];

export function configVisibleRange(selected: number, maxRows: number, columns: number) {
  const contentWidth = Math.max(8, columns - 2);
  const hintLines = wrapDisplayLines(
    "↑/↓ select · Enter edit/toggle · r retry · Esc close",
    contentWidth,
  );
  // Keep a row available for the selection. On a narrow, short terminal the
  // help text yields first, never the options themselves.
  const showHint = maxRows >= hintLines.length + 2;
  const visibleCount = Math.max(1, maxRows - 1 - (showHint ? hintLines.length : 0));
  const start = Math.min(
    Math.max(0, selected - visibleCount + 1),
    Math.max(0, FIELDS.length - visibleCount),
  );
  return {
    start,
    end: Math.min(FIELDS.length, start + visibleCount),
    contentWidth,
    hintLines: showHint ? hintLines : [],
  };
}

function clip(text: string, width: number): string {
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(1, width - 1))}…`;
}

function displayValue(config: AnvilConfig, id: ConfigField): string {
  switch (id) {
    case "model":
      return config.model;
    case "mode":
      return config.mode;
    case "editorMode":
      return config.ui.editorMode;
    case "editor":
      return config.ui.editor ?? "(env default)";
    case "contextLength":
      return String(config.contextLength);
    case "maxSteps":
      return String(config.maxSteps);
    case "baseURL":
      return config.baseURL;
  }
}

function pathForField(id: ConfigField): string[] {
  switch (id) {
    case "editorMode":
      return ["ui", "editorMode"];
    case "editor":
      return ["ui", "editor"];
    default:
      return [id];
  }
}

export function ConfigPanel({
  config,
  onChange,
  onClose,
  onStatus,
  onRetryConnection,
  columns,
  maxRows,
}: {
  config: AnvilConfig;
  onChange: (next: AnvilConfig) => void;
  onClose: () => void;
  onStatus?: (msg: string) => void;
  onRetryConnection?: () => void;
  columns: number;
  maxRows: number;
}) {
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const persist = async (next: AnvilConfig, field: ConfigField) => {
    onChange(next);
    const path = globalConfigPath();
    const obj = await readJsonObject(path);
    const keyPath = pathForField(field);
    let value: unknown;
    switch (field) {
      case "model":
        value = next.model;
        break;
      case "mode":
        value = next.mode;
        break;
      case "editorMode":
        value = next.ui.editorMode;
        break;
      case "editor":
        value = next.ui.editor ?? "";
        break;
      case "contextLength":
        value = next.contextLength;
        break;
      case "maxSteps":
        value = next.maxSteps;
        break;
      case "baseURL":
        value = next.baseURL;
        break;
    }
    if (field === "editor" && value === "") {
      const ui = (obj.ui as Record<string, unknown> | undefined) ?? {};
      delete ui.editor;
      obj.ui = ui;
    } else {
      setAtPath(obj, keyPath, value);
    }
    await writeJsonObject(path, obj);
    onStatus?.(`saved ${keyPath.join(".")} → ${String(value || "(default)")}`);
  };

  const applyToggle = async (field: ConfigField) => {
    if (field === "mode") {
      const mode: AgentMode = config.mode === "plan" ? "build" : "plan";
      await persist({ ...config, mode }, field);
      return;
    }
    if (field === "editorMode") {
      const editorMode: EditorMode = config.ui.editorMode === "vim" ? "emacs" : "vim";
      await persist({ ...config, ui: { ...config.ui, editorMode } }, field);
    }
  };

  const commitEdit = async () => {
    const field = FIELDS[selected]!;
    const raw = draft.trim();
    const next = { ...config, ui: { ...config.ui } };
    if (field.id === "model") next.model = raw || config.model;
    else if (field.id === "baseURL") next.baseURL = raw || config.baseURL;
    else if (field.id === "editor") {
      next.ui.editor = raw || undefined;
    } else if (field.id === "contextLength") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        setEditing(false);
        return;
      }
      next.contextLength = Math.floor(n);
    } else if (field.id === "maxSteps") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        setEditing(false);
        return;
      }
      next.maxSteps = Math.floor(n);
    }
    setEditing(false);
    await persist(next, field.id);
  };

  useKeyboard((key: KeyEvent) => {
    if (editing) {
      if (key.name === "escape") {
        setEditing(false);
        return;
      }
      if (key.name === "return") {
        void commitEdit();
        return;
      }
      if (key.name === "backspace" || key.name === "delete") {
        setDraft((d) => d.slice(0, -1));
        return;
      }
      const ch = keyChar(key);
      if (ch) setDraft((d) => d + ch);
      return;
    }

    if (key.name === "escape") {
      onClose();
      return;
    }
    if (key.name === "up") {
      setSelected((s) => (s <= 0 ? FIELDS.length - 1 : s - 1));
      return;
    }
    if (key.name === "down") {
      setSelected((s) => (s + 1) % FIELDS.length);
      return;
    }
    if (key.name === "return") {
      const field = FIELDS[selected]!;
      if (field.kind === "toggle") {
        void applyToggle(field.id);
        return;
      }
      setDraft(
        field.id === "editor" ? (config.ui.editor ?? "") : displayValue(config, field.id),
      );
      setEditing(true);
      return;
    }
    if (keyChar(key) === "r") {
      onRetryConnection?.();
    }
  });

  const range = configVisibleRange(selected, maxRows, columns);
  return (
    <box
      flexDirection="column"
      border={["left"]}
      borderColor={colors.border}
      paddingX={1}
      width="100%"
      flexShrink={0}
    >
      <text fg={colors.purple} attributes={TextAttributes.BOLD}>
        {`CONFIGURATION  ${selected + 1}/${FIELDS.length}`}
      </text>
      {range.hintLines.map((line, index) => (
        <text key={`hint-${index}`} fg={colors.muted} attributes={TextAttributes.DIM}>
          {line}
        </text>
      ))}
      <box flexDirection="column">
        {FIELDS.slice(range.start, range.end).map((f, offset) => {
          const i = range.start + offset;
          const active = i === selected;
          const val = displayValue(config, f.id);
          const value = editing && active ? `${draft}█` : val;
          const row = `${active ? "›" : " "} ${f.label}: ${value}`;
          return (
            <box
              key={f.id}
              flexDirection="row"
              backgroundColor={active ? colors.selectionBg : undefined}
            >
              <text
                fg={active ? colors.selectionFg : colors.text}
                attributes={active ? TextAttributes.BOLD : TextAttributes.NONE}
              >
                {clip(row, range.contentWidth)}
              </text>
            </box>
          );
        })}
      </box>
    </box>
  );
}
