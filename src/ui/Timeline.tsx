import { memo, useMemo, useState, type Ref } from "react";
import {
  MouseButton,
  TextAttributes,
  type ScrollBoxRenderable,
} from "@opentui/core";
import {
  formatToolDuration,
  formatToolInput,
  summarizeToolInput,
  wrapDisplayLines,
} from "./format.ts";
import { colors, getMarkdownSyntaxStyle } from "./theme.ts";
import type { TimelineItem } from "./types.ts";

type Tone =
  | "user"
  | "assistant"
  | "plan"
  | "thinking"
  | "tool-running"
  | "tool-done"
  | "tool-error"
  | "status"
  | "error";

interface DisplayLine {
  key: string;
  text: string;
  tone: Tone;
}

const TONE_FG: Record<Tone, string | undefined> = {
  user: colors.cyan,
  assistant: colors.text,
  plan: colors.green,
  thinking: colors.gray,
  "tool-running": colors.yellow,
  "tool-done": colors.green,
  "tool-error": colors.red,
  status: colors.gray,
  error: colors.red,
};

function appendWrapped(
  lines: DisplayLine[],
  key: string,
  text: string,
  tone: Tone,
  width: number,
  prefix = "│  ",
): void {
  for (const [index, line] of wrapDisplayLines(text, width).entries()) {
    lines.push({ key: `${key}-${index}`, text: `${prefix}${line || " "}`, tone });
  }
}

function appendTool(
  lines: DisplayLine[],
  item: Extract<TimelineItem, { kind: "tool" }>,
  width: number,
): void {
  const tone: Tone =
    item.status === "running"
      ? "tool-running"
      : item.status === "done"
        ? "tool-done"
        : "tool-error";
  const state =
    item.status === "running" ? "running" : item.status === "done" ? "complete" : "failed";
  const icon = item.status === "running" ? "◌" : item.status === "done" ? "✓" : "✕";
  const duration = formatToolDuration(item.ms);
  appendWrapped(
    lines,
    `${item.id}-title`,
    `╭─ ${icon} ${item.name} · ${state}${duration ? ` · ${duration}` : ""}`,
    tone,
    width,
    "",
  );
  lines.push({ key: `${item.id}-input-label`, text: "│  input", tone: "status" });
  appendWrapped(lines, `${item.id}-input`, formatToolInput(item.input), "status", width);
  if (item.output != null) {
    lines.push({ key: `${item.id}-output-label`, text: "│  output", tone: "status" });
    appendWrapped(lines, `${item.id}-output`, item.output, tone, width);
  }
  lines.push({ key: `${item.id}-end`, text: "╰─", tone });
}

function appendItem(lines: DisplayLine[], item: TimelineItem, width: number): void {
  switch (item.kind) {
    case "user":
      lines.push({ key: `${item.id}-title`, text: "╭─ you", tone: "user" });
      appendWrapped(lines, item.id, item.text, "user", width);
      lines.push({ key: `${item.id}-end`, text: "╰─", tone: "user" });
      return;
    case "assistant":
      lines.push({ key: `${item.id}-title`, text: "╭─ ✦ anvil", tone: "assistant" });
      appendWrapped(lines, item.id, item.text, "assistant", width);
      lines.push({ key: `${item.id}-end`, text: "╰─", tone: "assistant" });
      return;
    case "plan":
      lines.push({ key: `${item.id}-title`, text: "╭─ ✓ plan for review", tone: "plan" });
      appendWrapped(lines, item.id, item.text, "plan", width);
      lines.push({ key: `${item.id}-end`, text: "╰─", tone: "plan" });
      return;
    case "thinking":
      lines.push({ key: `${item.id}-title`, text: "╭─ thinking", tone: "thinking" });
      appendWrapped(lines, item.id, item.text, "thinking", width);
      lines.push({ key: `${item.id}-end`, text: "╰─", tone: "thinking" });
      return;
    case "tool":
      appendTool(lines, item, width);
      return;
    case "status":
      appendWrapped(lines, item.id, `· ${item.text}`, "status", width, "  ");
      return;
    case "error":
      lines.push({ key: `${item.id}-title`, text: "╭─ ✕ error", tone: "error" });
      appendWrapped(lines, item.id, item.text, "error", width);
      lines.push({ key: `${item.id}-end`, text: "╰─", tone: "error" });
      return;
  }
}

