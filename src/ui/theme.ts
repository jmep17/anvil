import { SyntaxStyle } from "@opentui/core";

/** Shared terminal palette (hex — reliable across OpenTUI ColorInput). */
export const colors = {
  // Warm, low-saturation tones: closer to a focused coding surface than a dashboard.
  canvas: "#171513",
  surface: "#1e1b18",
  surfaceRaised: "#28231f",
  surfaceMuted: "#141210",
  border: "#4a433c",
  borderMuted: "#302b26",
  magenta: "#c78f61",
  purple: "#d2a06f",
  cyan: "#9db7ae",
  yellow: "#c9aa69",
  green: "#a8b58a",
  red: "#cf8075",
  gray: "#b7afa5",
  muted: "#8b8277",
  text: "#eee8df",
  code: "#d6c6b4",
  link: "#aabcb1",
  heading: "#d7b17d",
  list: "#d3a36c",
  quote: "#a89e91",
  /** High-contrast selection (e.g. file picker highlight). */
  selectionBg: "#d5b18a",
  selectionFg: "#211b15",
} as const;

let markdownStyle: SyntaxStyle | null = null;

/** SyntaxStyle for assistant markdown (lazy — needs native OpenTUI core). */
export function getMarkdownSyntaxStyle(): SyntaxStyle {
  if (!markdownStyle) {
    markdownStyle = SyntaxStyle.fromStyles({
      default: { fg: colors.text },
      "markup.heading": { fg: colors.heading, bold: true },
      "markup.heading.1": { fg: colors.heading, bold: true },
      "markup.heading.2": { fg: colors.heading, bold: true },
      "markup.heading.3": { fg: colors.cyan, bold: true },
      "markup.heading.4": { fg: colors.cyan, bold: true },
      "markup.heading.5": { fg: colors.cyan },
      "markup.heading.6": { fg: colors.cyan },
      "markup.bold": { bold: true },
      "markup.strong": { bold: true },
      "markup.italic": { italic: true },
      "markup.list": { fg: colors.list },
      "markup.quote": { fg: colors.quote, italic: true },
      "markup.raw": { fg: colors.code },
      "markup.raw.block": { fg: colors.code },
      "markup.raw.inline": { fg: colors.code },
      "markup.link": { fg: colors.link, underline: true },
      "markup.link.label": { fg: colors.link },
      "markup.link.url": { fg: colors.muted, underline: true },
      "punctuation.special": { fg: colors.muted },
      conceal: { fg: colors.muted },
    });
  }
  return markdownStyle;
}
