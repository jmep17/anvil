import { SyntaxStyle, getTreeSitterClient, type TreeSitterClient } from "@opentui/core";
import { contrastedHex, isDark, parseHex } from "./color.ts";

export type ThemeMode = "dark" | "light";

/**
 * Each role carries a hue and the contrast ratio it needs against the
 * terminal's own background. The hue is the design intent; the ratio is the
 * floor that keeps it readable. Colours are lightened or darkened at startup
 * until they clear the floor, so nothing is hard-coded to a background we do
 * not control.
 *
 * Ratios follow WCAG bands: 7 for prose, 4.5 for anything carrying meaning,
 * 3 for decoration, and below that for rules and separators that should
 * recede.
 */
const ROLES = {
  accent: { hue: "#d97757", min: 4.5 },
  accentDim: { hue: "#c2654a", min: 3 },

  success: { hue: "#7faa5e", min: 4.5 },
  warning: { hue: "#d4a05e", min: 4.5 },
  danger: { hue: "#e0705c", min: 4.5 },
  info: { hue: "#6fa3bf", min: 4.5 },

  border: { hue: "#8a7f72", min: 1.9 },
  borderMuted: { hue: "#8a7f72", min: 1.4 },

  text: { hue: "#e8e2d9", min: 7 },
  /** Real content that is deliberately quieter: user turns, tool summaries. */
  muted: { hue: "#a99f92", min: 4.5 },
  /** Decoration only: durations, hints, separators. */
  faint: { hue: "#8a8074", min: 2.8 },

  code: { hue: "#d6c6b4", min: 5.5 },
  link: { hue: "#6fa3bf", min: 4.5 },
  heading: { hue: "#d97757", min: 5 },
  list: { hue: "#d4a05e", min: 4.5 },
  quote: { hue: "#a89e91", min: 4 },
} as const;

export type ColorRole = keyof typeof ROLES;

export type Palette = Record<ColorRole, string> & {
  /** High-contrast selection (e.g. picker highlight). */
  selectionBg: string;
  selectionFg: string;
  /** The background everything was measured against. */
  background: string;
};

const DARK_BACKGROUND = "#17150f";
const LIGHT_BACKGROUND = "#faf7f2";

export function backgroundFor(mode: ThemeMode): string {
  return mode === "light" ? LIGHT_BACKGROUND : DARK_BACKGROUND;
}

/** Build a palette legible against `background` (a hex string). */
export function buildPalette(background: string): Palette {
  const bg = parseHex(background) ? background : DARK_BACKGROUND;
  const out = {} as Record<ColorRole, string>;
  for (const [role, { hue, min }] of Object.entries(ROLES) as Array<
    [ColorRole, { hue: string; min: number }]
  >) {
    out[role] = contrastedHex(hue, bg, min);
  }

  const parsed = parseHex(bg)!;
  // Selection inverts: the accent becomes the fill, and the text on it takes
  // the background's own tone so it reads on either theme.
  const selectionBg = out.accent;
  const selectionFg = contrastedHex(isDark(parsed) ? "#17150f" : "#faf7f2", selectionBg, 4.5);

  return { ...out, selectionBg, selectionFg, background: bg };
}

/**
 * The live palette. Populated once at startup from the terminal's real
 * background before the first frame renders, so components can keep importing
 * it directly. Defaults to the dark palette for tests and non-TTY use.
 */
export const colors: Palette = buildPalette(DARK_BACKGROUND);

let markdownStyle: SyntaxStyle | null = null;

/** Replace the live palette. Safe to call before the first render only. */
export function applyPalette(palette: Palette): void {
  Object.assign(colors, palette);
  // The syntax style captures colours by value, so it has to be rebuilt.
  markdownStyle = null;
}

/** Resolve a background from an explicit preference or a detected one. */
export function resolveBackground(
  preference: "auto" | ThemeMode,
  detected: { background?: string | null; mode?: ThemeMode | null },
): string {
  if (preference !== "auto") return backgroundFor(preference);
  if (detected.background && parseHex(detected.background)) return detected.background;
  if (detected.mode) return backgroundFor(detected.mode);
  return DARK_BACKGROUND;
}

/**
 * Markdown styling is driven by tree-sitter captures (`markup.heading`,
 * `markup.bold`, …), so the renderable needs a parser client to produce them.
 * Without one it emits the raw source — `## heading`, `**bold**` — instead of
 * formatted output. The grammars ship inside @opentui/core, so this is local
 * and does not fetch anything.
 *
 * Lazy: touching it pulls in the native core, which must not happen at import
 * time in tests that never render.
 */
export function markdownParser(): TreeSitterClient {
  return getTreeSitterClient();
}

/**
 * Load the markdown grammars before the first message needs them. Highlighting
 * is asynchronous and a block renders unstyled until its highlights arrive, so
 * paying that cost at startup keeps the first assistant reply from appearing
 * as raw `##` and `**`. Failure is not fatal — it only means the first block
 * formats a moment late.
 */
export async function warmMarkdownParser(): Promise<void> {
  const sample = "# h\n\n**b** `c`\n\n- i\n";
  try {
    await markdownParser().highlightOnce(sample, "markdown");
  } catch {
    // Grammar unavailable; the renderable falls back on its own.
  }
}

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

      // Code fences run through the same table, so the common token classes
      // get real colours instead of one flat shade.
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
