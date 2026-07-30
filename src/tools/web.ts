import { tool } from "ai";
import { z } from "zod";
import { truncate, type ToolContext } from "./types.ts";

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function createWebFetchTool(_ctx: ToolContext) {
  return tool({
    description:
      "Fetch a URL and return readable text content (HTML stripped). Use for documentation and error pages.",
    inputSchema: z.object({
      url: z.string().url().describe("URL to fetch"),
    }),
    execute: async ({ url }) => {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Anvil/0.1 (+local coding agent)",
            Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
          },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return `Error: HTTP ${res.status} fetching ${url}`;
        const ctype = res.headers.get("content-type") ?? "";
        const body = await res.text();
        if (ctype.includes("application/json")) {
          return truncate(body);
        }
        if (ctype.includes("text/plain") || ctype.includes("text/markdown")) {
          return truncate(body);
        }
        return truncate(htmlToText(body));
      } catch (err) {
        return `Error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createWebSearchTool(_ctx: ToolContext) {
  return tool({
    description:
      "Search the web via DuckDuckGo HTML results. Returns titles, URLs, and snippets for research and docs lookup.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      max_results: z.number().int().positive().max(10).optional(),
    }),
    execute: async ({ query, max_results }) => {
      const limit = max_results ?? 5;
      try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Anvil/0.1 (+local coding agent)",
          },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) return `Error: HTTP ${res.status} from DuckDuckGo`;
        const html = await res.text();
        const results: Array<{ title: string; href: string; snippet: string }> = [];
        const blockRe =
          /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td)> )?/gi;
        let match: RegExpExecArray | null;
        while ((match = blockRe.exec(html)) !== null && results.length < limit) {
          const href = match[1] ?? "";
          const title = htmlToText(match[2] ?? "");
          const snippet = htmlToText(match[3] ?? "");
          if (title && href) results.push({ title, href, snippet });
        }
        // Fallback simpler parse
        if (results.length === 0) {
          const simple =
            /uddg=([^&"]+)[\s\S]*?class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;
          while ((match = simple.exec(html)) !== null && results.length < limit) {
            results.push({
              href: decodeURIComponent(match[1] ?? ""),
              title: htmlToText(match[2] ?? ""),
              snippet: "",
            });
          }
        }
        if (results.length === 0) {
          return truncate(
            `No structured results parsed. Raw excerpt:\n${htmlToText(html).slice(0, 2000)}`,
          );
        }
        return results
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   ${r.href}${r.snippet ? `\n   ${r.snippet}` : ""}`,
          )
          .join("\n\n");
      } catch (err) {
        return `Error searching: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}
