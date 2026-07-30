/**
 * MCP servers describe their tools with JSON Schema. Passing that through to
 * the model is the whole point — without it the model has to guess argument
 * names — but the schemas arrive from third-party servers and are sent on to
 * a local model that may be strict about what it accepts. This normalizes
 * them: resolve internal references, drop meta keywords, and fall back to a
 * permissive shape only when a schema cannot be made self-contained.
 */

export type JsonObject = Record<string, unknown>;

export interface NormalizedSchema {
  schema: JsonObject;
  /** True when the real schema could not be preserved. */
  lossy: boolean;
}

const MAX_DEPTH = 12;

/** Keywords that describe the document rather than the value. */
const META_KEYS = ["$schema", "$id", "$anchor", "$comment"];

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function definitionsOf(root: JsonObject): JsonObject {
  const defs = root.$defs ?? root.definitions;
  return isObject(defs) ? defs : {};
}

/** Resolve `#/$defs/Name` and `#/definitions/Name` against the root document. */
function lookupRef(ref: string, root: JsonObject): unknown {
  const match = /^#\/(?:\$defs|definitions)\/(.+)$/.exec(ref);
  if (!match) return undefined;
  // A pointer may name a nested definition; walk it segment by segment.
  let current: unknown = definitionsOf(root);
  for (const raw of match[1]!.split("/")) {
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

class UnresolvableRef extends Error {}

function inline(node: unknown, root: JsonObject, depth: number, seen: Set<string>): unknown {
  if (depth > MAX_DEPTH) throw new UnresolvableRef("schema nested too deeply");
  if (Array.isArray(node)) return node.map((item) => inline(item, root, depth + 1, seen));
  if (!isObject(node)) return node;

  if (typeof node.$ref === "string") {
    const ref = node.$ref;
    if (seen.has(ref)) throw new UnresolvableRef(`recursive $ref: ${ref}`);
    const target = lookupRef(ref, root);
    if (!isObject(target)) throw new UnresolvableRef(`unresolvable $ref: ${ref}`);
    const next = new Set(seen);
    next.add(ref);
    // Sibling keywords alongside $ref override the target's.
    const { $ref: _dropped, ...siblings } = node;
    return inline({ ...target, ...siblings }, root, depth + 1, next);
  }

  const out: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (META_KEYS.includes(key)) continue;
    // Definitions are inlined at their use sites, so the containers go away.
    if (key === "$defs" || key === "definitions") continue;
    out[key] = inline(value, root, depth + 1, seen);
  }
  return out;
}

/** A schema that accepts anything, documenting the fields we know about. */
function permissive(properties: string[], reason: string): JsonObject {
  const known = properties.length
    ? ` Known argument names: ${properties.join(", ")}.`
    : "";
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
    description: `Arguments for this tool (${reason}).${known}`,
  };
}

export function normalizeMcpSchema(raw: unknown): NormalizedSchema {
  if (!isObject(raw)) {
    return { schema: permissive([], "the server published no schema"), lossy: true };
  }

  const names = isObject(raw.properties) ? Object.keys(raw.properties) : [];
  try {
    const inlined = inline(raw, raw, 0, new Set()) as JsonObject;
    const schema: JsonObject = {
      ...inlined,
      // The provider expects an object at the top level regardless of what the
      // server declared.
      type: "object",
      properties: isObject(inlined.properties) ? inlined.properties : {},
    };
    return { schema, lossy: false };
  } catch (err) {
    const reason = err instanceof UnresolvableRef ? err.message : "schema could not be normalized";
    return { schema: permissive(names, reason), lossy: true };
  }
}
