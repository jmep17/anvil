import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, useApp, useInput, usePaste, useWindowSize } from "ink";
import type { ModelMessage } from "ai";
import { compactMessages } from "../agent/compact.ts";
import { runAgent } from "../agent/loop.ts";
import { probeServer } from "../agent/model.ts";
import type { AgentMode, AnvilConfig } from "../config/types.ts";
import { SessionStore } from "../session/store.ts";
import type { AgentEvent, PermissionDecision } from "../tools/index.ts";
import { allowAll } from "../tools/permissions.ts";
import { Activity } from "./Activity.tsx";
import { Footer } from "./Footer.tsx";
import { Header } from "./Header.tsx";
import { InputBox } from "./InputBox.tsx";
import { Timeline } from "./Timeline.tsx";
import { nextId, type TimelineItem } from "./types.ts";

interface Props {
  config: AnvilConfig;
  cwd: string;
  session: SessionStore;
  yes?: boolean;
  initialPrompt?: string;
}

export function App({ config, cwd, session, yes, initialPrompt }: Props) {
  const { exit } = useApp();
  const { rows } = useWindowSize();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState("starting…");
  const [mode, setMode] = useState(config.mode);
  const [pendingPermission, setPendingPermission] = useState<{
    toolName: string;
    detail: string;
    resolve: (d: PermissionDecision) => void;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState("");
  const [thinking, setThinking] = useState("");
  const messagesRef = useRef<ModelMessage[]>([]);
  const startedRef = useRef(false);
  const thinkingAccRef = useRef("");

  const push = useCallback((item: TimelineItem) => {
    setItems((prev) => [...prev.slice(-200), item]);
  }, []);

  const upsertTool = useCallback((item: Extract<TimelineItem, { kind: "tool" }>) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.kind === "tool" && x.id === item.id);
      if (idx === -1) return [...prev.slice(-200), item];
      const next = prev.slice();
      next[idx] = item;
      return next;
    });
  }, []);

  const applyMode = useCallback(
    (next: AgentMode) => {
      config.mode = next;
      setMode(next);
      setStatus(`${config.model} · ${next} · session ${session.id}`);
      push({ kind: "status", id: nextId("s"), text: `mode → ${next}` });
    },
    [config, push, session.id],
  );

  const toggleMode = useCallback(() => {
    applyMode(config.mode === "plan" ? "build" : "plan");
  }, [applyMode, config]);

  const askPermission = useCallback(
    (toolName: string, detail: string) => {
      if (yes) return allowAll(toolName, detail);
      return new Promise<PermissionDecision>((resolve) => {
        setPendingPermission({ toolName, detail, resolve });
      });
    },
    [yes],
  );

  const submit = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      if (text === "/exit") {
        exit();
        return;
      }
      if (text.startsWith("/mode ")) {
        const m = text.slice(6).trim();
        if (m === "plan" || m === "build") {
          applyMode(m);
        }
        return;
      }
      if (text === "/compact") {
        const next = compactMessages(messagesRef.current, config.contextLength, 8);
        messagesRef.current = next;
        push({
          kind: "status",
          id: nextId("s"),
          text: `compacted to ${next.length} messages`,
        });
        return;
      }

      setBusy(true);
      setStreaming("");
      setThinking("");
      thinkingAccRef.current = "";
      push({ kind: "user", id: nextId("u"), text });
      const userMsg: ModelMessage = { role: "user", content: text };
      const before = messagesRef.current.length;
      const nextMessages = [...messagesRef.current, userMsg];
      messagesRef.current = nextMessages;
      await session.appendMessage(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;

      const onEvent = (event: AgentEvent) => {
        if (event.type === "text") {
          setStreaming((s) => s + event.text);
        } else if (event.type === "thinking") {
          thinkingAccRef.current += event.text;
          setThinking(thinkingAccRef.current);
        } else if (event.type === "tool_start") {
          upsertTool({
            kind: "tool",
            id: event.id,
            name: event.name,
            input: event.input,
            status: "running",
          });
        } else if (event.type === "tool_end") {
          setItems((prev) => {
            const prior = prev.find((x) => x.kind === "tool" && x.id === event.id);
            const input = prior && prior.kind === "tool" ? prior.input : undefined;
            const nextItem: TimelineItem = {
              kind: "tool",
              id: event.id,
              name: event.name,
              input,
              status: event.error ? "error" : "done",
              output: event.output,
              ms: event.ms,
            };
            const idx = prev.findIndex((x) => x.kind === "tool" && x.id === event.id);
            if (idx === -1) return [...prev.slice(-200), nextItem];
            const copy = prev.slice();
            copy[idx] = nextItem;
            return copy;
          });
        } else if (event.type === "status") {
          push({ kind: "status", id: nextId("s"), text: event.message });
        } else if (event.type === "error") {
          push({ kind: "error", id: nextId("e"), text: event.message });
        }
      };

      try {
        const result = await runAgent({
          config,
          cwd,
          messages: nextMessages,
          askPermission,
          abortSignal: controller.signal,
          onEvent,
        });
        const added = result.messages.slice(before + 1);
        for (const m of added) await session.appendMessage(m);
        messagesRef.current = result.messages;
        if (thinkingAccRef.current.trim()) {
          push({
            kind: "thinking",
            id: nextId("th"),
            text: thinkingAccRef.current.trim(),
          });
        }
        if (result.text) {
          push({ kind: "assistant", id: nextId("a"), text: result.text });
        }
        setStreaming("");
        setThinking("");
        thinkingAccRef.current = "";
        for (const h of result.mcpHandles) await h.close().catch(() => {});
      } catch (err) {
        push({
          kind: "error",
          id: nextId("e"),
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [applyMode, askPermission, busy, config, cwd, exit, push, session, upsertTool],
  );

  useEffect(() => {
    (async () => {
      const probe = await probeServer(config);
      if (!probe.ok) {
        setStatus(`offline: ${probe.detail}`);
        push({ kind: "error", id: nextId("e"), text: `Cannot reach ${config.baseURL}` });
        return;
      }
      setStatus(`${config.model} · ${mode} · session ${session.id}`);
      const loaded = await session.loadMessages();
      messagesRef.current = loaded;
      if (initialPrompt && !startedRef.current) {
        startedRef.current = true;
        void submit(initialPrompt);
      }
    })();
  }, [config, initialPrompt, mode, push, session, submit]);

  usePaste(
    (text) => {
      if (busy || pendingPermission) return;
      setInput((v) => v + text);
    },
    { isActive: !busy && !pendingPermission },
  );

  useInput((ch, key) => {
    if (pendingPermission) {
      if (ch === "a") {
        pendingPermission.resolve("allow");
        setPendingPermission(null);
      } else if (ch === "A") {
        pendingPermission.resolve("always");
        setPendingPermission(null);
      } else if (ch === "d" || ch === "n") {
        pendingPermission.resolve("deny");
        setPendingPermission(null);
      }
      return;
    }

    if (key.escape) {
      if (busy && abortRef.current) {
        abortRef.current.abort();
        return;
      }
      if (!busy && input) {
        setInput("");
      }
      return;
    }

    if (busy) return;

    if (key.shift && key.tab) {
      toggleMode();
      return;
    }

    // Ctrl+J → newline
    if (key.ctrl && (ch === "j" || ch === "\n" || ch === "\r")) {
      setInput((v) => v + "\n");
      return;
    }

    // Shift+Enter → newline when terminal reports it
    if (key.return && key.shift) {
      setInput((v) => v + "\n");
      return;
    }

    if (key.return) {
      const value = input;
      setInput("");
      void submit(value);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((v) => v.slice(0, -1));
      return;
    }

    if (ch && !key.ctrl && !key.meta) {
      setInput((v) => v + ch);
    }
  });

  // Layout budget: header(~3) + footer(1) + input(~3+) + activity(~0-4) + margins
  const inputLines = Math.max(1, input.split("\n").length);
  const activityBudget =
    (busy ? 1 : 0) +
    (thinking ? 1 : 0) +
    (streaming ? Math.min(4, Math.ceil(streaming.length / 80)) : 0) +
    items.filter((i) => i.kind === "tool" && i.status === "running").length;
  const chrome = 3 + 1 + Math.min(inputLines + 2, 8) + Math.min(activityBudget, 6) + 2;
  const timelineLines = Math.max(4, (rows || 24) - chrome);

  const runningTools = items.filter(
    (i): i is Extract<TimelineItem, { kind: "tool" }> =>
      i.kind === "tool" && i.status === "running",
  );

  // Completed tools stay in timeline; hide running ones from timeline (shown in Activity)
  const timelineItems = items.filter(
    (i) => !(i.kind === "tool" && i.status === "running"),
  );

  return (
    <Box flexDirection="column" width="100%" height={rows || undefined}>
      <Header status={status} busy={busy} />
      <Box flexGrow={1} flexDirection="column" marginY={1}>
        <Timeline items={timelineItems} maxLines={timelineLines} />
        <Activity
          busy={busy}
          thinking={thinking}
          streaming={streaming}
          runningTools={runningTools}
        />
      </Box>
      <InputBox
        value={input}
        busy={busy}
        pending={
          pendingPermission
            ? { toolName: pendingPermission.toolName, detail: pendingPermission.detail }
            : null
        }
      />
      <Footer busy={busy} />
    </Box>
  );
}

export async function runTui(opts: {
  config: AnvilConfig;
  cwd: string;
  session: SessionStore;
  yes?: boolean;
  prompt?: string;
}): Promise<void> {
  const { render } = await import("ink");
  const instance = render(
    React.createElement(App, {
      config: opts.config,
      cwd: opts.cwd,
      session: opts.session,
      yes: opts.yes,
      initialPrompt: opts.prompt,
    }),
    { alternateScreen: true, exitOnCtrlC: true },
  );
  await instance.waitUntilExit();
}
