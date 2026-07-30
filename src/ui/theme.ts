import { SyntaxStyle } from "@opentui/core";

/**
 * Shared terminal palette (hex — reliable across OpenTUI ColorInput).
 *
 * Names are semantic rather than ANSI-flavoured: the accent is a warm
 * terracotta, and what used to be called "cyan" or "purple" here was never
 * either. Nothing in this file sets a surface fill — the UI draws on top of
 * whatever background the user's terminal already has.
 */
export const colors = {
  /** Primary accent. Assistant output, active chrome, selection. */
  accent: "#d97757",
  /** Accent at rest — borders and inactive marks. */
  accentDim: "#a8593f",

  success: "#8fae72",
  warning: "#d4a05e",
  danger: "#e0705c",
  info: "#8fb3c7",

  border: "#4a433c",
  borderMuted: "#302b26",

  text: "#e8e2d9",
  muted: "#8b8277",
  faint: "#5f594f",
  code: "#d6c6b4",
  link: "#8fb3c7",
  heading: "#d97757",
  list: "#d4a05e",
  quote: "#a89e91",

  /** High-contrast selection (e.g. file picker highlight). */
  selectionBg: "#d97757",
  selectionFg: "#1a1411",
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
      "markup.heading.3": { fg: colors.accentDim, bold: true },
      "markup.heading.4": { fg: colors.accentDim, bold: true },
      "markup.heading.5": { fg: colors.accentDim },
      "markup.heading.6": { fg: colors.accentDim },
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

      // Code fences are highlighted by the same style table, so give the common
      // token classes real colors instead of leaving them all `markup.raw`.
      comment: { fg: colors.faint, italic: true },
      string: { fg: colors.success },
      number: { fg: colors.warning },
      boolean: { fg: colors.warning },
      constant: { fg: colors.warning },
      keyword: { fg: colors.accent },
      "keyword.function": { fg: colors.accent },
      "keyword.return": { fg: colors.accent },
      function: { fg: colors.info },
      "function.call": { fg: colors.info },
      "function.method": { fg: colors.info },
      type: { fg: colors.list },
      variable: { fg: colors.text },
      "variable.parameter": { fg: colors.text },
      property: { fg: colors.text },
      operator: { fg: colors.muted },
      punctuation: { fg: colors.muted },
      "punctuation.bracket": { fg: colors.muted },
      "punctuation.delimiter": { fg: colors.muted },
    });
  }
  return markdownStyle;
}
