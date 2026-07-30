import { createInterface } from "node:readline/promises";
import type { PermissionDecision } from "../tools/types.ts";

export async function askPermissionCli(
  toolName: string,
  detail: string,
): Promise<PermissionDecision> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question(
        `\n⚠ Allow ${toolName}?\n  ${detail}\n  [a]llow once / [A]lways / [d]eny: `,
      )
    ).trim();
    if (answer === "A" || answer.toLowerCase() === "always") return "always";
    if (answer === "d" || answer.toLowerCase() === "deny" || answer === "n") return "deny";
    return "allow";
  } finally {
    rl.close();
  }
}

/** Auto-allow for non-interactive / -p one-shot runs */
export async function allowAll(
  _toolName: string,
  _detail: string,
): Promise<PermissionDecision> {
  return "allow";
}
