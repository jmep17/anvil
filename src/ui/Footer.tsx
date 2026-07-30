import React from "react";
import { Box, Text } from "ink";

export function Footer({ busy }: { busy: boolean }) {
  const hint = busy
    ? "Esc interrupt"
    : "Enter send · Ctrl+J newline · Esc clear · Shift+Tab mode · /exit /mode /compact";

  return (
    <Box paddingX={1}>
      <Text dimColor>{hint}</Text>
    </Box>
  );
}
