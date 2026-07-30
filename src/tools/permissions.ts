import { createInterface } from "node:readline/promises";
import type { PermissionDecision } from "../tools/types.ts";

export async function askPermissionCli(
  toolName: string,
  detail: string,
  preview?: string,
): Promise<PermissionDecision> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (
      await rl.question(
        `\n⚠ Allow ${toolName}?\n  ${detail}${preview ? `\n  ${preview}` : ""}\n  [a]llow once / [A]llow same action this session / [d]eny: `,
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
  _preview?: string,
): Promise<PermissionDecision> {
  return "allow";
}
