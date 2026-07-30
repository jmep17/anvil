import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { testRender } from "@opentui/react/test-utils";
import { unifiedDiff } from "../fs/diff.ts";
import { InputBox } from "./InputBox.tsx";

async function frameFor(
  element: ReactNode,
  width = 80,
  height = 24,
): Promise<string> {
  const { renderer, captureCharFrame, waitForVisualIdle } = await testRender(element, {
    width,
    height,
  });
  try {
    await waitForVisualIdle();
    return captureCharFrame();
  } finally {
    renderer.destroy();
  }
}

describe("InputBox", () => {
  test("an empty prompt shows a placeholder", async () => {
    const frame = await frameFor(<InputBox value="" cursor={0} busy={false} columns={80} />);
    expect(frame).toContain(">");
    expect(frame).toContain("Ask Anvil");
  });

  test("typed text replaces the placeholder", async () => {
    const frame = await frameFor(
      <InputBox value="fix the parser" cursor={14} busy={false} columns={80} />,
    );
    expect(frame).toContain("> fix the parser");
    expect(frame).not.toContain("Ask Anvil");
  });

  test("a permission prompt asks a question and offers numbered choices", async () => {
    const frame = await frameFor(
      <InputBox
        value=""
        cursor={0}
        busy={false}
        columns={80}
        pending={{ toolName: "Edit", detail: "/repo/src/app.ts" }}
      />,
    );
    expect(frame).toContain("Edit");
    expect(frame).toContain("Do you want to make this edit?");
    expect(frame).toContain("1. Yes");
    expect(frame).toContain("2. Yes, and don't ask again");
    expect(frame).toContain("3. No,");
    // The selected option is marked, not just implied.
    expect(frame).toContain("❯ 1.");
  });

  test("the highlighted choice follows the selection index", async () => {
    const frame = await frameFor(
      <InputBox
        value=""
        cursor={0}
        busy={false}
        columns={80}
        pendingChoice={2}
        pending={{ toolName: "Bash", detail: "rm -rf build" }}
      />,
    );
    expect(frame).toContain("❯ 3.");
    expect(frame).toContain("Do you want to run this command?");
    expect(frame).toContain("for commands like this");
  });

  test("an edit approval renders the diff, not a flattened one-liner", async () => {
    const diff = unifiedDiff("/repo/src/app.ts", "const a = 1;\nkeep\n", "const a = 2;\nkeep\n");
    const frame = await frameFor(
      <InputBox
        value=""
        cursor={0}
        busy={false}
        columns={80}
        pending={{ toolName: "Edit", detail: "/repo/src/app.ts", preview: diff }}
      />,
    );
    expect(frame).toContain("const a = 1;");
    expect(frame).toContain("const a = 2;");
    // The old preview collapsed newlines into this marker.
    expect(frame).not.toContain("↵");
  });

  test("plan review offers both outcomes", async () => {
    const frame = await frameFor(
      <InputBox value="" cursor={0} busy={false} columns={80} planReview="ready" />,
    );
    expect(frame).toContain("Ready to implement this plan?");
    expect(frame).toContain("1. Yes, implement it");
    expect(frame).toContain("2. No, let me give feedback");
  });
});
