import React from "react";
import { Box, Text } from "ink";
import { wrapDisplayLines } from "./format.ts";

function statusLines(status: string, columns: number): string[] {
  return wrapDisplayLines(status, Math.max(12, columns - 4));
}

/** Includes the box borders and is used to reserve transcript space. */
export function headerHeight(status: string, columns: number): number {
  return 3 + statusLines(status, columns).length;
}

export function Header({ status, columns }: { status: string; columns: number }) {
  return (
    <Box borderStyle="round" borderColor="magenta" paddingX={1} width="100%" flexDirection="column" flexShrink={0}>
      <Box>
        <Text bold color="magenta">◆ ANVIL</Text>
        <Text dimColor>  LOCAL CODING AGENT</Text>
      </Box>
      {statusLines(status, columns).map((line, index) => (
        <Text key={index} dimColor color="cyan">{line || " "}</Text>
      ))}
    </Box>
  );
}
