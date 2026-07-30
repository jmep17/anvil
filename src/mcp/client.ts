import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { McpServerConfig } from "../config/types.ts";
import { truncate } from "../tools/types.ts";

export interface McpHandle {
  name: string;
  client: Client;
  close: () => Promise<void>;
}

export async function connectMcpServers(
  servers: Record<string, McpServerConfig>,
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
        const toolName = `mcp_${name}_${t.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        tools[toolName] = tool({
          description: `[MCP:${name}] ${t.description ?? t.name}`,
          inputSchema: z.object({
            arguments: z
              .record(z.string(), z.unknown())
              .optional()
              .describe("Arguments for the MCP tool"),
          }),
          execute: async ({ arguments: args }) => {
            const result = await client.callTool({
              name: t.name,
              arguments: args ?? {},
            });
            return truncate(JSON.stringify(result.content ?? result, null, 2));
          },
        });
      }
    } catch (err) {
      console.error(
        `anvil: failed to connect MCP server "${name}":`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { tools, handles };
}
