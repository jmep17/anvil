import { describe, expect, test } from "bun:test";
import { errorMessage } from "./loop.ts";

describe("errorMessage", () => {
  test("includes a nested provider response body", () => {
    const error = Object.assign(new Error("Bad Request"), {
      lastError: Object.assign(new Error("provider"), {
        responseBody: '{"error":{"message":"unsupported schema"}}',
      }),
    });
    expect(errorMessage(error)).toContain("unsupported schema");
  });
});
