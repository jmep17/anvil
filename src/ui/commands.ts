export interface SlashCommand {
  name: string;
  /** Placeholder shown after the name, e.g. `plan|build`. */
  args?: string;
  description: string;
  /** Commands the readline REPL cannot offer (they need the TUI). */
  tuiOnly?: boolean;
}

export const COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show commands and keyboard shortcuts" },
  { name: "clear", description: "Clear the transcript and start a fresh context" },
  { name: "compact", description: "Summarize the conversation to free up context" },
  { name: "status", description: "Show model, mode, context usage and session id" },
  { name: "resume", description: "Switch to an earlier session in this project", tuiOnly: true },
  { name: "mode", args: "plan|build", description: "Switch between plan and build mode" },
  { name: "config", description: "Open the settings panel", tuiOnly: true },
  { name: "retry", description: "Re-check the model server after an offline error" },
  { name: "exit", description: "Leave Anvil" },
];

export interface ParsedCommand {
  name: string;
  args: string;
}

/** Parse `/mode plan` into `{ name: "mode", args: "plan" }`. */
export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/") || trimmed.length < 2) return null;
  const body = trimmed.slice(1);
  const space = body.search(/\s/);
  if (space === -1) return { name: body.toLowerCase(), args: "" };
  return {
    name: body.slice(0, space).toLowerCase(),
    args: body.slice(space + 1).trim(),
  };
}

export function findCommand(name: string): SlashCommand | undefined {
  return COMMANDS.find((command) => command.name === name);
}

/**
 * Completion candidates for a buffer. Returns null when the buffer is not a
 * bare command prefix, so the picker stays closed while an argument is typed.
 */
export function matchCommands(buffer: string): SlashCommand[] | null {
  if (!buffer.startsWith("/")) return null;
  const query = buffer.slice(1);
  if (/\s/.test(query)) return null;
  const lower = query.toLowerCase();
  return COMMANDS.filter((command) => command.name.startsWith(lower));
}

const SHORTCUTS: Array<[string, string]> = [
  ["enter", "send message"],
  ["ctrl+j / shift+enter", "insert a newline"],
  ["@", "reference a project file"],
  ["/", "run a command"],
  ["shift+tab", "toggle plan ↔ build mode"],
  ["esc", "interrupt the agent, or clear the prompt"],
  ["ctrl+c", "press twice to exit"],
  ["ctrl+o", "expand or collapse tool output"],
  ["ctrl+g", "edit the prompt in $EDITOR"],
  ["↑ / ↓", "recall previous prompts"],
  ["pgup / pgdn", "scroll the transcript"],
];

export function helpText(): string {
  const commands = COMMANDS.map(
    (command) =>
      `- \`/${command.name}${command.args ? ` ${command.args}` : ""}\` — ${command.description}`,
  ).join("\n");
  const shortcuts = SHORTCUTS.map(([key, what]) => `- \`${key}\` — ${what}`).join("\n");
  return `## Commands\n\n${commands}\n\n## Shortcuts\n\n${shortcuts}`;
}
