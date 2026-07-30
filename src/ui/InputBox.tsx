import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "./Spinner.tsx";

export function InputBox({
  value,
  busy,
  pending,
}: {
  value: string;
  busy: boolean;
  pending?: { toolName: string; detail: string } | null;
}) {
  if (pending) {
    return (
      <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
        <Text color="yellow">
          Allow {pending.toolName}? {pending.detail.slice(0, 80)}
        </Text>
        <Text dimColor>[a] allow · [A] always · [d] deny</Text>
      </Box>
    );
  }

  const lines = value.length === 0 ? [""] : value.split("\n");
  const last = lines.length - 1;
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      {lines.map((line, i) => (
        <Box key={`l-${i}`}>
          {i === 0 ? (
            busy ? (
              <>
                <Spinner color="green" />
                <Text color="green"> </Text>
              </>
            ) : (
              <Text color="green">› </Text>
            )
          ) : (
            <Text>  </Text>
          )}
          <Text>{line}</Text>
          {!busy && i === last ? <Text dimColor>█</Text> : null}
        </Box>
      ))}
    </Box>
  );
}
