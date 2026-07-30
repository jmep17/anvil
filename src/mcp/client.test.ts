import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SkillInfo } from "../skills/types.ts";
import type { PermissionDecision, ToolContext } from "../tools/types.ts";
import { connectMcpServers, type McpHandle } from "./client.ts";

/**
 * A minimal stdio MCP server. Exercising the real transport is the only way to
 * know the published schema survives the trip to a registered tool.
 */
const SERVER = `
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\\n");
let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1.0.0" },
      }});
    } else if (msg.method === "tools/list") {
      send({ jsonrpc: "2.0", id: msg.id, result: { tools: [
        {
          name: "lookup",
          description: "Look a record up by id",
          inputSchema: {
            type: "object",
            properties: {
              recordId: { type: "string", description: "The record to fetch" },
              verbose: { type: "boolean" },
            },
            required: ["recordId"],
          },
          annotations: { readOnlyHint: true },
        },
        {
          name: "erase",
          description: "Delete a record",
          inputSchema: {
            type: "object",
            properties: { recordId: { type: "string" } },
            required: ["recordId"],
          },
          annotations: { readOnlyHint: false, destructiveHint: true },
        },
      ]}});
    } else if (msg.method === "tools/call") {
      send({ jsonrpc: "2.0", id: msg.id, result: {
        content: [{ type: "text", text: "called " + msg.params.name + " with " + JSON.stringify(msg.params.arguments) }],
      }});
    } else if (msg.id !== undefined) {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  }
});
`;

const execOpts = {
  toolCallId: "1",
  messages: [] as never[],
  abortSignal: new AbortController().signal,
  context: {},
};

let dir = "";
let serverPath = "";
const openHandles: McpHandle[] = [];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "anvil-mcp-"));
  serverPath = join(dir, "server.mjs");
  await writeFile(serverPath, SERVER);
});

afterAll(async () => {
  for (const handle of openHandles) await handle.close().catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

function ctxWith(
  decision: PermissionDecision,
  onAsk?: (tool: string, detail: string) => void,
  mode: ToolContext["mode"] = "build",
): ToolContext {
  return {
    cwd: dir,
    mode,
    alwaysAllowed: new Set<string>(),
    askPermission: async (toolName, detail) => {
      onAsk?.(toolName, detail);
      return decision;
    },
    todos: [],
    runSubagent: async () => "ok",
    getSkillContent: async () => null,
    listSkills: async () => [] as SkillInfo[],
  };
}

async function connect(ctx?: ToolContext) {
  const result = await connectMcpServers(
    { fixture: { command: process.execPath, args: [serverPath] } },
    undefined,
    ctx,
  );
  openHandles.push(...result.handles);
  return result;
}

describe("MCP tools", () => {
  test("register with the server's own schema, not an opaque bag", async () => {
    const { tools } = await connect(ctxWith("allow"));
    const lookup = tools.mcp_fixture_lookup;
    expect(lookup).toBeDefined();

    const schema = (lookup!.inputSchema as { jsonSchema: Record<string, unknown> }).jsonSchema;
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties as object).sort()).toEqual(["recordId", "verbose"]);
    expect(schema.required).toEqual(["recordId"]);
    // The old registration hid everything behind a single `arguments` field.
    expect(Object.keys(schema.properties as object)).not.toContain("arguments");
  });

  test("arguments reach the server at the top level", async () => {
    const { tools } = await connect(ctxWith("allow"));
    const out = String(
      await tools.mcp_fixture_lookup!.execute!({ recordId: "r-1", verbose: true }, execOpts),
    );
    expect(out).toContain("called lookup");
    expect(out).toContain("r-1");
  });

  test("a read-only tool runs without an approval prompt", async () => {
    let asked = 0;
    const { tools } = await connect(ctxWith("allow", () => void (asked += 1)));
    await tools.mcp_fixture_lookup!.execute!({ recordId: "r-1" }, execOpts);
    expect(asked).toBe(0);
  });

  test("a tool that can change things asks first", async () => {
    const seen: string[] = [];
    const { tools } = await connect(ctxWith("allow", (_t, detail) => seen.push(detail)));
    const out = String(await tools.mcp_fixture_erase!.execute!({ recordId: "r-9" }, execOpts));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("erase");
    expect(seen[0]).toContain("r-9");
    expect(out).toContain("called erase");
  });

  test("denying an MCP call stops it reaching the server", async () => {
    const { tools } = await connect(ctxWith("deny"));
    const out = String(await tools.mcp_fixture_erase!.execute!({ recordId: "r-9" }, execOpts));
    expect(out).toContain("permission denied");
    expect(out).not.toContain("called erase");
  });

  test("plan mode blocks a state-changing MCP tool but not a read-only one", async () => {
    const { tools } = await connect(ctxWith("allow", undefined, "plan"));

    const blocked = String(await tools.mcp_fixture_erase!.execute!({ recordId: "r" }, execOpts));
    expect(blocked).toContain("disabled in plan mode");

    const allowed = String(await tools.mcp_fixture_lookup!.execute!({ recordId: "r" }, execOpts));
    expect(allowed).toContain("called lookup");
  });
});
