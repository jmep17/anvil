import React from "react";
import { Text, useAnimation } from "ink";

/** Indeterminate sliding block bar — fixed width, one terminal row. */
export function ProgressBar({
  width = 16,
  active = true,
  color = "magenta",
}: {
  width?: number;
  active?: boolean;
  color?: string;
}) {
  const inner = Math.max(6, width);
  const block = Math.max(3, Math.floor(inner / 4));
  const { frame } = useAnimation({ interval: 80, isActive: active });
  const travel = Math.max(1, inner - block);
  const pos = active ? frame % (travel * 2) : 0;
  // Bounce: go right then left
  const offset = pos <= travel ? pos : travel * 2 - pos;
  const bar =
    " ".repeat(offset) + "═".repeat(block) + " ".repeat(Math.max(0, inner - offset - block));
  return (
    <Text color={color} dimColor={!active}>
      [{bar.slice(0, inner)}]
    </Text>
  );
}
