/**
 * Colour maths for building a palette that stays legible on whatever
 * background the user's terminal happens to have. Contrast ratios follow the
 * WCAG 2.1 definition, which is the only widely agreed measure of "can you
 * actually read this".
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Parse `#rgb` or `#rrggbb`. Returns null for anything else. */
export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, "");
  if (value.length === 3) {
    const [r, g, b] = [...value].map((c) => Number.parseInt(c + c, 16));
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r: r!, g: g!, b: b! };
  }
  if (value.length === 6) {
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r, g, b };
  }
  return null;
}

export function toHex({ r, g, b }: Rgb): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return {
    r: channel(h + 1 / 3) * 255,
    g: channel(h) * 255,
    b: channel(h - 1 / 3) * 255,
  };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

export function isDark(background: Rgb): boolean {
  return relativeLuminance(background) < 0.5;
}

/**
 * Move a colour's lightness away from the background until it reaches the
 * target contrast ratio, preserving hue and saturation so the palette keeps
 * its character. Returns the closest achievable colour if the target cannot
 * be met (a saturated hue can run out of range before pure black or white).
 */
export function ensureContrast(color: Rgb, background: Rgb, target: number): Rgb {
  if (contrastRatio(color, background) >= target) return color;

  const hsl = rgbToHsl(color);
  // Away from the background: lighten on a dark terminal, darken on a light one.
  const limit = isDark(background) ? 1 : 0;

  let low = hsl.l;
  let high = limit;
  let best = hslToRgb({ ...hsl, l: limit });

  // The relationship is monotonic in this direction, so bisection converges.
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    const candidate = hslToRgb({ ...hsl, l: mid });
    if (contrastRatio(candidate, background) >= target) {
      best = candidate;
      high = mid;
    } else {
      low = mid;
    }
  }
  return best;
}

/** `ensureContrast` over hex strings. */
export function contrastedHex(hex: string, background: string, target: number): string {
  const color = parseHex(hex);
  const bg = parseHex(background);
  if (!color || !bg) return hex;
  return toHex(ensureContrast(color, bg, target));
}
