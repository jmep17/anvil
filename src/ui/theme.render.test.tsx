import { afterEach, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { contrastRatio, parseHex, type Rgb } from "./color.ts";
import { applyPalette, buildPalette } from "./theme.ts";
import { InputBox } from "./InputBox.tsx";

const DARK = "#17150f";

afterEach(() => {
  applyPalette(buildPalette(DARK));
});

/** Foreground colours actually painted for cells containing `text`. */
async function inkFor(value: string, needle: string, _background: string): Promise<Rgb[]> {
  const { renderer, captureSpans, waitForVisualIdle } = await testRender(
    <InputBox value={value} cursor={value.length} busy={false} columns={72} />,
    { width: 72, height: 20 },
  );
  try {
    await waitForVisualIdle();
    const frame = captureSpans();
    const found: Rgb[] = [];
    for (const line of frame.lines) {
      for (const span of line.spans) {
        if (!span.text.includes(needle)) continue;
        const fg = span.fg;
        if (!fg) continue;
        found.push({
          r: Math.round(fg.r * 255),
          g: Math.round(fg.g * 255),
          b: Math.round(fg.b * 255),
        });
      }
    }
    expect(found.length).toBeGreaterThan(0);
    return found;
  } finally {
    renderer.destroy();
  }
}

const TYPED = "distinctivetext";

describe("palette applied to real frames", () => {
  test("a light terminal gets ink dark enough to read", async () => {
    const background = "#ffffff";
    applyPalette(buildPalette(background));

    const bg = parseHex(background)!;
    for (const ink of await inkFor(TYPED, "distinctivetext", background)) {
      expect(contrastRatio(ink, bg)).toBeGreaterThanOrEqual(4.4);
    }
  });

  test("a dark terminal gets ink light enough to read", async () => {
    applyPalette(buildPalette(DARK));

    const bg = parseHex(DARK)!;
    for (const ink of await inkFor(TYPED, "distinctivetext", DARK)) {
      expect(contrastRatio(ink, bg)).toBeGreaterThanOrEqual(4.4);
    }
  });

  test("the placeholder stays readable, not just typed text", async () => {
    const background = "#ffffff";
    applyPalette(buildPalette(background));

    const bg = parseHex(background)!;
    for (const ink of await inkFor("", "Ask Anvil", background)) {
      expect(contrastRatio(ink, bg)).toBeGreaterThanOrEqual(2.7);
    }
  });
});
