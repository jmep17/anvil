import { memo, useMemo, useState, type ReactNode, type Ref } from "react";
import {
  MouseButton,
  TextAttributes,
  type ScrollBoxRenderable,
} from "@opentui/core";
import {
  formatToolDuration,
  formatToolInput,
  summarizeToolInput,
  summarizeToolResult,
  wrapDisplayLines,
} from "./format.ts";
import { colors, getMarkdownSyntaxStyle } from "./theme.ts";
import type { TimelineItem, ToolStatus } from "./types.ts";

/**
 * Transcript glyphs. A tool call is a bullet with its result hanging beneath it
 * on a corner, so the eye follows one column instead of a stack of boxes.
 */
const BULLET = "⏺";
const CORNER = "⎿";
const THINKING = "✻";

/** Width reserved by `CORNER` plus its padding, so wrapped output stays aligned. */
const RESULT_INDENT = "     ";

function statusColor(status: ToolStatus): string {
  return status === "running" ? colors.accent : status === "done" ? colors.success : colors.danger;
}

/** `Read(src/ui/App.tsx)` — the call as the user would have written it. */
function toolTitle(name: string, input: unknown, width: number): string {
  const summary = summarizeToolInput(input, Math.max(12, width - name.length - 4));
  return summary ? `${name}(${summary})` : name;
}

const UserTurn = memo(function UserTurn({ text, width }: { text: string; width: number }) {
  const lines = wrapDisplayLines(text, Math.max(12, width - 2));
  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      {lines.map((line, index) => (
        <text key={index} fg={colors.muted}>
          {`${index === 0 ? "> " : "  "}${line || " "}`}
        </text>
      ))}
    </box>
  );
});

const AssistantMarkdown = memo(function AssistantMarkdown({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  const syntaxStyle = useMemo(() => getMarkdownSyntaxStyle(), []);
  return (
    <box flexDirection="column" width="100%" flexShrink={0} paddingLeft={2}>
      <markdown
        content={text}
        syntaxStyle={syntaxStyle}
        conceal
        streaming={Boolean(streaming)}
        width="100%"
      />
    </box>
  );
});

/**
 * Streamed text is rendered plain, not through the Markdown parser.
 * Incremental parsing restyles and reflows earlier rows every time an
 * unfinished construct becomes valid, which reads as flicker in a terminal.
 * The finished message is re-rendered as Markdown once the turn completes.
 */
const LiveAssistantText = memo(function LiveAssistantText({
  text,
  width,
}: {
  text: string;
  width: number;
}) {
  const lines = useMemo(
    () => wrapDisplayLines(text, Math.max(12, width - 2)),
    [text, width],
  );
  return (
    <box flexDirection="column" width="100%" flexShrink={0} paddingLeft={2}>
      {lines.map((line, index) => (
        <text key={index} fg={colors.text}>
          {line || " "}
        </text>
      ))}
    </box>
  );
});

/** A labelled markdown block — used where the content needs a heading (plans). */
const LabelledMarkdown = memo(function LabelledMarkdown({
  label,
  text,
  fg,
}: {
  label: string;
  text: string;
  fg: string;
}) {
  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      <text fg={fg} attributes={TextAttributes.BOLD}>
        {`${BULLET} ${label}`}
      </text>
      <AssistantMarkdown text={text} />
    </box>
  );
});

const Thinking = memo(function Thinking({ text, width }: { text: string; width: number }) {
  const lines = wrapDisplayLines(text, Math.max(12, width - 2));
  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      <text fg={colors.muted} attributes={TextAttributes.ITALIC}>
        {`${THINKING} Thinking…`}
      </text>
      {lines.map((line, index) => (
        <text key={index} fg={colors.faint} attributes={TextAttributes.ITALIC}>
          {`  ${line || " "}`}
        </text>
      ))}
    </box>
  );
});

const TODO_MARK: Record<string, string> = {
  pending: "☐",
  in_progress: "◐",
  completed: "☒",
  cancelled: "☓",
};

