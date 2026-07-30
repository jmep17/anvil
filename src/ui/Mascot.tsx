import React from "react";
import { Text, useAnimation } from "ink";

/** Tiny Anvil mascot — hammers while active. Fixed 1-line footprint. */
const FRAMES = ["⚒ ▄︻▄", "  ▄︻▄", "⚒ ▄═▄", "  ▄︻▄"] as const;

export function Mascot({
  active = true,
  color = "magenta",
}: {
  active?: boolean;
  color?: string;
}) {
  const { frame } = useAnimation({ interval: 220, isActive: active });
  const glyph = active ? FRAMES[frame % FRAMES.length]! : "  ▄︻▄";
  return <Text color={color}>{glyph}</Text>;
}
