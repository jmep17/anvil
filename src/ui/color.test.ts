import { describe, expect, test } from "bun:test";
import {
  contrastRatio,
  contrastedHex,
  ensureContrast,
  hslToRgb,
  isDark,
  parseHex,
  relativeLuminance,
  rgbToHsl,
  toHex,
} from "./color.ts";

describe("parseHex", () => {
  test("accepts both short and long form, with or without the hash", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHex("#d97757")).toEqual({ r: 0xd9, g: 0x77, b: 0x57 });
  });

  test("rejects anything that is not a hex colour", () => {
    for (const input of ["", "#", "#12", "#12345", "rgb(1,2,3)", "#gggggg"]) {
      expect(parseHex(input)).toBeNull();
    }
  });
});

describe("hsl round-trip", () => {
  test("survives conversion in both directions", () => {
    for (const hex of ["#d97757", "#8fae72", "#17150f", "#ffffff", "#000000", "#808080"]) {
      const rgb = parseHex(hex)!;
      expect(toHex(hslToRgb(rgbToHsl(rgb)))).toBe(hex);
    }
  });
});

describe("relativeLuminance", () => {
  test("spans black to white", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  test("weights green above red above blue", () => {
    const red = relativeLuminance({ r: 255, g: 0, b: 0 });
    const green = relativeLuminance({ r: 0, g: 255, b: 0 });
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 });
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe("contrastRatio", () => {
  test("matches the known WCAG extremes", () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 2);
    expect(contrastRatio(black, black)).toBe(1);
  });

  test("is symmetric", () => {
    const a = parseHex("#d97757")!;
    const b = parseHex("#17150f")!;
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});

describe("isDark", () => {
  test("classifies common terminal backgrounds", () => {
    expect(isDark(parseHex("#000000")!)).toBe(true);
    expect(isDark(parseHex("#282a36")!)).toBe(true);
    expect(isDark(parseHex("#002b36")!)).toBe(true);
    expect(isDark(parseHex("#ffffff")!)).toBe(false);
    expect(isDark(parseHex("#fdf6e3")!)).toBe(false);
  });
});

describe("ensureContrast", () => {
  test("leaves a colour alone when it already clears the target", () => {
    const white = parseHex("#ffffff")!;
    const black = parseHex("#000000")!;
    expect(ensureContrast(white, black, 4.5)).toEqual(white);
  });

  test("lightens against a dark background and darkens against a light one", () => {
    const mid = parseHex("#808080")!;
    const lightened = ensureContrast(mid, parseHex("#000000")!, 7);
    const darkened = ensureContrast(mid, parseHex("#ffffff")!, 7);
    expect(relativeLuminance(lightened)).toBeGreaterThan(relativeLuminance(mid));
    expect(relativeLuminance(darkened)).toBeLessThan(relativeLuminance(mid));
  });

  test("reaches the requested ratio", () => {
    for (const background of ["#000000", "#17150f", "#282a36", "#fdf6e3", "#ffffff"]) {
      for (const target of [3, 4.5, 7]) {
        const result = ensureContrast(parseHex("#808080")!, parseHex(background)!, target);
        expect(contrastRatio(result, parseHex(background)!)).toBeGreaterThanOrEqual(target - 0.05);
      }
    }
  });

  test("preserves hue while adjusting lightness", () => {
    const orange = parseHex("#d97757")!;
    const adjusted = ensureContrast(orange, parseHex("#ffffff")!, 7);
    expect(rgbToHsl(adjusted).h).toBeCloseTo(rgbToHsl(orange).h, 2);
  });

  test("returns the closest achievable colour when the target is impossible", () => {
    // Nothing reaches 21:1 against mid-grey; the result should still be extreme.
    const result = ensureContrast(parseHex("#808080")!, parseHex("#767676")!, 21);
    const luminance = relativeLuminance(result);
    expect(luminance === 0 || luminance > 0.9).toBe(true);
  });
});

describe("contrastedHex", () => {
  test("passes malformed input through untouched", () => {
    expect(contrastedHex("not-a-colour", "#000000", 4.5)).toBe("not-a-colour");
    expect(contrastedHex("#d97757", "not-a-colour", 4.5)).toBe("#d97757");
  });
});
