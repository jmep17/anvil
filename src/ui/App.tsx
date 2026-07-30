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
import { compactMessages, estimateTokens } from "../agent/compact.ts";
import { describeNow } from "../agent/datetime.ts";
import { runAgent } from "../agent/loop.ts";
import { probeServer } from "../agent/model.ts";
import { formatReviewedPlan, type ReviewedPlan } from "../agent/planHarness.ts";
import type { AgentMode, AnvilConfig } from "../config/types.ts";
import { SessionStore, type SessionSummary } from "../session/store.ts";
import type { AgentEvent, PermissionDecision } from "../tools/index.ts";
import { allowAll } from "../tools/permissions.ts";
import { CommandPicker, commandPickerRows } from "./CommandPicker.tsx";
import { findCommand, helpText, parseCommand } from "./commands.ts";
import { ConfigPanel } from "./ConfigPanel.tsx";
import { Footer, footerHeight } from "./Footer.tsx";
import { FilePicker, filePickerRows } from "./FilePicker.tsx";
import {
  InputBox,
  PERMISSION_CHOICES,
  PLAN_CHOICES,
  inputContentRows,
  permissionContentRows,
  planReviewContentRows,
} from "./InputBox.tsx";
import { SessionPicker, sessionPickerRows } from "./SessionPicker.tsx";
import { Timeline } from "./Timeline.tsx";
import { Welcome, welcomeHeight } from "./Welcome.tsx";
import { Working, workingHeight } from "./Working.tsx";
import { nextId, syncNextId, type TimelineItem } from "./types.ts";
import { expandFileMentions } from "./fileMentions.ts";
import {
  applyPalette,
  buildPalette,
  resolveBackground,
  warmMarkdownParser,
  type ThemeMode,
} from "./theme.ts";
import { usePromptInput } from "./usePromptInput.ts";
import { keyChar } from "./keys.ts";

interface Props {
  config: AnvilConfig;
  cwd: string;
  session: SessionStore;
  yes?: boolean;
  initialPrompt?: string;
}

