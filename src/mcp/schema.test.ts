import { describe, expect, test } from "bun:test";
import { normalizeMcpSchema } from "./schema.ts";

describe("normalizeMcpSchema", () => {
  test("keeps a plain schema intact so the model sees the real arguments", () => {
    const raw = {
      type: "object",
      properties: {
        path: { type: "string", description: "File to read" },
        limit: { type: "number" },
      },
      required: ["path"],
    };
    const { schema, lossy } = normalizeMcpSchema(raw);

    expect(lossy).toBe(false);
    expect(schema.properties).toEqual(raw.properties);
    expect(schema.required).toEqual(["path"]);
  });

  test("strips meta keywords the provider does not need", () => {
    const { schema } = normalizeMcpSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "https://example.com/tool.json",
      $comment: "internal",
      type: "object",
      properties: { a: { type: "string" } },
    });

    expect(schema.$schema).toBeUndefined();
    expect(schema.$id).toBeUndefined();
    expect(schema.$comment).toBeUndefined();
    expect(schema.properties).toEqual({ a: { type: "string" } });
  });

  test("inlines internal references so the schema stands alone", () => {
    const { schema, lossy } = normalizeMcpSchema({
      type: "object",
      properties: { target: { $ref: "#/$defs/Target" } },
      $defs: { Target: { type: "string", enum: ["a", "b"] } },
    });

    expect(lossy).toBe(false);
    expect(schema.properties).toEqual({ target: { type: "string", enum: ["a", "b"] } });
    expect(schema.$defs).toBeUndefined();
  });

  test("supports the older definitions keyword and nested pointers", () => {
    const { schema, lossy } = normalizeMcpSchema({
      type: "object",
      properties: { mode: { $ref: "#/definitions/outer/inner" } },
      definitions: { outer: { inner: { type: "string" } } },
    });

    expect(lossy).toBe(false);
    expect(schema.properties).toEqual({ mode: { type: "string" } });
  });

  test("inlines references inside arrays and nested objects", () => {
    const { schema, lossy } = normalizeMcpSchema({
      type: "object",
      properties: {
        items: { type: "array", items: { $ref: "#/$defs/Item" } },
        choice: { anyOf: [{ $ref: "#/$defs/Item" }, { type: "null" }] },
      },
      $defs: { Item: { type: "object", properties: { id: { type: "string" } } } },
    });

    expect(lossy).toBe(false);
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.items!.items).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect((properties.choice!.anyOf as unknown[])[0]).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
    });
  });

  test("keywords beside a reference override the target", () => {
    const { schema } = normalizeMcpSchema({
      type: "object",
      properties: {
        name: { $ref: "#/$defs/Str", description: "overridden" },
      },
      $defs: { Str: { type: "string", description: "original" } },
    });

    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.name!.description).toBe("overridden");
    expect(properties.name!.type).toBe("string");
  });

  test("a recursive reference degrades instead of hanging", () => {
    const { schema, lossy } = normalizeMcpSchema({
      type: "object",
      properties: { node: { $ref: "#/$defs/Node" } },
      $defs: { Node: { type: "object", properties: { child: { $ref: "#/$defs/Node" } } } },
    });

    expect(lossy).toBe(true);
    expect(schema.additionalProperties).toBe(true);
    // The fallback still tells the model which arguments exist.
    expect(String(schema.description)).toContain("node");
  });

  test("an unresolvable reference degrades rather than shipping a dangling pointer", () => {
    const { schema, lossy } = normalizeMcpSchema({
      type: "object",
      properties: { thing: { $ref: "#/$defs/Missing" } },
    });

    expect(lossy).toBe(true);
    expect(String(schema.description)).toContain("thing");
  });

  test("an external reference is not silently trusted", () => {
    const { lossy } = normalizeMcpSchema({
      type: "object",
      properties: { thing: { $ref: "https://example.com/other.json#/X" } },
    });
    expect(lossy).toBe(true);
  });

  test("a missing or malformed schema still produces something callable", () => {
    for (const raw of [undefined, null, "nonsense", 42, []]) {
      const { schema, lossy } = normalizeMcpSchema(raw);
      expect(lossy).toBe(true);
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(true);
    }
  });

  test("a schema without properties still declares the object shape", () => {
    const { schema, lossy } = normalizeMcpSchema({ type: "object" });
    expect(lossy).toBe(false);
    expect(schema.properties).toEqual({});
  });
});
