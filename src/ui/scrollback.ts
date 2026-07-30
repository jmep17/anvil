import {
  BoxRenderable,
  MarkdownRenderable,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
  type RenderContext,
} from "@opentui/core";
import {
  formatToolDuration,
  formatToolInput,
  summarizeToolInput,
  summarizeToolResult,
  wrapDisplayLines,
} from "./format.ts";
import { colors, getMarkdownSyntaxStyle, markdownParser } from "./theme.ts";
import type { TimelineItem, ToolStatus } from "./types.ts";

/**
 * The transcript is written into the terminal's own scrollback rather than
 * painted into a fixed-height viewport. That is what makes it behave like a
 * terminal: output starts at the top, the prompt sits directly beneath it, the
 * terminal scrolls when it fills, and everything survives exit.
 *
 * OpenTUI's React binding has no JSX path into scrollback, so these are built
 * from renderables by hand. The presentation logic is shared with nothing else
 * — it all lives here — but the pure helpers it leans on (`summarizeToolResult`,
 * `wrapDisplayLines`, the palette) are the same ones the footer uses.
 */

const BULLET = "⏺";
const CORNER = "⎿";
const THINKING = "✻";

/** Width reserved by `CORNER` plus its padding, so wrapped output stays aligned. */
const RESULT_INDENT = "     ";

/** How long to wait for syntax highlighting before committing anyway. */
const SETTLE_TIMEOUT_MS = 2_000;

function statusColor(status: ToolStatus): string {
  return status === "running" ? colors.accent : status === "done" ? colors.success : colors.danger;
}

/** `Read(src/ui/App.tsx)` — the call as the user would have written it. */
function toolTitle(name: string, input: unknown, width: number): string {
  const summary = summarizeToolInput(input, Math.max(12, width - name.length - 4));
  return summary ? `${name}(${summary})` : name;
}

/**
 * Blank lines above an item. Turns and tool blocks breathe; a status line
 * annotates whatever precedes it, and consecutive one-line tool calls read as
 * a single block of work.
 */
export function spacingBefore(item: TimelineItem, previous: TimelineItem | undefined): number {
  if (!previous) return 0;
  if (item.kind === "status") return 0;
  if (item.kind === "tool" && previous.kind === "tool") return 0;
  return 1;
}

interface Line {
  text: string;
  fg?: string;
  attributes?: number;
}

