import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AgentMode, AnvilConfig, EditorMode } from "../config/types.ts";
import {
  globalConfigPath,
  readJsonObject,
  setAtPath,
  writeJsonObject,
} from "../config/cli.ts";

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
  connectionStatus,
  onRetryConnection,
}: {
  config: AnvilConfig;
  onChange: (next: AnvilConfig) => void;
  onClose: () => void;
  onStatus?: (msg: string) => void;
  connectionStatus?: string;
  onRetryConnection?: () => void;
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
      // clear override
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
    let next = { ...config, ui: { ...config.ui } };
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

  useInput((ch, key) => {
    if (editing) {
      if (key.escape) {
        setEditing(false);
        return;
      }
      if (key.return) {
        void commitEdit();
        return;
      }
      if (key.backspace || key.delete) {
        setDraft((d) => d.slice(0, -1));
        return;
      }
      if (ch && !key.ctrl && !key.meta) setDraft((d) => d + ch);
      return;
    }

    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setSelected((s) => (s <= 0 ? FIELDS.length - 1 : s - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((s) => (s + 1) % FIELDS.length);
      return;
    }
    if (key.return) {
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
    if (ch === "r") {
      onRetryConnection?.();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      width="100%"
      flexShrink={0}
    >
      <Text bold color="cyan">
        /config
      </Text>
      <Text dimColor>↑/↓ select · Enter edit/toggle · Esc close · saves to ~/.anvil/config.json</Text>
      <Text dimColor>
        Server: {connectionStatus ?? "unknown"} · API key: {config.apiKey ? "configured" : "missing"} · MCP: {Object.keys(config.mcpServers).length} configured · r retry
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {FIELDS.map((f, i) => {
          const active = i === selected;
          const val = displayValue(config, f.id);
          return (
            <Box key={f.id}>
              <Text color={active ? "green" : undefined} inverse={active && !editing}>
                {active ? "› " : "  "}
                {f.label.padEnd(16)}
              </Text>
              {editing && active ? (
                <Text color="yellow">
                  {draft}
                  <Text dimColor>█</Text>
                </Text>
              ) : (
                <Text dimColor={!active}>{val}</Text>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
