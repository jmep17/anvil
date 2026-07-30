import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCliRenderer,
  type ScrollBoxRenderable,
} from "@opentui/core";
import {
  createRoot,
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import type { ModelMessage } from "ai";
import { compactMessages } from "../agent/compact.ts";
import { runAgent } from "../agent/loop.ts";
import { probeServer } from "../agent/model.ts";
import type { AgentMode, AnvilConfig } from "../config/types.ts";
import { SessionStore } from "../session/store.ts";
import type { AgentEvent, PermissionDecision } from "../tools/index.ts";
import { allowAll } from "../tools/permissions.ts";
import { ConfigPanel } from "./ConfigPanel.tsx";
import { Footer, footerHeight } from "./Footer.tsx";
import { FilePicker, filePickerRows } from "./FilePicker.tsx";
import { Header, headerHeight } from "./Header.tsx";
import { InputBox, inputContentRows, permissionContentRows } from "./InputBox.tsx";
import { Timeline } from "./Timeline.tsx";
import { nextId, syncNextId, type TimelineItem } from "./types.ts";
import { expandFileMentions } from "./fileMentions.ts";
import { colors } from "./theme.ts";
import { usePromptInput } from "./usePromptInput.ts";
import { keyChar } from "./keys.ts";

interface Props {
  config: AnvilConfig;
  cwd: string;
  session: SessionStore;
  yes?: boolean;
  initialPrompt?: string;
}

export function App({ config: initialConfig, cwd, session, yes, initialPrompt }: Props) {
  const renderer = useRenderer();
  const { width: columns, height: rows } = useTerminalDimensions();
  const scrollRef = useRef<ScrollBoxRenderable>(null);
  const [config, setConfig] = useState(initialConfig);
  const configRef = useRef(config);
  configRef.current = config;
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [status, setStatus] = useState("starting…");
  const [serverReady, setServerReady] = useState(false);
  const [browsingHistory, setBrowsingHistory] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<{
    toolName: string;
    detail: string;
    preview?: string;
    resolve: (d: PermissionDecision) => void;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState("");
  const [thinking, setThinking] = useState("");
  const messagesRef = useRef<ModelMessage[]>([]);
  const startedRef = useRef(false);
  const thinkingAccRef = useRef("");
  const streamingAccRef = useRef("");
  const toolInputsRef = useRef(new Map<string, unknown>());

  const exit = useCallback(() => {
    renderer.destroy();
  }, [renderer]);

  const suspendTerminal = useCallback(
    async (fn: () => Promise<void>) => {
      renderer.suspend();
      try {
        await fn();
      } finally {
        renderer.resume();
      }
    },
    [renderer],
  );

  const refreshBrowseState = useCallback(() => {
    const sb = scrollRef.current;
    if (!sb) {
      setBrowsingHistory(false);
      return;
    }
    const view = sb.viewport.height;
    const atBottom = sb.scrollTop + view >= sb.scrollHeight - 1;
    setBrowsingHistory(!atBottom);
  }, []);

  const recordTimeline = useCallback(
    (item: TimelineItem) => {
      if (item.kind === "status" || item.kind === "thinking") return;
      void session.appendTimelineItem(item).catch(() => {});
    },
    [session],
  );

  const push = useCallback(
    (item: TimelineItem, persist = true) => {
      setItems((prev) => [...prev, item]);
      setBrowsingHistory(false);
      if (persist) recordTimeline(item);
    },
    [recordTimeline],
  );

  const flushLive = useCallback(() => {
    const thinkingText = thinkingAccRef.current.trim();
    if (thinkingText) {
      push({ kind: "thinking", id: nextId("th"), text: thinkingText }, false);
    }
    const assistantText = streamingAccRef.current;
    if (assistantText.trim()) {
      push({ kind: "assistant", id: nextId("a"), text: assistantText });
    }
    thinkingAccRef.current = "";
    streamingAccRef.current = "";
    setThinking("");
    setStreaming("");
  }, [push]);

  const upsertTool = useCallback((item: Extract<TimelineItem, { kind: "tool" }>) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.kind === "tool" && x.id === item.id);
      if (idx === -1) return [...prev, item];
      const next = prev.slice();
      next[idx] = item;
      return next;
    });
  }, []);

  const refreshStatus = useCallback(
    (cfg: AnvilConfig, agentMode: AgentMode) => {
      setStatus(`online · ${cfg.model} · ${agentMode} · session ${session.id}`);
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
      if (serverReady) refreshStatus({ ...configRef.current, mode: next }, next);
      push({ kind: "status", id: nextId("s"), text: `mode → ${next}` });
    },
    [initialConfig, push, refreshStatus, serverReady],
  );

  const toggleMode = useCallback(() => {
    applyMode(configRef.current.mode === "plan" ? "build" : "plan");
  }, [applyMode]);

  const checkConnection = useCallback(
    async (cfg = configRef.current) => {
      setStatus(`checking ${cfg.baseURL}…`);
      const probe = await probeServer(cfg);
      if (!probe.ok) {
        setServerReady(false);
        setStatus(`offline · ${probe.detail}`);
        push(
          {
            kind: "error",
            id: nextId("e"),
            text: `Cannot reach ${cfg.baseURL}. Start or configure the model server, then enter /retry. (${probe.detail})`,
          },
          false,
        );
        return false;
      }
      setServerReady(true);
      refreshStatus(cfg, cfg.mode);
      return true;
    },
    [push, refreshStatus],
  );

  const askPermission = useCallback(
    (toolName: string, detail: string, preview?: string) => {
      if (yes) return allowAll(toolName, detail, preview);
      return new Promise<PermissionDecision>((resolve) => {
        setPendingPermission({ toolName, detail, preview, resolve });
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
      if (text === "/retry") {
        void checkConnection();
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

      if (!serverReady) {
        push(
          {
            kind: "error",
            id: nextId("e"),
            text: "Model server is offline. Enter /retry after it is available.",
          },
          false,
        );
        return;
      }

      setBusy(true);
      setStreaming("");
      setThinking("");
      thinkingAccRef.current = "";
      streamingAccRef.current = "";
      const { displayText, modelText } = await expandFileMentions(text, cwd);
      push({ kind: "user", id: nextId("u"), text: displayText });
      const userMsg: ModelMessage = { role: "user", content: modelText };
      const before = messagesRef.current.length;
      const nextMessages = [...messagesRef.current, userMsg];
      messagesRef.current = nextMessages;
      await session.appendMessage(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;
      let streamedAny = false;

      const onEvent = (event: AgentEvent) => {
        if (event.type === "text") {
          streamedAny = true;
          streamingAccRef.current += event.text;
          setStreaming(streamingAccRef.current);
        } else if (event.type === "thinking") {
          thinkingAccRef.current += event.text;
          setThinking(thinkingAccRef.current);
        } else if (event.type === "tool_start") {
          flushLive();
          toolInputsRef.current.set(event.id, event.input);
          upsertTool({
            kind: "tool",
            id: event.id,
            name: event.name,
            input: event.input,
            status: "running",
          });
        } else if (event.type === "tool_end") {
          const nextItem: Extract<TimelineItem, { kind: "tool" }> = {
            kind: "tool",
            id: event.id,
            name: event.name,
            input: toolInputsRef.current.get(event.id),
            status: event.error ? "error" : "done",
            output: event.output,
            ms: event.ms,
          };
          toolInputsRef.current.delete(event.id);
          upsertTool(nextItem);
          recordTimeline(nextItem);
        } else if (event.type === "status") {
          push({ kind: "status", id: nextId("s"), text: event.message }, false);
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
        flushLive();
        if (!streamedAny && result.text?.trim()) {
          push({ kind: "assistant", id: nextId("a"), text: result.text });
        }
        for (const h of result.mcpHandles) await h.close().catch(() => {});
      } catch (err) {
        flushLive();
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
    [
      applyMode,
      askPermission,
      busy,
      checkConnection,
      cwd,
      exit,
      flushLive,
      push,
      recordTimeline,
      serverReady,
      session,
      upsertTool,
    ],
  );

  const prompt = usePromptInput({
    busy,
    blocked: Boolean(pendingPermission) || showConfig,
    editorMode: config.ui.editorMode,
    editor: config.ui.editor,
    cwd,
    suspendTerminal,
    onSubmit: (text) => void submit(text),
    onAbort: () => abortRef.current?.abort(),
    onToggleAgentMode: toggleMode,
    onPasteNotice: (msg) => push({ kind: "status", id: nextId("s"), text: msg }),
    isActive: !showConfig && !pendingPermission,
  });

  useEffect(() => {
    (async () => {
      const loaded = await session.loadMessages();
      messagesRef.current = loaded;
      const transcript = await session.loadTimeline();
      if (transcript.length > 0) {
        syncNextId(transcript);
        setItems(transcript);
      } else if (loaded.length > 0) {
        push(
          {
            kind: "status",
            id: nextId("s"),
            text: `resumed ${loaded.length} model messages; prior visual transcript is unavailable`,
          },
          false,
        );
      }
      const online = await checkConnection(config);
      if (online && initialPrompt && !startedRef.current) {
        startedRef.current = true;
        void submit(initialPrompt);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe once on mount
  }, []);

  const vimExtra = config.ui.editorMode === "vim" ? 1 : 0;
  const pasteExtra = prompt.pasteHint ? 1 : 0;
  const pickerExtra = prompt.filePicker ? filePickerRows(prompt.filePicker.matches) : 0;
  const inputContent = pendingPermission
    ? permissionContentRows(pendingPermission, columns || 80)
    : inputContentRows(prompt.buffer.value, columns || 80) + vimExtra + pasteExtra;
  const inputRows = inputContent + 2 + pickerExtra;
  const footerState = {
    busy,
    editorMode: config.ui.editorMode,
    vimMode: prompt.vimMode,
    showConfig,
    browsingHistory,
    filePicker: Boolean(prompt.filePicker),
  };
  const chrome =
    headerHeight(status, columns || 80) + inputRows + footerHeight(footerState, columns || 80);
  const timelineLines = Math.max(3, (rows || 24) - chrome);

  useKeyboard((key) => {
    if (pendingPermission) {
      const ch = keyChar(key);
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
    if (showConfig) return;

    if (key.name === "pageup") {
      const step = Math.max(1, Math.floor(timelineLines * 0.8));
      scrollRef.current?.scrollBy(-step);
      refreshBrowseState();
    } else if (key.name === "pagedown") {
      const step = Math.max(1, Math.floor(timelineLines * 0.8));
      scrollRef.current?.scrollBy(step);
      refreshBrowseState();
    }
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height={rows || undefined}
      backgroundColor={colors.canvas}
    >
      <Header status={status} columns={columns || 80} />
      <box flexGrow={1} flexDirection="column" height={timelineLines}>
        <Timeline
          items={items}
          columns={columns || 80}
          thinking={thinking}
          streaming={streaming}
          scrollRef={scrollRef}
        />
      </box>
      {showConfig ? (
        <ConfigPanel
          config={config}
          onChange={(next) => {
            setConfig(next);
            Object.assign(initialConfig, next);
            void checkConnection(next);
          }}
          onClose={() => setShowConfig(false)}
          onStatus={(msg) => push({ kind: "status", id: nextId("s"), text: msg })}
          connectionStatus={status}
          onRetryConnection={() => void checkConnection()}
        />
      ) : (
        <>
          {prompt.filePicker ? (
            <FilePicker
              matches={prompt.filePicker.matches}
              selected={prompt.filePicker.selected}
              query={prompt.filePicker.query}
              columns={columns || 80}
            />
          ) : null}
          <InputBox
            value={prompt.buffer.value}
            cursor={prompt.buffer.cursor}
            busy={busy}
            vimMode={prompt.vimMode}
            editorMode={config.ui.editorMode}
            pasteHint={prompt.pasteHint}
            columns={columns || 80}
            pending={
              pendingPermission
                ? {
                    toolName: pendingPermission.toolName,
                    detail: pendingPermission.detail,
                    preview: pendingPermission.preview,
                  }
                : null
            }
          />
        </>
      )}
      <Footer
        busy={busy}
        editorMode={config.ui.editorMode}
        vimMode={prompt.vimMode}
        showConfig={showConfig}
        browsingHistory={browsingHistory}
        filePicker={Boolean(prompt.filePicker)}
        columns={columns || 80}
      />
    </box>
  );
}

export async function runTui(opts: {
  config: AnvilConfig;
  cwd: string;
  session: SessionStore;
  yes?: boolean;
  prompt?: string;
}): Promise<void> {
  const { createElement } = await import("react");
  await new Promise<void>(async (resolve, reject) => {
    try {
      const renderer = await createCliRenderer({
        screenMode: "alternate-screen",
        exitOnCtrlC: true,
        useMouse: true,
        onDestroy: () => resolve(),
      });
      const root = createRoot(renderer);
      root.render(
        createElement(App, {
          config: opts.config,
          cwd: opts.cwd,
          session: opts.session,
          yes: opts.yes,
          initialPrompt: opts.prompt,
        }),
      );
    } catch (err) {
      reject(err);
    }
  });
}
