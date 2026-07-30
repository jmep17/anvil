import { createInterface } from "node:readline/promises";
import type { ModelMessage } from "ai";
import { compactMessages } from "../agent/compact.ts";
import { runAgent } from "../agent/loop.ts";
import { probeServer } from "../agent/model.ts";
import type { AnvilConfig } from "../config/types.ts";
import { SessionStore } from "../session/store.ts";
import type { AgentEvent } from "../tools/index.ts";
import { allowAll, askPermissionCli } from "../tools/permissions.ts";
import { formatToolDuration, formatToolInput } from "./format.ts";
import { expandFileMentions } from "./fileMentions.ts";

function printEvent(event: AgentEvent): void {
  switch (event.type) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "thinking":
      process.stderr.write(`\x1b[2m${event.text}\x1b[0m`);
      break;
    case "tool_start":
      console.log(
        `\n\x1b[36m╭─ ◌ ${event.name} · running\x1b[0m\n\x1b[2m│  input\x1b[0m\n${formatToolInput(event.input).split("\n").map((line) => `│    ${line}`).join("\n")}\n\x1b[36m╰─\x1b[0m`,
      );
      break;
    case "tool_end": {
      const dur = formatToolDuration(event.ms);
      const mark = event.error ? "\x1b[31m✗" : "\x1b[2m↩";
      const reset = "\x1b[0m";
      const state = event.error ? "failed" : "complete";
      const output = event.output.split("\n").map((line) => `│    ${line}`).join("\n");
      console.log(
        `${mark} ${event.name} · ${state}${dur ? ` · ${dur}` : ""}${reset}\n\x1b[2m│  output\x1b[0m\n${output}\n${mark}╰─${reset}`,
      );
      break;
    }
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
  console.log("Commands: /exit /mode plan|build /compact /config /help\n");

  let messages: ModelMessage[] = await opts.session.loadMessages();
  const ask = opts.yes ? allowAll : askPermissionCli;

  const runTurn = async (userText: string) => {
    const before = messages.length;
    const { modelText } = await expandFileMentions(userText, opts.cwd);
    const userMsg: ModelMessage = { role: "user", content: modelText };
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
        console.log("/exit  /mode plan|build  /compact  /config  /help");
        continue;
      }
      if (line === "/config") {
        console.log("Interactive /config is available in the TUI (`anvil` or `anvil --tui`).");
        console.log("Or use: anvil config set <key> <value>");
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
