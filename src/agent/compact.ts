import type { ModelMessage } from "ai";

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(messages: ModelMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      chars += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if ("text" in part && typeof part.text === "string") chars += part.text.length;
        else chars += JSON.stringify(part).length;
      }
    } else {
      chars += JSON.stringify(m.content).length;
    }
  }
  return Math.ceil(chars / 4);
}

function textFromMessage(message: ModelMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .flatMap((part) => ("text" in part && typeof part.text === "string" ? [part.text] : []))
      .join(" ");
  }
  return "";
}

function compactedCheckpoint(dropped: ModelMessage[]): string {
  const requests = dropped
    .filter((message) => message.role === "user")
    .map(textFromMessage)
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(-4)
    .map((text) => (text.length > 300 ? `${text.slice(0, 299)}…` : text));
  const goals = requests.length
    ? `\nEarlier user requests to preserve:\n${requests.map((text) => `- ${text}`).join("\n")}`
    : "";
  return `[Context compacted: ${dropped.length} earlier messages omitted. Continue from the recent turns below. Preserve active goals, decisions, and file paths from these request excerpts.]${goals}`;
}

/**
 * Compact conversation when nearing the context limit:
 * keep system + first user + recent tail; summarize the middle as a synthetic user note.
 */
export function compactMessages(
  messages: ModelMessage[],
  contextLength: number,
  keepRecent = 12,
): ModelMessage[] {
  const budget = Math.floor(contextLength * 0.75);
  if (estimateTokens(messages) < budget) return messages;
  if (messages.length <= keepRecent + 2) return messages;

  const head = messages.slice(0, 2);
  const tail = messages.slice(-keepRecent);
  const dropped = messages.slice(2, -keepRecent);
  const summary: ModelMessage = {
    role: "user",
    content: compactedCheckpoint(dropped),
  };
  return [...head, summary, ...tail];
}
