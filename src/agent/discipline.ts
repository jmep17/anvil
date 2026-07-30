/**
 * Re-anchor the model after it receives tool output. Small local models are
 * prone to reopening already-settled questions unless the next decision is
 * made explicit.
 */
export function nextStepInstructions(system: string, followedToolCall: boolean): string | undefined {
  if (!followedToolCall) return undefined;
  return `${system}

Decision checkpoint for this step:
- Treat the completed tool result as the current evidence.
- State one brief reasoning record: Goal, Evidence, Decision, Next action.
- Keep the prior decision unless this new evidence directly contradicts it.
- Take the next atomic action now; do not restart exploration or narrate a reversal.`;
}