/** Plain-text rows for every item kind that is not Markdown. */
export function itemLines(item: TimelineItem, width: number, expand = false): Line[] {
  const wrap = (text: string, indent = 0) =>
    wrapDisplayLines(text, Math.max(12, width - indent));

  switch (item.kind) {
    case "user":
      return wrap(item.text, 2).map((line, i) => ({
        text: `${i === 0 ? "> " : "  "}${line || " "}`,
        fg: colors.muted,
      }));

    case "thinking":
      return [
        { text: `${THINKING} Thinking…`, fg: colors.muted, attributes: TextAttributes.ITALIC },
        ...wrap(item.text, 2).map((line) => ({
          text: `  ${line || " "}`,
          fg: colors.faint,
          attributes: TextAttributes.ITALIC,
        })),
      ];

    case "status":
      return wrap(item.text, 4).map((line, i) => ({
        text: `  ${i === 0 ? "· " : "  "}${line}`,
        fg: colors.faint,
      }));

    case "error":
      return [
        { text: `${BULLET} Error`, fg: colors.danger, attributes: TextAttributes.BOLD },
        ...wrap(item.text, 6).map((line, i) => ({
          text: `  ${i === 0 ? `${CORNER}  ` : "   "}${line || " "}`,
          fg: colors.danger,
        })),
      ];

    case "todos": {
      const marks: Record<string, string> = {
        pending: "☐",
        in_progress: "◐",
        completed: "☒",
        cancelled: "☓",
      };
      const out: Line[] = [
        { text: `${BULLET} Update Todos`, fg: colors.success, attributes: TextAttributes.BOLD },
      ];
      item.todos.forEach((todo, index) => {
        const done = todo.status === "completed" || todo.status === "cancelled";
        const prefix = index === 0 ? `  ${CORNER}  ` : RESULT_INDENT;
        const body = wrap(todo.content, prefix.length + 2);
        body.forEach((line, i) => {
          out.push({
            text:
              i === 0
                ? `${prefix}${marks[todo.status] ?? "☐"} ${line}`
                : `${RESULT_INDENT}  ${line}`,
            fg: done
              ? colors.faint
              : todo.status === "in_progress"
                ? colors.accent
                : colors.muted,
            attributes: done ? TextAttributes.STRIKETHROUGH : TextAttributes.NONE,
          });
        });
      });
      return out;
    }

    case "tool": {
      // Call and outcome on one row: no two glyph widths need to align, and a
      // run of tools stays compact.
      const summary =
        item.status === "running"
          ? "running…"
          : summarizeToolResult(item.name, item.output, item.status === "error");
      const duration = formatToolDuration(item.ms);
      const head =
        `${BULLET} ${toolTitle(item.name, item.input, width)}` +
        (summary ? ` · ${summary}` : "") +
        (duration ? ` · ${duration}` : "");

      const lines: Line[] = wrap(head).map((line, i) => ({
        text: line,
        fg: i === 0 ? statusColor(item.status) : colors.muted,
      }));
      if (!expand) return lines;

      // Scrollback cannot be revised after the fact, so "expand" applies to
      // rows written from here on rather than re-opening earlier ones.
      for (const line of wrap(formatToolInput(item.input), 8)) {
        lines.push({ text: `${RESULT_INDENT}${line || " "}`, fg: colors.faint });
      }
      if (item.output != null) {
        for (const line of wrap(item.output, 8)) {
          lines.push({
            text: `${RESULT_INDENT}${line || " "}`,
            fg: item.status === "error" ? colors.danger : colors.muted,
          });
        }
      }
      return lines;
    }

    // Markdown kinds never reach here.
    case "assistant":
    case "plan":
    case "clarification":
      return [];
  }
}

function isMarkdown(item: TimelineItem): boolean {
  return item.kind === "assistant" || item.kind === "plan" || item.kind === "clarification";
}

function labelFor(item: TimelineItem): Line | null {
  if (item.kind === "plan") {
    return { text: `${BULLET} Plan for review`, fg: colors.success, attributes: TextAttributes.BOLD };
  }
  if (item.kind === "clarification") {
    return {
      text: `${BULLET} Clarification needed`,
      fg: colors.warning,
      attributes: TextAttributes.BOLD,
    };
  }
  return null;
}

function addLines(ctx: RenderContext, root: BoxRenderable, lines: Line[], idPrefix: string): void {
  lines.forEach((line, index) => {
    root.add(
      new TextRenderable(ctx, {
        id: `${idPrefix}-${index}`,
        content: line.text,
        fg: line.fg,
        attributes: line.attributes ?? TextAttributes.NONE,
      }),
    );
  });
}

let commitSeq = 0;

/**
 * Append one transcript item to the terminal's scrollback.
 *
 * Markdown goes through a scrollback *surface* rather than a direct write:
 * highlighting is asynchronous, and `settle()` waits for it, so a block can
 * never be committed as raw `##` and `**`.
 */
