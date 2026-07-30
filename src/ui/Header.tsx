import React from "react";
import { Box, Text, useAnimation } from "ink";

export function Header({
  status,
  busy,
}: {
  status: string;
  busy: boolean;
}) {
  const { frame } = useAnimation({ interval: 500, isActive: busy });
  const pulse = busy && frame % 2 === 0;

  return (
    <Box borderStyle="single" paddingX={1} width="100%">
      <Text bold color="magenta">
        anvil
      </Text>
      <Text dimColor={!pulse}> · {status}</Text>
    </Box>
  );
}