const Todos = memo(function Todos({
  todos,
  width,
}: {
  todos: Extract<TimelineItem, { kind: "todos" }>["todos"];
  width: number;
}) {
  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      <text fg={colors.success} attributes={TextAttributes.BOLD}>
        {`${BULLET} Update Todos`}
      </text>
      {todos.map((todo, index) => {
        const mark = TODO_MARK[todo.status] ?? "☐";
        const done = todo.status === "completed" || todo.status === "cancelled";
        const prefix = index === 0 ? `  ${CORNER}  ` : RESULT_INDENT;
        const lines = wrapDisplayLines(todo.content, Math.max(12, width - prefix.length - 2));
        return lines.map((line, lineIndex) => (
          <text
            key={`${todo.id}-${lineIndex}`}
            fg={done ? colors.faint : todo.status === "in_progress" ? colors.accent : colors.muted}
            attributes={done ? TextAttributes.STRIKETHROUGH : TextAttributes.NONE}
          >
            {`${lineIndex === 0 ? prefix : `${RESULT_INDENT}  `}${lineIndex === 0 ? `${mark} ` : ""}${line}`}
          </text>
        ));
      })}
    </box>
  );
});

const ToolRow = memo(function ToolRow({
  item,
  width,
  expandAll,
  isLast,
}: {
  item: Extract<TimelineItem, { kind: "tool" }>;
  width: number;
  expandAll: boolean;
  isLast?: boolean;
}) {
  const [expandedSelf, setExpandedSelf] = useState(false);
  const expanded = expandAll || expandedSelf;
  const fg = statusColor(item.status);
  const duration = formatToolDuration(item.ms);
  const title = toolTitle(item.name, item.input, width);
  const summary =
    item.status === "running"
      ? "running…"
      : summarizeToolResult(item.name, item.output, item.status === "error");

  return (
    <box
      flexDirection="column"
      width="100%"
      flexShrink={0}
      onMouseDown={(event) => {
        if (event.button !== MouseButton.LEFT) return;
        event.stopPropagation();
        setExpandedSelf((value) => !value);
      }}
    >
      <box flexDirection="row" width="100%" flexShrink={0}>
        <text fg={fg}>{`${BULLET} `}</text>
        <text fg={colors.text} attributes={TextAttributes.BOLD}>
          {title}
        </text>
        {duration ? <text fg={colors.faint}>{`  ${duration}`}</text> : null}
      </box>

      {!expanded ? (
        <box flexDirection="row" width="100%" flexShrink={0}>
          <text fg={colors.muted}>{`  ${CORNER}  ${summary}`}</text>
          {/* Only the newest row carries the hint — on every row it is noise. */}
          {isLast && item.output ? (
            <text fg={colors.faint}>{"  ctrl+o to expand"}</text>
          ) : null}
        </box>
      ) : (
        <>
          <text fg={colors.muted}>
            {`  ${CORNER}  ${item.name} input`}
          </text>
          {wrapDisplayLines(formatToolInput(item.input), Math.max(12, width - 8)).map(
            (line, index) => (
              <text key={`in-${index}`} fg={colors.faint}>
                {`${RESULT_INDENT}${line || " "}`}
              </text>
            ),
          )}
          {item.output != null ? (
            wrapDisplayLines(item.output, Math.max(12, width - 8)).map((line, index) => (
              <text
                key={`out-${index}`}
                fg={item.status === "error" ? colors.danger : colors.muted}
              >
                {`${RESULT_INDENT}${line || " "}`}
              </text>
            ))
          ) : null}
        </>
      )}
    </box>
  );
});

const ErrorRow = memo(function ErrorRow({ text, width }: { text: string; width: number }) {
  const lines = wrapDisplayLines(text, Math.max(12, width - 6));
  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      <text fg={colors.danger} attributes={TextAttributes.BOLD}>
        {`${BULLET} Error`}
      </text>
      {lines.map((line, index) => (
        <text key={index} fg={colors.danger}>
          {`  ${index === 0 ? `${CORNER}  ` : "   "}${line || " "}`}
        </text>
      ))}
    </box>
  );
});

