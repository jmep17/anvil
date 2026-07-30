import { describe, expect, test } from "bun:test";
import { contrastRatio, parseHex, relativeLuminance } from "./color.ts";
import { buildPalette, resolveBackground, type Palette } from "./theme.ts";

/** Backgrounds people actually run terminals on. */
const BACKGROUNDS = {
  "pure black": "#000000",
  "near-black warm": "#17150f",
  "solarized dark": "#002b36",
  "dracula": "#282a36",
  "gruvbox dark": "#282828",
  "solarized light": "#fdf6e3",
  "pure white": "#ffffff",
  "paper": "#faf7f2",
} as const;

/** Roles that carry meaning must be readable, not merely present. */
const CONTENT_ROLES: Array<keyof Palette> = [
  "text",
  "muted",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
  "code",
  "link",
  "heading",
  "list",
];

function ratio(color: string, background: string): number {
  return contrastRatio(parseHex(color)!, parseHex(background)!);
}

describe("buildPalette", () => {
  for (const [name, background] of Object.entries(BACKGROUNDS)) {
    test(`content stays readable on ${name}`, () => {
      const palette = buildPalette(background);
      for (const role of CONTENT_ROLES) {
        // WCAG AA for normal text.
        expect({ role, ratio: ratio(palette[role], background) }).toMatchObject({
          role,
          ratio: expect.any(Number),
        });
        expect(ratio(palette[role], background)).toBeGreaterThanOrEqual(4.4);
      }
    });

    test(`body text is comfortably readable on ${name}`, () => {
      const palette = buildPalette(background);
      // WCAG AAA for the colour the bulk of the transcript uses.
      expect(ratio(palette.text, background)).toBeGreaterThanOrEqual(6.9);
    });

    test(`decoration is visible but recedes on ${name}`, () => {
      const palette = buildPalette(background);
      const faint = ratio(palette.faint, background);
      expect(faint).toBeGreaterThanOrEqual(2.7);
      // Decoration must not out-shout the prose it sits beside.
      expect(faint).toBeLessThan(ratio(palette.text, background));
    });

    test(`borders are perceptible without competing with text on ${name}`, () => {
      const palette = buildPalette(background);
      expect(ratio(palette.border, background)).toBeGreaterThanOrEqual(1.35);
      expect(ratio(palette.border, background)).toBeLessThan(ratio(palette.muted, background));
      expect(ratio(palette.borderMuted, background)).toBeLessThanOrEqual(
        ratio(palette.border, background),
      );
    });

    test(`selection text reads against its own fill on ${name}`, () => {
      const palette = buildPalette(background);
      expect(ratio(palette.selectionFg, palette.selectionBg)).toBeGreaterThanOrEqual(4.4);
    });
  }

  test("a light terminal gets darker ink than a dark one", () => {
    const onLight = buildPalette("#ffffff");
    const onDark = buildPalette("#000000");
    expect(relativeLuminance(parseHex(onLight.text)!)).toBeLessThan(
      relativeLuminance(parseHex(onDark.text)!),
    );
    expect(relativeLuminance(parseHex(onLight.muted)!)).toBeLessThan(
      relativeLuminance(parseHex(onDark.muted)!),
    );
  });

  test("hue survives the contrast adjustment", () => {
    // Danger stays red-dominant and success stays green-dominant on both themes.
    for (const background of ["#000000", "#ffffff"]) {
      const palette = buildPalette(background);
      const danger = parseHex(palette.danger)!;
      const success = parseHex(palette.success)!;
      expect(danger.r).toBeGreaterThan(danger.b);
      expect(success.g).toBeGreaterThan(success.b);
    }
  });

  test("an unparseable background falls back to the dark palette", () => {
    expect(buildPalette("not-a-colour")).toEqual(buildPalette("#17150f"));
  });
});

describe("resolveBackground", () => {
  test("an explicit preference wins over what was detected", () => {
    const light = resolveBackground("light", { background: "#000000", mode: "dark" });
    expect(relativeLuminance(parseHex(light)!)).toBeGreaterThan(0.5);
  });

  test("auto prefers the terminal's reported background", () => {
    expect(resolveBackground("auto", { background: "#002b36", mode: "light" })).toBe("#002b36");
  });

  test("auto falls back to the reported mode, then to dark", () => {
    const fromMode = resolveBackground("auto", { background: null, mode: "light" });
    expect(relativeLuminance(parseHex(fromMode)!)).toBeGreaterThan(0.5);

    const fallback = resolveBackground("auto", { background: null, mode: null });
    expect(relativeLuminance(parseHex(fallback)!)).toBeLessThan(0.5);
  });

  test("a malformed reported background is ignored rather than trusted", () => {
    const resolved = resolveBackground("auto", { background: "rgb(1,2,3)", mode: "light" });
    expect(relativeLuminance(parseHex(resolved)!)).toBeGreaterThan(0.5);
  });
});
