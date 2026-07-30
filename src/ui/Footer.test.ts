import { describe, expect, test } from "bun:test";
import { footerHint } from "./Footer.tsx";

describe("footerHint", () => {
  test("prioritizes plan review actions", () => {
    expect(footerHint({ busy: false, planReview: "ready" })).toContain("approve & implement");
    expect(footerHint({ busy: false, planReview: "denying" })).toContain("revise plan");
  });
});
