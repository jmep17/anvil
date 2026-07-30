import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { testRender } from "@opentui/react/test-utils";
import { unifiedDiff } from "../fs/diff.ts";
import { InputBox, permissionContentRows } from "./InputBox.tsx";

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

describe("approval prompt in limited space", () => {
  const bigFile = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i};`).join("\n");
  const bigDiff = unifiedDiff("/repo/src/big.ts", bigFile, bigFile.replace("line0", "renamed"));

  test("the options stay on screen for a very long file", async () => {
    // A short terminal: the prompt must not push its own actions off the bottom.
    const frame = await frameFor(
      <InputBox
        value=""
        cursor={0}
        busy={false}
        columns={80}
        maxRows={14}
        pending={{ toolName: "Edit", detail: "/repo/src/big.ts", preview: bigDiff }}
      />,
      80,
      14,
    );

    expect(frame).toContain("Do you want to make this edit?");
    expect(frame).toContain("1. Yes");
    expect(frame).toContain("3. No,");
    // And it says what it left out rather than silently cutting.
    expect(frame).toMatch(/more diff lines/);
  });

  test("with almost no room it falls back to a one-line summary", async () => {
    const frame = await frameFor(
      <InputBox
        value=""
        cursor={0}
        busy={false}
        columns={80}
        maxRows={9}
        pending={{ toolName: "Edit", detail: "/repo/src/big.ts", preview: bigDiff }}
      />,
      80,
      9,
    );

    expect(frame).toContain("1. Yes");
    expect(frame).toContain("3. No,");
    expect(frame).toMatch(/addition|removal/);
  });

  test("the reserved height matches what is drawn", async () => {
    for (const maxRows of [9, 12, 16, 24, 40]) {
      const pending = { toolName: "Edit", detail: "/repo/src/big.ts", preview: bigDiff };
      const rows = permissionContentRows(pending, 80, maxRows) + 2; // + border
      expect(rows).toBeLessThanOrEqual(Math.max(10, maxRows));
    }
  });

  test("a short diff is shown in full, with no truncation notice", async () => {
    const small = unifiedDiff("/repo/a.ts", "one\ntwo\n", "one\nTWO\n");
    const frame = await frameFor(
      <InputBox
        value=""
        cursor={0}
        busy={false}
        columns={80}
        maxRows={24}
        pending={{ toolName: "Edit", detail: "/repo/a.ts", preview: small }}
      />,
      80,
      24,
    );
    // The diff renderable puts the +/- sign in its own gutter column.
    expect(frame).toMatch(/-\s+two/);
    expect(frame).toMatch(/\+\s+TWO/);
    expect(frame).not.toContain("more diff line");
  });
});