export function App({
  config: initialConfig,
  cwd,
  session: initialSession,
  yes,
  initialPrompt,
}: Props) {
  // Stateful so /resume can swap the whole conversation without restarting.
  const [session, setSession] = useState(initialSession);
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
  const [planReview, setPlanReview] = useState<{
    plan: ReviewedPlan;
    phase: "ready" | "denying";
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Session-scoped: a grant made with [A] must outlive the turn it came from.
  const alwaysAllowedRef = useRef(new Set<string>());
  const [pendingChoice, setPendingChoice] = useState(0);
  const [planChoice, setPlanChoice] = useState(0);
  const [expandTools, setExpandTools] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [contextUsed, setContextUsed] = useState(0);
  // Recomputed at turn boundaries only: estimateTokens walks the whole
  // conversation, which is far too costly to redo on every streamed frame.
  const [contextTokens, setContextTokens] = useState(0);
  const [queued, setQueued] = useState(0);
  const queuedRef = useRef<string[]>([]);
  const [exitArmed, setExitArmed] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resumedCount, setResumedCount] = useState(0);
  const [sessionPicker, setSessionPicker] = useState<{
    sessions: SessionSummary[];
    selected: number;
  } | null>(null);
  const [streaming, setStreaming] = useState("");
  const [thinking, setThinking] = useState("");
  const messagesRef = useRef<ModelMessage[]>([]);
  const startedRef = useRef(false);
  const thinkingAccRef = useRef("");
  const streamingAccRef = useRef("");
  const liveRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolInputsRef = useRef(new Map<string, unknown>());

  // A model can emit several tiny chunks between terminal frames. Publishing each
  // one reflows the complete markdown transcript and produces visible tearing.
  const publishLive = useCallback(() => {
    liveRenderTimerRef.current = null;
    setThinking(thinkingAccRef.current);
    setStreaming(streamingAccRef.current);
  }, []);

  const scheduleLiveRender = useCallback(() => {
    if (liveRenderTimerRef.current) return;
    liveRenderTimerRef.current = setTimeout(publishLive, 80);
  }, [publishLive]);

  const cancelLiveRender = useCallback(() => {
    if (liveRenderTimerRef.current) clearTimeout(liveRenderTimerRef.current);
    liveRenderTimerRef.current = null;
  }, []);

  useEffect(() => cancelLiveRender, [cancelLiveRender]);

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

  const flushLive = useCallback((kind: "assistant" | "plan" = "assistant", includeText = true) => {
    cancelLiveRender();
    const thinkingText = thinkingAccRef.current.trim();
    if (thinkingText) {
      push({ kind: "thinking", id: nextId("th"), text: thinkingText }, false);
    }
    const assistantText = streamingAccRef.current;
    if (includeText && assistantText.trim()) {
      push({ kind, id: nextId(kind === "plan" ? "p" : "a"), text: assistantText });
    }
    thinkingAccRef.current = "";
    streamingAccRef.current = "";
    setThinking("");
    setStreaming("");
  }, [cancelLiveRender, push]);

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
      setPendingChoice(0);
      return new Promise<PermissionDecision>((resolve) => {
        setPendingPermission({ toolName, detail, preview, resolve });
      });
    },
    [yes],
  );

  const resolvePermission = useCallback(
    (decision: PermissionDecision) => {
      pendingPermission?.resolve(decision);
      setPendingPermission(null);
      setPendingChoice(0);
    },
    [pendingPermission],
  );

  const submit = useCallback(
    async (text: string, fromQueue = false) => {
      if (!text.trim()) return;
      const revisingPlan = planReview?.phase === "denying";

      // A message typed while the agent is working waits its turn instead of
      // being dropped on the floor. It is shown now, in the order it was typed,
      // and replayed without a second echo once the turn ends.
      if (busy) {
        queuedRef.current.push(text);
        setQueued(queuedRef.current.length);
        push({ kind: "user", id: nextId("u"), text });
        return;
      }

      const command = revisingPlan ? null : parseCommand(text);
      if (command) {
        const known = findCommand(command.name);
        if (!known) {
          push(
            {
              kind: "error",
              id: nextId("e"),
              text: `Unknown command: /${command.name}. Enter /help to see what is available.`,
            },
            false,
          );
          return;
        }
        switch (command.name) {
          case "exit":
            exit();
            return;
          case "config":
            setShowConfig(true);
            return;
          case "retry":
            void checkConnection();
            return;
          case "resume":
            void (async () => {
              const sessions = await SessionStore.list(cwd);
              setSessionPicker({ sessions, selected: 0 });
            })();
            return;
          case "help":
            push({ kind: "assistant", id: nextId("a"), text: helpText() }, false);
            return;
          case "clear":
            messagesRef.current = [];
            setItems([]);
            push({ kind: "status", id: nextId("s"), text: "context cleared" }, false);
            return;
          case "status":
            push(
              {
                kind: "assistant",
                id: nextId("a"),
                text: [
                  `- **model** ${configRef.current.model}`,
                  `- **mode** ${configRef.current.mode}`,
                  `- **server** ${configRef.current.baseURL} (${serverReady ? "online" : "offline"})`,
                  `- **context** ${estimateTokens(messagesRef.current)} of ${configRef.current.contextLength} estimated tokens`,
                  `- **time** ${describeNow(new Date(), configRef.current.timezone)}`,
                  `- **session** ${session.id}`,
                  `- **cwd** ${cwd}`,
                ].join("\n"),
              },
              false,
            );
            return;
          case "mode": {
            if (command.args === "plan" || command.args === "build") {
              applyMode(command.args);
            } else {
              push(
                { kind: "error", id: nextId("e"), text: "Usage: /mode plan|build" },
                false,
              );
            }
            return;
          }
          case "compact": {
            const before = messagesRef.current.length;
            const next = compactMessages(
              messagesRef.current,
              configRef.current.contextLength,
              8,
            );
            messagesRef.current = next;
            push({
              kind: "status",
              id: nextId("s"),
              text:
                next.length === before
                  ? `nothing to compact — ${before} messages are within the context budget`
                  : `compacted ${before} messages to ${next.length}`,
            });
            return;
          }
        }
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
      setStartedAt(Date.now());
      cancelLiveRender();
      setStreaming("");
      setThinking("");
      thinkingAccRef.current = "";
      streamingAccRef.current = "";
      const { displayText, modelText } = await expandFileMentions(text, cwd);
      const request = revisingPlan
        ? `The previous implementation plan was declined. Revise this structured plan in response to the feedback:\n\n${formatReviewedPlan(planReview!.plan)}\n\nFeedback:\n${modelText}`
        : modelText;
      if (revisingPlan) setPlanReview(null);
      if (!fromQueue) {
        push({
          kind: "user",
          id: nextId("u"),
          text: revisingPlan ? `Plan feedback: ${displayText}` : displayText,
        });
      }
      const userMsg: ModelMessage = { role: "user", content: request };
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
          scheduleLiveRender();
        } else if (event.type === "thinking") {
          thinkingAccRef.current += event.text;
          scheduleLiveRender();
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
        } else if (event.type === "todos") {
          flushLive();
          push({ kind: "todos", id: nextId("t"), todos: event.todos });
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
          alwaysAllowed: alwaysAllowedRef.current,
          abortSignal: controller.signal,
          onEvent,
        });
        // Persist what this turn produced. Slicing `result.messages` by an index
        // into the pre-call array breaks as soon as compaction shortens the head.
        for (const m of result.responseMessages) await session.appendMessage(m);
        messagesRef.current = result.messages;
        // Prose is only suppressed when something structured replaces it. A
        // plan-mode review answers in prose and must not be swallowed.
        const structured = Boolean(result.plan || result.clarification);
        flushLive("assistant", !structured);
        if (result.plan) {
          const planText = formatReviewedPlan(result.plan);
          push({ kind: "plan", id: nextId("p"), text: planText });
          setPlanReview({ plan: result.plan, phase: "ready" });
        } else if (result.clarification) {
          push({ kind: "clarification", id: nextId("q"), text: result.clarification.question });
        } else if (!streamedAny && result.text?.trim()) {
          push({
            kind: "assistant",
            id: nextId("a"),
            text: result.text,
          });
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
        const tokens = estimateTokens(messagesRef.current);
        setContextTokens(tokens);
        setContextUsed(tokens / Math.max(1, configRef.current.contextLength));
      }
    },
    [
      applyMode,
      askPermission,
      busy,
      cancelLiveRender,
      checkConnection,
      cwd,
      exit,
      flushLive,
      push,
      planReview,
      recordTimeline,
      serverReady,
      scheduleLiveRender,
      session,
      upsertTool,
    ],
  );

  // Drain anything typed while the previous turn was running, oldest first.
  useEffect(() => {
    if (busy || queuedRef.current.length === 0) return;
    const next = queuedRef.current.shift()!;
    setQueued(queuedRef.current.length);
    void submit(next, true);
  }, [busy, submit]);

  const prompt = usePromptInput({
    busy,
    blocked:
      Boolean(pendingPermission) ||
      showConfig ||
      Boolean(sessionPicker) ||
      planReview?.phase === "ready",
    editorMode: config.ui.editorMode,
    editor: config.ui.editor,
    cwd,
    suspendTerminal,
    onSubmit: (text) => void submit(text),
    onAbort: () => abortRef.current?.abort(),
    onToggleAgentMode: toggleMode,
    allowModeToggle: !planReview,
    onPasteNotice: (msg) => push({ kind: "status", id: nextId("s"), text: msg }),
    isActive: !showConfig && !pendingPermission && !sessionPicker,
  });

  /** Swap the live conversation for an earlier one, transcript and all. */
  const openSession = useCallback(
    async (id: string) => {
      setSessionPicker(null);
      if (id === session.id) return;
      const store = await SessionStore.open(cwd, id);
      const [loaded, transcript] = await Promise.all([
        store.loadMessages(),
        store.loadTimeline(),
      ]);
      messagesRef.current = loaded;
      syncNextId(transcript);
      setSession(store);
      setItems(transcript);
      setResumedCount(loaded.length);
      setContextTokens(estimateTokens(loaded));
      setContextUsed(estimateTokens(loaded) / Math.max(1, configRef.current.contextLength));
      push(
        {
          kind: "status",
          id: nextId("s"),
          text: `resumed session ${id} · ${loaded.length} message${loaded.length === 1 ? "" : "s"}`,
        },
        false,
      );
    },
    [cwd, push, session.id],
  );

  const approvePlan = useCallback(() => {
    if (planReview?.phase !== "ready") return;
    setPlanReview(null);
    applyMode("build");
    push({ kind: "status", id: nextId("s"), text: "plan approved · starting implementation" });
    void submit(
      `Implement the approved plan below. Make the changes now, verify them, and report the results.\n\n${formatReviewedPlan(planReview.plan)}`,
    );
  }, [applyMode, planReview, push, submit]);

  useEffect(() => {
    (async () => {
      const loaded = await session.loadMessages();
      messagesRef.current = loaded;
      const transcript = await session.loadTimeline();
      if (transcript.length > 0) {
        syncNextId(transcript);
        setItems(transcript);
      }
      if (loaded.length > 0) setResumedCount(loaded.length);
      setContextTokens(estimateTokens(loaded));
      setContextUsed(estimateTokens(loaded) / Math.max(1, config.contextLength));
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
  const planDenyExtra = planReview?.phase === "denying" ? 1 : 0;
  const pickerExtra =
    (prompt.filePicker ? filePickerRows(prompt.filePicker.matches) : 0) +
    (prompt.commandPicker ? commandPickerRows(prompt.commandPicker.matches) : 0) +
    (sessionPicker ? sessionPickerRows(sessionPicker.sessions) : 0);
  // What the approval prompt may occupy before it would squeeze the transcript
  // to nothing and push its own options off the bottom.
  const permissionMaxRows = Math.max(10, (rows || 24) - footerHeight() - 3);
  const inputContent = pendingPermission
    ? permissionContentRows(pendingPermission, columns || 80, permissionMaxRows)
    : planReview?.phase === "ready"
      ? planReviewContentRows("ready", prompt.buffer.value, columns || 80)
      : inputContentRows(prompt.buffer.value, columns || 80) +
        vimExtra +
        pasteExtra +
        planDenyExtra;
  const inputRows = inputContent + 2 + pickerExtra + (busy ? workingHeight() : 0);
  const footerState = {
    busy,
    editorMode: config.ui.editorMode,
    vimMode: prompt.vimMode,
    showConfig,
    browsingHistory,
    filePicker: Boolean(prompt.filePicker),
    commandPicker: Boolean(prompt.commandPicker),
    planReview: planReview?.phase,
    queued,
  };
  const chrome = (showConfig ? 0 : inputRows) + footerHeight();
  const timelineLines = Math.max(showConfig ? 2 : 3, (rows || 24) - chrome);

  const armExit = useCallback(() => {
    if (exitArmed) {
      exit();
      return;
    }
    setExitArmed(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => setExitArmed(false), 2_000);
  }, [exit, exitArmed]);

  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);

  useKeyboard((key) => {
    // Ctrl+C never exits on the first press: an accidental one mid-session
    // used to take the whole transcript with it.
    if (key.ctrl && key.name === "c") {
      if (busy) {
        abortRef.current?.abort();
        return;
      }
      armExit();
      return;
    }
    if (exitArmed) setExitArmed(false);

    if (sessionPicker) {
      if (key.name === "escape") {
        setSessionPicker(null);
      } else if (key.name === "up" || key.name === "down") {
        const count = sessionPicker.sessions.length;
        if (count > 0) {
          const delta = key.name === "up" ? -1 : 1;
          setSessionPicker({
            ...sessionPicker,
            selected: (sessionPicker.selected + delta + count) % count,
          });
        }
      } else if (key.name === "return") {
        const chosen = sessionPicker.sessions[sessionPicker.selected];
        if (chosen) void openSession(chosen.id);
        else setSessionPicker(null);
      }
      return;
    }

    if (pendingPermission) {
      const ch = keyChar(key);
      if (key.name === "up" || key.name === "down") {
        const delta = key.name === "up" ? -1 : 1;
        setPendingChoice(
          (value) =>
            (value + delta + PERMISSION_CHOICES.length) % PERMISSION_CHOICES.length,
        );
      } else if (key.name === "return") {
        resolvePermission(PERMISSION_CHOICES[pendingChoice] ?? "deny");
      } else if (key.name === "escape") {
        resolvePermission("deny");
      } else if (ch === "1" || ch === "a") {
        resolvePermission("allow");
      } else if (ch === "2" || ch === "A") {
        resolvePermission("always");
      } else if (ch === "3" || ch === "d" || ch === "n") {
        resolvePermission("deny");
      }
      return;
    }

    if (planReview?.phase === "ready") {
      const ch = keyChar(key);
      const decline = () => setPlanReview({ ...planReview, phase: "denying" });
      if (key.name === "up" || key.name === "down") {
        const delta = key.name === "up" ? -1 : 1;
        setPlanChoice((value) => (value + delta + PLAN_CHOICES.length) % PLAN_CHOICES.length);
      } else if (key.name === "return") {
        if ((PLAN_CHOICES[planChoice] ?? "approve") === "approve") approvePlan();
        else decline();
      } else if (ch === "1" || ch === "a") {
        approvePlan();
      } else if (ch === "2" || ch === "d" || ch === "n" || key.name === "escape") {
        decline();
      }
      return;
    }
    if (planReview?.phase === "denying" && key.name === "escape") {
      prompt.resetBuffer();
      setPlanReview({ ...planReview, phase: "ready" });
      return;
    }
    if (showConfig) return;

    if (key.ctrl && key.name === "o") {
      setExpandTools((value) => !value);
      return;
    }

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
    // No background fill: the UI draws over whatever the user's terminal theme
    // already provides, the way Claude Code does.
    <box flexDirection="column" width="100%" height={rows || undefined}>
      {!showConfig ? (
        <box flexGrow={1} flexDirection="column" height={timelineLines}>
          <Timeline
            items={items}
            columns={columns || 80}
            thinking={thinking}
            streaming={streaming}
            expandAll={expandTools}
            welcome={
              <Welcome cwd={cwd} model={config.model} resumed={resumedCount || undefined} />
            }
            scrollRef={scrollRef}
          />
        </box>
      ) : null}
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
          onRetryConnection={() => void checkConnection()}
          columns={columns || 80}
          maxRows={timelineLines}
        />
      ) : (
        <>
          {busy ? (
            <Working
              startedAt={startedAt}
              tokens={contextTokens}
              queued={queued}
            />
          ) : null}
          {prompt.filePicker ? (
            <FilePicker
              matches={prompt.filePicker.matches}
              selected={prompt.filePicker.selected}
              query={prompt.filePicker.query}
              columns={columns || 80}
            />
          ) : null}
          {prompt.commandPicker ? (
            <CommandPicker
              matches={prompt.commandPicker.matches}
              selected={prompt.commandPicker.selected}
              columns={columns || 80}
            />
          ) : null}
          {sessionPicker ? (
            <SessionPicker
              sessions={sessionPicker.sessions}
              selected={sessionPicker.selected}
              currentId={session.id}
              columns={columns || 80}
            />
          ) : null}
          <InputBox
            value={prompt.buffer.value}
            cursor={prompt.buffer.cursor}
            busy={busy}
            vimMode={prompt.vimMode}
            editorMode={config.ui.editorMode}
            pasteHint={prompt.pasteHint ?? (exitArmed ? "press ctrl+c again to exit" : null)}
            planReview={planReview?.phase}
            planChoice={planChoice}
            pendingChoice={pendingChoice}
            columns={columns || 80}
            maxRows={permissionMaxRows}
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
      {/* Spread the same state used to reserve the footer's height, so what is
          drawn and what was measured cannot drift apart. */}
      <Footer
        {...footerState}
        columns={columns || 80}
        status={{
          mode: config.mode,
          model: config.model,
          contextUsed,
          online: serverReady,
        }}
      />
    </box>
  );
}

/**
 * Ask the terminal what it is actually drawing on. Terminals that do not
 * answer the OSC query leave the palette on its configured default, so this
 * never blocks startup for more than the timeout.
 */
async function detectBackground(
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  preference: AnvilConfig["ui"]["theme"],
): Promise<string> {
  if (preference !== "auto") return resolveBackground(preference, {});

  let background: string | null = null;
  try {
    const palette = await renderer.getPalette({ timeout: 250 });
    background = palette.defaultBackground;
  } catch {
    // Terminal did not answer; fall back to the reported theme mode.
  }
  let mode: ThemeMode | null = renderer.themeMode;
  if (!background && !mode) {
    mode = await renderer.waitForThemeMode(250).catch(() => null);
  }
  return resolveBackground("auto", { background, mode });
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
        // Ctrl+C is handled in-app so the first press interrupts rather than
        // taking the session down with it.
        exitOnCtrlC: false,
        useMouse: true,
        onDestroy: () => resolve(),
      });

      // Tune the palette before the first frame: colours are read at render
      // time, so this must land ahead of it.
      applyPalette(buildPalette(await detectBackground(renderer, opts.config.ui.theme)));

      // Load the markdown grammars now rather than when the first reply lands,
      // so prose is not briefly (or, if no repaint follows, permanently) raw.
      await warmMarkdownParser();

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