const StatusRow = memo(function StatusRow({ text, width }: { text: string; width: number }) {
  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      {wrapDisplayLines(text, Math.max(12, width - 4)).map((line, index) => (
        <text key={index} fg={colors.faint}>
          {`  ${index === 0 ? "· " : "  "}${line}`}
        </text>
      ))}
    </box>
  );
});

/**
 * Blank lines above an item. Turns and tool blocks breathe; a status line
 * annotates whatever precedes it, so it sits directly beneath it.
 */
function spacingBefore(
  item: TimelineItem,
  previous: TimelineItem | undefined,
  atVeryTop: boolean,
): number {
  if (item.kind === "status") return 0;
  // The first item still needs air under the welcome block, but not when it
  // is the very first thing on screen.
  if (!previous) return atVeryTop ? 0 : 1;
  return 1;
}

const TimelineItemView = memo(function TimelineItemView({
  item,
  width,
  expandAll,
  isLast,
}: {
  item: TimelineItem;
  width: number;
  expandAll: boolean;
  isLast?: boolean;
}) {
  switch (item.kind) {
    case "user":
      return <UserTurn text={item.text} width={width} />;
    case "assistant":
      return <AssistantMarkdown text={item.text} />;
    case "plan":
      return <LabelledMarkdown label="Plan for review" text={item.text} fg={colors.success} />;
    case "clarification":
      return (
        <LabelledMarkdown label="Clarification needed" text={item.text} fg={colors.warning} />
      );
    case "thinking":
      return <Thinking text={item.text} width={width} />;
    case "todos":
      return <Todos todos={item.todos} width={width} />;
    case "tool":
      return <ToolRow item={item} width={width} expandAll={expandAll} isLast={isLast} />;
    case "status":
      return <StatusRow text={item.text} width={width} />;
    case "error":
      return <ErrorRow text={item.text} width={width} />;
  }
});

export const Timeline = memo(function Timeline({
  items,
  columns,
  thinking,
  streaming,
  expandAll,
  welcome,
  scrollRef,
}: {
  items: TimelineItem[];
  columns: number;
  thinking?: string;
  streaming?: string;
  expandAll?: boolean;
  /** Rendered above the first item and scrolled away with it. */
  welcome?: ReactNode;
  scrollRef?: Ref<ScrollBoxRenderable>;
}) {
  const width = Math.max(12, columns - 4);
  return (
    <scrollbox
      ref={scrollRef}
      flexGrow={1}
      width="100%"
      stickyScroll
      stickyStart="bottom"
      scrollX={false}
      scrollY
      style={{
        rootOptions: { flexGrow: 1, width: "100%" },
        wrapperOptions: { flexGrow: 1 },
        viewportOptions: { flexGrow: 1 },
        // Spacing is decided per item rather than by a uniform gap, so a status
        // line can hug what it annotates instead of floating between blanks.
        contentOptions: { flexDirection: "column", width: "100%" },
        // The transcript scrolls with the terminal's own conventions; a drawn
        // scrollbar is just a column of noise beside the text.
        verticalScrollbarOptions: { visible: false },
        horizontalScrollbarOptions: { visible: false },
      }}
    >
      {welcome}
      {items.map((item, index) => (
        <box
          key={item.id}
          flexDirection="column"
          width="100%"
          flexShrink={0}
          marginTop={spacingBefore(item, items[index - 1], index === 0 && !welcome)}
        >
          <TimelineItemView
            item={item}
            width={width}
            expandAll={Boolean(expandAll)}
            isLast={index === items.length - 1 && !thinking && !streaming}
          />
        </box>
      ))}
      {thinking ? (
        <box flexDirection="column" width="100%" flexShrink={0} marginTop={1}>
          <Thinking text={thinking} width={width} />
        </box>
      ) : null}
      {streaming ? (
        <box flexDirection="column" width="100%" flexShrink={0} marginTop={1}>
          <LiveAssistantText text={streaming} width={width} />
        </box>
      ) : null}
    </scrollbox>
  );
});