export async function commitItem(
  renderer: CliRenderer,
  item: TimelineItem,
  previous: TimelineItem | undefined,
  expand = false,
): Promise<void> {
  const gap = spacingBefore(item, previous);
  const id = `sb-${commitSeq++}`;

  if (!isMarkdown(item)) {
    const lines = itemLines(item, renderer.width, expand);
    if (lines.length === 0) return;
    renderer.writeToScrollback((ctx) => {
      const root = new BoxRenderable(ctx.renderContext, {
        id,
        flexDirection: "column",
        width: ctx.width,
      });
      if (gap) {
        root.add(new TextRenderable(ctx.renderContext, { id: `${id}-gap`, content: "" }));
      }
      addLines(ctx.renderContext, root, lines, id);
      return {
        root,
        width: ctx.width,
        height: lines.length + gap,
        startOnNewLine: true,
        trailingNewline: true,
      };
    });
    return;
  }

  // Trailing newlines make the Markdown renderable emit an empty final block,
  // which lands as a stray blank row in the scrollback.
  const text = ("text" in item ? item.text : "").replace(/\s+$/, "");
  if (!text) return;

  const surface = renderer.createScrollbackSurface({ startOnNewLine: true });
  try {
    const root = new BoxRenderable(surface.renderContext, {
      id,
      flexDirection: "column",
      width: renderer.width,
    });
    if (gap) {
      root.add(new TextRenderable(surface.renderContext, { id: `${id}-gap`, content: "" }));
    }
    const label = labelFor(item);
    if (label) addLines(surface.renderContext, root, [label], `${id}-label`);

    const body = new BoxRenderable(surface.renderContext, {
      id: `${id}-body`,
      flexDirection: "column",
      width: renderer.width,
      paddingLeft: 2,
    });
    body.add(
      new MarkdownRenderable(surface.renderContext, {
        id: `${id}-md`,
        content: text,
        syntaxStyle: getMarkdownSyntaxStyle(),
        treeSitterClient: markdownParser(),
        conceal: true,
        width: "100%",
      }),
    );
    root.add(body);
    surface.root.add(root);

    surface.render();
    try {
      // Waits for pending tree-sitter highlighting, so the rows committed below
      // are already styled rather than raw source. It rejects on timeout; the
      // content is still worth showing unstyled if that happens.
      await surface.settle(SETTLE_TIMEOUT_MS);
    } catch {
      surface.render();
    }
    surface.commitRows(0, surface.height);
  } catch {
    // A resize between render and commit invalidates the surface geometry.
    // Losing one block's styling beats taking the session down.
  } finally {
    surface.destroy();
  }
}

/** Append several items in order, preserving the spacing between them. */
export async function commitItems(
  renderer: CliRenderer,
  items: TimelineItem[],
  previous?: TimelineItem,
): Promise<void> {
  let prior = previous;
  for (const item of items) {
    await commitItem(renderer, item, prior);
    prior = item;
  }
}

/** Full-width rule shown once at startup, above the welcome block. */
export function commitWelcome(
  renderer: CliRenderer,
  info: { cwd: string; model: string; resumed?: number },
): void {
  const lines: Line[] = [
    { text: `${THINKING} Welcome to Anvil`, fg: colors.accent, attributes: TextAttributes.BOLD },
    {
      text: "  /help for commands · @ to reference a file · shift+tab for plan mode",
      fg: colors.muted,
    },
    { text: `  cwd: ${info.cwd}`, fg: colors.faint },
    { text: `  model: ${info.model}`, fg: colors.faint },
  ];
  if (info.resumed) {
    lines.push({
      text: `  resumed ${info.resumed} message${info.resumed === 1 ? "" : "s"} from a previous session`,
      fg: colors.faint,
    });
  }

  const id = `sb-welcome-${commitSeq++}`;
  renderer.writeToScrollback((ctx) => {
    const root = new BoxRenderable(ctx.renderContext, {
      id,
      flexDirection: "column",
      width: ctx.width,
      border: true,
      borderStyle: "rounded",
      borderColor: colors.accentDim,
      paddingLeft: 1,
      paddingRight: 1,
    });
    addLines(ctx.renderContext, root, lines, id);
    return {
      root,
      width: ctx.width,
      height: lines.length + 2,
      startOnNewLine: true,
      trailingNewline: true,
    };
  });
}
