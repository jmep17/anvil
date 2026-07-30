interface ToolCallLike {
  toolName: string;
  input: unknown;
}

interface ToolStepLike {
  toolCalls: readonly ToolCallLike[];
}

function signature(call: ToolCallLike): string {
  return `${call.toolName}:${JSON.stringify(call.input)}`;
}

/**
 * Detect the common local-model failure mode of asking for the same file
 * contents again without taking an intervening action. The caller can remove
 * Read for one model step, which nudges the model to either act or explain
 * what it needs instead of consuming the whole tool budget.
 */
export function shouldPauseReadTool(steps: readonly ToolStepLike[]): boolean {
  const recent = steps.slice(-2);
  if (recent.length !== 2) return false;

  const calls = recent.map((step) => step.toolCalls);
  if (calls.some((stepCalls) => stepCalls.length !== 1)) return false;
  if (calls.some(([call]) => call?.toolName !== "Read")) return false;

  return signature(calls[0]![0]!) === signature(calls[1]![0]!);
}
