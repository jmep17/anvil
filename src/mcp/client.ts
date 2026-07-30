import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { jsonSchema, tool, type ToolSet } from "ai";
import type { McpServerConfig } from "../config/types.ts";
import { requirePermission, truncate, type ToolContext } from "../tools/types.ts";
import { normalizeMcpSchema } from "./schema.ts";

export interface McpHandle {
  name: string;
  client: Client;
  close: () => Promise<void>;
}

/** Tool-name characters the provider will accept. */
function safeName(server: string, toolName: string): string {
  return `mcp_${server}_${toolName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

interface McpAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  title?: string;
}

/**
 * A one-line description of the call for the approval prompt. MCP arguments
 * are free-form, so this shows the whole payload, clipped.
 */
function describeCall(toolName: string, args: unknown): string {
  let rendered: string;
  try {
    rendered = JSON.stringify(args ?? {});
  } catch {
    rendered = String(args);
  }
  const clipped = rendered.length > 160 ? `${rendered.slice(0, 159)}…` : rendered;
  return `${toolName} ${clipped}`;
}

export async function connectMcpServers(
  servers: Record<string, McpServerConfig>,
  onError?: (message: string) => void,
  ctx?: ToolContext,
): Promise<{ tools: ToolSet; handles: McpHandle[] }> {
  const tools: ToolSet = {};
  const handles: McpHandle[] = [];

  for (const [name, cfg] of Object.entries(servers)) {
    try {
      const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env: { ...process.env, ...cfg.env } as Record<string, string>,
      });
      const client = new Client({ name: `anvil-${name}`, version: "0.1.0" });
      await client.connect(transport);
      handles.push({
        name,
        client,
        close: async () => {
          await client.close();
        },
      });

      const listed = await client.listTools();
      for (const t of listed.tools) {
        const toolName = safeName(name, t.name);
        const annotations = (t.annotations ?? {}) as McpAnnotations;
        const readOnly = annotations.readOnlyHint === true;

        const { schema, lossy } = normalizeMcpSchema(t.inputSchema);
        if (lossy) {
          onError?.(
            `MCP tool "${toolName}" published a schema Anvil could not normalize; ` +
              `the model will be told argument names only.`,
          );
        }

        tools[toolName] = tool({
          description: `[MCP:${name}] ${t.description ?? t.name}`,
          // The server's own schema, so the model knows what to send instead of
          // guessing at an opaque bag of arguments.
          inputSchema: jsonSchema(schema),
          execute: async (args: unknown) => {
            // A read-only tool is treated like Read or Grep; anything that can
            // act on the world goes through the same approval path as Bash.
            if (ctx && !readOnly) {
              if (ctx.mode === "plan") {
                return `Error: ${toolName} may modify state and is disabled in plan mode.`;
              }
              const ok = await requirePermission(
                ctx,
                toolName,
                describeCall(t.name, args),
                undefined,
                toolName,
              );
              if (!ok) return `Error: permission denied for ${toolName}`;
            }

            const result = await client.callTool({
              name: t.name,
              arguments: (args ?? {}) as Record<string, unknown>,
            });
            return truncate(JSON.stringify(result.content ?? result, null, 2), ctx?.maxOutputChars);
          },
        });
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const message = `MCP server "${name}" unavailable: ${detail}`;
      onError?.(message);
      // Preserve a stderr diagnostic for REPL/one-shot invocations that do not
      // render agent events.
      if (!onError) console.error(`anvil: ${message}`);
    }
  }

  return { tools, handles };
}