export function buildTranscriptLines(
  items: TimelineItem[],
  columns: number,
  thinking?: string,
  streaming?: string,
): DisplayLine[] {
  const width = Math.max(12, columns - 4);
  const lines: DisplayLine[] = [];
  for (const item of items) appendItem(lines, item, width);
  if (thinking) appendItem(lines, { kind: "thinking", id: "live-thinking", text: thinking }, width);
  if (streaming) appendItem(lines, { kind: "assistant", id: "live-response", text: streaming }, width);
  return lines;
}

/**
 * Keep the streaming surface deliberately plain. Incremental Markdown parsing
 * can restyle earlier rows as an unfinished construct becomes valid, which is
 * highly visible in a terminal renderer. Completed messages still use the
 * full Markdown treatment below.
 */
export function streamDisplayLines(text: string, columns: number): string[] {
  return wrapDisplayLines(text, Math.max(12, columns - 6));
}

const PlainBlock = memo(function PlainBlock({
  title,
  body,
  tone,
  width,
}: {
  title: string;
  body: string;
  tone: Tone;
  width: number;
}) {
  const fg = TONE_FG[tone];
  const dim =
    tone === "thinking" || tone === "status"
      ? TextAttributes.DIM | (tone === "thinking" ? TextAttributes.ITALIC : 0)
      : TextAttributes.NONE;
  const wrapped = wrapDisplayLines(body, width);
  return (
    <box
      flexDirection="column"
      width="100%"
      flexShrink={0}
      border={["left"]}
      borderColor={fg}
      paddingLeft={1}
    >
      <text fg={fg} attributes={TextAttributes.BOLD | dim}>
        {title}
      </text>
      {wrapped.map((line, index) => (
        <text key={index} fg={fg} attributes={dim}>
          {`│  ${line || " "}`}
        </text>
      ))}
    </box>
  );
});

