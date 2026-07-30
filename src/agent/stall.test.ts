import { describe, expect, test } from "bun:test";
import { shouldPauseReadTool } from "./stall.ts";

describe("shouldPauseReadTool", () => {
  test("pauses a repeated identical read", () => {
    expect(
      shouldPauseReadTool([
        { toolCalls: [{ toolName: "Read", input: { path: "src/app.ts" } }] },
        { toolCalls: [{ toolName: "Read", input: { path: "src/app.ts" } }] },
      ]),
    ).toBe(true);
  });

  test("allows distinct reads and steps that include an action", () => {
    expect(
      shouldPauseReadTool([
        { toolCalls: [{ toolName: "Read", input: { path: "src/app.ts" } }] },
        { toolCalls: [{ toolName: "Read", input: { path: "src/config.ts" } }] },
      ]),
    ).toBe(false);
    expect(
      shouldPauseReadTool([
        { toolCalls: [{ toolName: "Read", input: { path: "src/app.ts" } }] },
        {
          toolCalls: [
            { toolName: "Read", input: { path: "src/app.ts" } },
            { toolName: "Edit", input: { path: "src/app.ts" } },
          ],
        },
      ]),
    ).toBe(false);
  });
});
