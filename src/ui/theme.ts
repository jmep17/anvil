import { SyntaxStyle } from "@opentui/core";

/** Shared terminal palette (hex — reliable across OpenTUI ColorInput). */
export const colors = {
  magenta: "#c084fc",
  cyan: "#22d3ee",
  yellow: "#facc15",
  green: "#4ade80",
  red: "#f87171",
  gray: "#9ca3af",
  muted: "#6b7280",
  text: "#e5e7eb",
  code: "#a5d6ff",
  link: "#58a6ff",
  heading: "#58a6ff",
  list: "#ff7b72",
  quote: "#8b949e",
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
