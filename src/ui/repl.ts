import { createInterface } from "node:readline/promises";
import type { ModelMessage } from "ai";
import { compactMessages } from "../agent/compact.ts";
import { runAgent } from "../agent/loop.ts";
import { probeServer } from "../agent/model.ts";
import type { AnvilConfig } from "../config/types.ts";
import { SessionStore } from "../session/store.ts";
import type { AgentEvent } from "../tools/index.ts";
import { allowAll, askPermissionCli } from "../tools/permissions.ts";

function printEvent(event: AgentEvent): void {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "tool_start":
      console.log(`\n\x1b[36m→ ${event.name}\x1b[0m ${summarize(event.input)}`);
      break;
    case "tool_end":
      console.log(
        `\x1b[2m↩ ${event.name}: ${event.output.slice(0, 200).replace(/\n/g, " ")}\x1b[0m`,
      );
      break;
    case "status":
      console.log(`\x1b[2m${event.message}\x1b[0m`);
      break;
    case "step":
      break;
    case "error":
      console.error(`\x1b[31m${event.message}\x1b[0m`);
      break;
  }
}

function summarize(input: unknown): string {
  try {
    const s = JSON.stringify(input);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return String(input);
  }
}

export async function runRepl(opts: {
  config: AnvilConfig;
  cwd: string;
  session: SessionStore;
  prompt?: string;
  yes?: boolean;
}): Promise<void> {
  const probe = await probeServer(opts.config);
  if (!probe.ok) {
    console.error(`Cannot reach LM Studio at ${opts.config.baseURL}: ${probe.detail}`);
    console.error("Start the server and load a model, then retry.");
    process.exitCode = 1;
    return;
  }

  console.log(`anvil · ${opts.config.model} · ${opts.cwd}`);
  console.log(`server ok (${probe.detail})`);
  console.log(`session ${opts.session.id} · mode ${opts.config.mode}`);
  console.log("Commands: /exit /mode plan|build /compact /help\n");

  let messages: ModelMessage[] = await opts.session.loadMessages();
  const ask = opts.yes ? allowAll : askPermissionCli;

  const runTurn = async (userText: string) => {
    const before = messages.length;
    const userMsg: ModelMessage = { role: "user", content: userText };
    messages = [...messages, userMsg];
    await opts.session.appendMessage(userMsg);

    const controller = new AbortController();
    const onSigInt = () => {
      controller.abort();
      console.log("\n(interrupted)");
    };
    process.once("SIGINT", onSigInt);

    let streamed = false;
    try {
      const result = await runAgent({
        config: opts.config,
        cwd: opts.cwd,
        messages,
        askPermission: ask,
        abortSignal: controller.signal,
        onEvent: (event) => {
          if (event.type === "text" && event.text.trim()) streamed = true;
          printEvent(event);
        },
      });
      const added = result.messages.slice(before + 1);
      for (const m of added) await opts.session.appendMessage(m);
      messages = result.messages;
      if (result.text?.trim() && !streamed) {
        process.stdout.write(result.text);
      }
      process.stdout.write("\n\n");
      for (const h of result.mcpHandles) await h.close().catch(() => {});
    } catch (err) {
      console.error("\nError:", err instanceof Error ? err.message : err);
    } finally {
      process.off("SIGINT", onSigInt);
    }
  };

  if (opts.prompt) {
    await runTurn(opts.prompt);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const line = (await rl.question("\x1b[1myou>\x1b[0m ")).trim();
      if (!line) continue;
      if (line === "/exit" || line === "/quit") break;
      if (line === "/help") {
        console.log("/exit  /mode plan|build  /compact  /help");
        continue;
      }
      if (line.startsWith("/mode ")) {
        const mode = line.slice(6).trim();
        if (mode === "plan" || mode === "build") {
          opts.config.mode = mode;
          console.log(`mode → ${mode}`);
        } else {
          console.log("usage: /mode plan|build");
        }
        continue;
      }
      if (line === "/compact") {
        messages = compactMessages(messages, opts.config.contextLength, 8);
        console.log(`compacted to ${messages.length} messages`);
        continue;
      }
      await runTurn(line);
    }
  } finally {
    rl.close();
  }
}
