import React from "react";
import { Box, Text } from "ink";

export function Header({ status }: { status: string }) {
  return (
    <Box borderStyle="single" paddingX={1} width="100%" flexShrink={0}>
      <Text bold color="magenta">
        anvil
      </Text>
      <Text dimColor> · {status}</Text>
    </Box>
  );
}
