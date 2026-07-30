import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { ModelMessage } from "ai";
import { compactMessages } from "../agent/compact.ts";
import { runAgent } from "../agent/loop.ts";
import { probeServer } from "../agent/model.ts";
import type { AgentMode, AnvilConfig } from "../config/types.ts";
import { SessionStore } from "../session/store.ts";
import type { AgentEvent, PermissionDecision } from "../tools/index.ts";
import { allowAll } from "../tools/permissions.ts";

interface LogLine {
  kind: "user" | "assistant" | "tool" | "status" | "error";
  text: string;
}

interface Props {
  config: AnvilConfig;
  cwd: string;
  session: SessionStore;
  yes?: boolean;
  initialPrompt?: string;
}

export function App({ config, cwd, session, yes, initialPrompt }: Props) {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [status, setStatus] = useState("starting…");
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [mode, setMode] = useState(config.mode);
  const [pendingPermission, setPendingPermission] = useState<{
    toolName: string;
    detail: string;
    resolve: (d: PermissionDecision) => void;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState("");
  const messagesRef = useRef<ModelMessage[]>([]);
  const startedRef = useRef(false);

  const push = useCallback((line: LogLine) => {
    setLogs((prev) => [...prev.slice(-200), line]);
  }, []);

  const applyMode = useCallback(
    (next: AgentMode) => {
      config.mode = next;
      setMode(next);
      setStatus(`${config.model} · ${next} · session ${session.id}`);
      push({ kind: "status", text: `mode → ${next}` });
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
        setMessages(next);
        push({ kind: "status", text: `compacted to ${next.length} messages` });
        return;
      }

      setBusy(true);
      setStreaming("");
      push({ kind: "user", text });
      const userMsg: ModelMessage = { role: "user", content: text };
      const before = messagesRef.current.length;
      const nextMessages = [...messagesRef.current, userMsg];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      await session.appendMessage(userMsg);

      const controller = new AbortController();
      abortRef.current = controller;

      const onEvent = (event: AgentEvent) => {
        if (event.type === "text") {
          setStreaming((s) => s + event.text);
        } else if (event.type === "tool_start") {
          push({
            kind: "tool",
            text: `→ ${event.name} ${JSON.stringify(event.input).slice(0, 100)}`,
          });
        } else if (event.type === "tool_end") {
          push({ kind: "tool", text: `↩ ${event.name}: ${event.output.slice(0, 120)}` });
        } else if (event.type === "status") {
          push({ kind: "status", text: event.message });
        } else if (event.type === "error") {
          push({ kind: "error", text: event.message });
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
        setMessages(result.messages);
        if (result.text) push({ kind: "assistant", text: result.text });
        setStreaming("");
        for (const h of result.mcpHandles) await h.close().catch(() => {});
      } catch (err) {
        push({
          kind: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [applyMode, askPermission, busy, config, cwd, exit, push, session],
  );

  useEffect(() => {
    (async () => {
      const probe = await probeServer(config);
      if (!probe.ok) {
        setStatus(`offline: ${probe.detail}`);
        push({ kind: "error", text: `Cannot reach ${config.baseURL}` });
        return;
      }
      setStatus(`${config.model} · ${mode} · session ${session.id}`);
      const loaded = await session.loadMessages();
      messagesRef.current = loaded;
      setMessages(loaded);
      if (initialPrompt && !startedRef.current) {
        startedRef.current = true;
        void submit(initialPrompt);
      }
    })();
  }, [config, initialPrompt, mode, push, session, submit]);

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

    if (key.escape && busy && abortRef.current) {
      abortRef.current.abort();
      return;
    }
    if (busy) return;

    if (key.shift && key.tab) {
      toggleMode();
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

  return (
    <Box flexDirection="column" width="100%">
      <Box borderStyle="single" paddingX={1}>
        <Text bold>anvil</Text>
        <Text> · {status}</Text>
      </Box>

      <Box flexDirection="column" marginY={1} height={16}>
        {logs.slice(-14).map((l, i) => (
          <Text
            key={`${i}-${l.kind}-${l.text.slice(0, 24)}`}
            color={
              l.kind === "user"
                ? "cyan"
                : l.kind === "error"
                  ? "red"
                  : l.kind === "tool"
                    ? "yellow"
                    : l.kind === "status"
                      ? "gray"
                      : undefined
            }
          >
            {l.kind === "user" ? "you> " : ""}
            {l.text.length > 200 ? `${l.text.slice(0, 200)}…` : l.text}
          </Text>
        ))}
        {streaming ? <Text>{streaming.slice(-400)}</Text> : null}
      </Box>

      {pendingPermission ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            Allow {pendingPermission.toolName}? {pendingPermission.detail.slice(0, 80)}{" "}
            [a/A/d]
          </Text>
        </Box>
      ) : (
        <Box>
          <Text color="green">{busy ? "…" : "›"} </Text>
          <Text>{input}</Text>
          <Text color="gray">
            {busy ? "  (Esc to interrupt)" : "  (/exit /mode /compact · Shift+Tab mode)"}
          </Text>
        </Box>
      )}
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
  );
  await instance.waitUntilExit();
}
