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
    content: `[Context compacted: ${dropped.length} earlier messages omitted. Continue from the recent turns below. Preserve any active goals and file paths mentioned earlier.]`,
  };
  return [...head, summary, ...tail];
}
