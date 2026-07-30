import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, useApp, useInput, useWindowSize } from "ink";
import type { ModelMessage } from "ai";
import { compactMessages } from "../agent/compact.ts";
import { runAgent } from "../agent/loop.ts";
import { probeServer } from "../agent/model.ts";
import type { AgentMode, AnvilConfig } from "../config/types.ts";
import { SessionStore } from "../session/store.ts";
import type { AgentEvent, PermissionDecision } from "../tools/index.ts";
import { allowAll } from "../tools/permissions.ts";
import { ACTIVITY_RESERVE, Activity } from "./Activity.tsx";
import { ConfigPanel } from "./ConfigPanel.tsx";
import { Footer } from "./Footer.tsx";
import { Header } from "./Header.tsx";
import { InputBox } from "./InputBox.tsx";
import { Timeline } from "./Timeline.tsx";
import { nextId, type TimelineItem } from "./types.ts";
import { usePromptInput } from "./usePromptInput.ts";

interface Props {
  config: AnvilConfig;
  cwd: string;
  session: SessionStore;
  yes?: boolean;
  initialPrompt?: string;
}

export function App({ config: initialConfig, cwd, session, yes, initialPrompt }: Props) {
  const { exit, suspendTerminal } = useApp();
  const { rows, columns } = useWindowSize();
  const [config, setConfig] = useState(initialConfig);
  const configRef = useRef(config);
  configRef.current = config;
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState("starting…");
  const [mode, setMode] = useState(config.mode);
  const [showConfig, setShowConfig] = useState(false);
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

  const refreshStatus = useCallback(
    (cfg: AnvilConfig, agentMode: AgentMode) => {
      setStatus(`${cfg.model} · ${agentMode} · session ${session.id}`);
    },
    [session.id],
  );

  const applyMode = useCallback(
    (next: AgentMode) => {
      setConfig((c) => {
        const updated = { ...c, mode: next };
        configRef.current = updated;
        Object.assign(initialConfig, updated);
        return updated;
      });
      setMode(next);
      refreshStatus({ ...configRef.current, mode: next }, next);
      push({ kind: "status", id: nextId("s"), text: `mode → ${next}` });
    },
    [initialConfig, push, refreshStatus],
  );

  const toggleMode = useCallback(() => {
    applyMode(configRef.current.mode === "plan" ? "build" : "plan");
  }, [applyMode]);

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
      if (text === "/config") {
        setShowConfig(true);
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
        const next = compactMessages(
          messagesRef.current,
          configRef.current.contextLength,
          8,
        );
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
          config: configRef.current,
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
    [applyMode, askPermission, busy, cwd, exit, push, session, upsertTool],
  );

  const prompt = usePromptInput({
    busy,
    blocked: Boolean(pendingPermission) || showConfig,
    editorMode: config.ui.editorMode,
    editor: config.ui.editor,
    suspendTerminal,
    onSubmit: (text) => void submit(text),
    onAbort: () => abortRef.current?.abort(),
    onToggleAgentMode: toggleMode,
    onPasteNotice: (msg) => push({ kind: "status", id: nextId("s"), text: msg }),
    isActive: !showConfig && !pendingPermission,
  });

  useEffect(() => {
    (async () => {
      const probe = await probeServer(config);
      if (!probe.ok) {
        setStatus(`offline: ${probe.detail}`);
        push({ kind: "error", id: nextId("e"), text: `Cannot reach ${config.baseURL}` });
        return;
      }
      refreshStatus(config, mode);
      const loaded = await session.loadMessages();
      messagesRef.current = loaded;
      if (initialPrompt && !startedRef.current) {
        startedRef.current = true;
        void submit(initialPrompt);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe once on mount
  }, []);

  useInput((ch, key) => {
    if (!pendingPermission) return;
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
  });

  const runningTools = items.filter(
    (i): i is Extract<TimelineItem, { kind: "tool" }> =>
      i.kind === "tool" && i.status === "running",
  );
  const timelineItems = items.filter(
    (i) => !(i.kind === "tool" && i.status === "running"),
  );

  const inputLines = Math.max(1, prompt.buffer.value.split("\n").length);
  const vimExtra = config.ui.editorMode === "vim" ? 1 : 0;
  const pasteExtra = prompt.pasteHint ? 1 : 0;
  // Header 3 + input (borders+content) + reserved activity + footer 1.
  // The transcript is deliberately top-aligned, like a regular coding-agent
  // terminal, rather than floating above the prompt in the middle of the page.
  const inputContent = pendingPermission
    ? 2
    : Math.min(inputLines, 6) + vimExtra + pasteExtra;
  const inputRows = inputContent + 2;
  const activityActive =
    busy || Boolean(thinking) || Boolean(streaming) || runningTools.length > 0;
  const activityRows = activityActive ? ACTIVITY_RESERVE : 0;
  const chrome = 3 + inputRows + activityRows + 1;
  const timelineLines = Math.max(3, (rows || 24) - chrome);

  return (
    <Box flexDirection="column" width="100%" height={rows || undefined}>
      <Header status={status} />
      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        <Timeline items={timelineItems} maxLines={timelineLines} columns={columns || 80} />
        <Activity
          busy={busy}
          thinking={thinking}
          streaming={streaming}
          runningTools={runningTools}
          columns={columns || 80}
        />
      </Box>
      {showConfig ? (
        <ConfigPanel
          config={config}
          onChange={(next) => {
            setConfig(next);
            // keep mutable reference used by agent loop in sync
            Object.assign(initialConfig, next);
            setMode(next.mode);
            refreshStatus(next, next.mode);
          }}
          onClose={() => setShowConfig(false)}
          onStatus={(msg) => push({ kind: "status", id: nextId("s"), text: msg })}
        />
      ) : (
        <InputBox
          value={prompt.buffer.value}
          cursor={prompt.buffer.cursor}
          busy={busy}
          vimMode={prompt.vimMode}
          editorMode={config.ui.editorMode}
          pasteHint={prompt.pasteHint}
          pending={
            pendingPermission
              ? { toolName: pendingPermission.toolName, detail: pendingPermission.detail }
              : null
          }
        />
      )}
      <Footer
        busy={busy}
        editorMode={config.ui.editorMode}
        vimMode={prompt.vimMode}
        showConfig={showConfig}
      />
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