const ToolBlock = memo(function ToolBlock({
  item,
  width,
}: {
  item: Extract<TimelineItem, { kind: "tool" }>;
  width: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const tone: Tone =
    item.status === "running"
      ? "tool-running"
      : item.status === "done"
        ? "tool-done"
        : "tool-error";
  const fg = TONE_FG[tone];
  const state =
    item.status === "running" ? "running" : item.status === "done" ? "complete" : "failed";
  const icon = item.status === "running" ? "◌" : item.status === "done" ? "✓" : "✕";
  const duration = formatToolDuration(item.ms);
  const chevron = expanded ? "▾" : "▸";
  const title = `${chevron} ${icon} ${item.name}`;
  const summary = summarizeToolInput(item.input, Math.max(16, width - 2));

  return (
    <box
      flexDirection="column"
      width="100%"
      flexShrink={0}
      border={["left"]}
      borderColor={fg}
      paddingLeft={1}
    >
      <box
        flexDirection="row"
        width="100%"
        flexShrink={0}
        onMouseDown={(event) => {
          if (event.button !== MouseButton.LEFT) return;
          event.stopPropagation();
          setExpanded((value) => !value);
        }}
      >
        <text fg={fg} attributes={TextAttributes.BOLD}>{title}</text>
        <text fg={colors.muted} attributes={TextAttributes.DIM}>
          {`  ${state}${duration ? ` · ${duration}` : ""}`}
        </text>
        <box flexGrow={1} />
        <text fg={expanded ? colors.cyan : colors.muted} attributes={TextAttributes.DIM}>
          {expanded ? "details" : "click to inspect"}
        </text>
      </box>
      {!expanded && summary ? (
        <text fg={colors.muted} attributes={TextAttributes.DIM}>
          {`  ${summary}`}
        </text>
      ) : null}
      {expanded ? (
        <>
          <text fg={colors.gray} attributes={TextAttributes.DIM}>
            INPUT
          </text>
          {wrapDisplayLines(formatToolInput(item.input), width).map((line, index) => (
            <text key={`in-${index}`} fg={colors.gray} attributes={TextAttributes.DIM}>
              {`  ${line || " "}`}
            </text>
          ))}
          {item.output != null ? (
            <>
              <text fg={colors.gray} attributes={TextAttributes.DIM}>
                OUTPUT
              </text>
              {wrapDisplayLines(item.output, width).map((line, index) => (
                <text key={`out-${index}`} fg={fg}>
                  {`  ${line || " "}`}
                </text>
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </box>
  );
});

const AssistantMarkdown = memo(function AssistantMarkdown({
  text,
  streaming,
  title = "✦ ANVIL",
  borderColor = colors.purple,
}: {
  text: string;
  streaming?: boolean;
  title?: string;
  borderColor?: string;
}) {
  const syntaxStyle = useMemo(() => getMarkdownSyntaxStyle(), []);
  return (
    <box
      flexDirection="column"
      width="100%"
      flexShrink={0}
      border={["left"]}
      borderColor={borderColor}
      paddingLeft={1}
    >
      <text fg={borderColor} attributes={TextAttributes.BOLD}>{title}</text>
      <box paddingLeft={2} width="100%">
        <markdown
          content={text}
          syntaxStyle={syntaxStyle}
          conceal
          streaming={Boolean(streaming)}
          width="100%"
        />
      </box>
    </box>
  );
});

const LiveAssistantText = memo(function LiveAssistantText({
  text,
  columns,
}: {
  text: string;
  columns: number;
}) {
  const lines = useMemo(() => streamDisplayLines(text, columns), [columns, text]);
  return (
    <box
      flexDirection="column"
      width="100%"
      flexShrink={0}
      border={["left"]}
      borderColor={colors.purple}
      paddingLeft={1}
    >
      <text fg={colors.purple} attributes={TextAttributes.BOLD}>
        ✦ ANVIL
      </text>
      {lines.map((line, index) => (
        <text key={index} fg={colors.text}>
          {`  ${line || " "}`}
        </text>
      ))}
    </box>
  );
});

const TimelineItemView = memo(function TimelineItemView({
  item,
  width,
}: {
  item: TimelineItem;
  width: number;
}) {
  switch (item.kind) {
    case "user":
      return <PlainBlock title="YOU" body={item.text} tone="user" width={width} />;
    case "assistant":
      return <AssistantMarkdown text={item.text} />;
    case "plan":
      return <AssistantMarkdown text={item.text} title="✓ PLAN FOR REVIEW" borderColor={colors.green} />;
    case "thinking":
      return <PlainBlock title="THINKING" body={item.text} tone="thinking" width={width} />;
    case "tool":
      return <ToolBlock item={item} width={width} />;
    case "status":
      return (
        <box
          flexDirection="column"
          width="100%"
          flexShrink={0}
          border={["left"]}
          borderColor={colors.borderMuted}
          paddingLeft={1}
        >
          {wrapDisplayLines(`· ${item.text}`, width).map((line, index) => (
            <text key={index} fg={colors.gray} attributes={TextAttributes.DIM}>
              {`  ${line}`}
            </text>
          ))}
        </box>
      );
    case "error":
      return <PlainBlock title="✕ ERROR" body={item.text} tone="error" width={width} />;
  }
});

export const Timeline = memo(function Timeline({
  items,
  columns,
  thinking,
  streaming,
  scrollRef,
}: {
  items: TimelineItem[];
  columns: number;
  thinking?: string;
  streaming?: string;
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
        contentOptions: { flexDirection: "column", width: "100%", gap: 1 },
        scrollbarOptions: {
          trackOptions: {
            foregroundColor: colors.magenta,
            backgroundColor: colors.muted,
          },
        },
      }}
    >
      {items.map((item) => (
        <TimelineItemView key={item.id} item={item} width={width} />
      ))}
      {thinking ? (
        <PlainBlock
          key="live-thinking"
          title="╭─ thinking"
          body={thinking}
          tone="thinking"
          width={width}
        />
      ) : null}
      {streaming ? (
        <LiveAssistantText key="live-response" text={streaming} columns={columns} />
      ) : null}
    </scrollbox>
  );
});
