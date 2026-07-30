import React from "react";
import { Text, useAnimation } from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export function Spinner({
  color = "cyan",
  active = true,
}: {
  color?: string;
  active?: boolean;
}) {
  const { frame } = useAnimation({ interval: 80, isActive: active });
  const glyph = active ? FRAMES[frame % FRAMES.length]! : "·";
  return <Text color={color}>{glyph}</Text>;
}
