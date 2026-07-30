import type { ModelMessage } from "ai";

/**
 * Re-anchor the model after it receives tool output. Small local models are
 * prone to reopening already-settled questions unless the next decision is
 * made explicit.
 *
 * This is deliberately delivered as a trailing message rather than by rewriting
 * the system prompt. A local server caches the KV state of the prompt prefix;
 * changing the system prompt — which sits at the very front — invalidates that
 * cache and forces the whole context to be re-encoded before generation can
 * start. Doing that on every step that follows a tool call is what makes a
 * long session feel like it has hung. Appending at the end leaves the prefix
 * untouched, so only the new tokens are processed.
 */
export const DECISION_CHECKPOINT = `Decision checkpoint for this step:
- Treat the completed tool result as the current evidence.
- State one brief reasoning record: Goal, Evidence, Decision, Next action.
- Keep the prior decision unless this new evidence directly contradicts it.
- Take the next atomic action now; do not restart exploration or narrate a reversal.`;

/**
 * The exact time, carried here rather than in the system prompt for the reason
 * above: the prompt is the prefix, and a stamp accurate to the minute changed
 * it on almost every turn.
 */
export function currentTimeNote(timeOfDay: string): string {
  return `Current time: ${timeOfDay}.`;
}

/** The transient guidance appended for this step. */
export function nextStepNudge(followedToolCall: boolean, timeOfDay?: string): string | null {
  const parts: string[] = [];
  if (timeOfDay) parts.push(currentTimeNote(timeOfDay));
  if (followedToolCall) parts.push(DECISION_CHECKPOINT);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Append transient guidance to the end of the conversation. Returns the
 * original array when there is nothing to add, so the common path allocates
 * nothing.
 */
export function withNudge(messages: ModelMessage[], nudge: string | null): ModelMessage[] {
  if (!nudge) return messages;
  return [...messages, { role: "user", content: nudge }];
}
