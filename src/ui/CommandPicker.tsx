import { TextAttributes } from "@opentui/core";
import type { SlashCommand } from "./commands.ts";
import { colors } from "./theme.ts";

export function CommandPicker({
  matches,
  selected,
  columns,
}: {
  matches: SlashCommand[];
  selected: number;
  columns: number;
}) {
  if (matches.length === 0) return null;
  const width = Math.max(12, columns - 4);
  const nameWidth = Math.max(...matches.map((c) => c.name.length + (c.args?.length ?? 0) + 2));

  return (
    <box
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={colors.border}
      paddingX={1}
      flexShrink={0}
    >
      {matches.map((command, index) => {
        const active = index === selected;
        const label = `/${command.name}${command.args ? ` ${command.args}` : ""}`;
        const line = `${label.padEnd(nameWidth)}  ${command.description}`;
        return (
          <text
            key={command.name}
            fg={active ? colors.selectionFg : colors.muted}
            bg={active ? colors.selectionBg : undefined}
            attributes={active ? TextAttributes.BOLD : TextAttributes.DIM}
          >
            {`${active ? "› " : "  "}${line.slice(0, width - 2)}`}
          </text>
        );
      })}
    </box>
  );
}

export function commandPickerRows(matches: SlashCommand[]): number {
  return matches.length === 0 ? 0 : 2 + matches.length;
}
