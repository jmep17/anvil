import { tool } from "ai";
import { z } from "zod";
import { resolvePath, truncate, type ToolContext } from "./types.ts";

/**
 * Lines returned when the model does not ask for a range. Without a cap, one
 * read of a large file can fill most of the context window, and every model
 * call after it then carries that weight — which is felt as the agent grinding
 * to a halt rather than as a single slow tool.
 */
export const DEFAULT_LINE_LIMIT = 2_000;

/** Longest single line kept intact. Guards against minified files. */
export const MAX_LINE_CHARS = 2_000;

function clipLine(line: string): string {
  if (line.length <= MAX_LINE_CHARS) return line;
  return `${line.slice(0, MAX_LINE_CHARS)}… (+${line.length - MAX_LINE_CHARS} chars)`;
}

export interface ReadRender {
  text: string;
  /** Lines actually returned. */
  shown: number;
  total: number;
}

/** Number the requested window and say what was left out. */
export function renderFile(
  content: string,
  options: { offset?: number; limit?: number } = {},
): ReadRender {
  const lines = content.split("\n");
  // A trailing newline terminates the last line rather than adding an empty one.
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();

  const total = content === "" ? 0 : lines.length;
  const start = Math.max(0, (options.offset ?? 1) - 1);
  const limit = options.limit ?? DEFAULT_LINE_LIMIT;
  const end = Math.min(total, start + limit);
  const slice = lines.slice(start, end);

  if (slice.length === 0) {
    return {
      text:
        total === 0
          ? "(empty file)"
          : `(no lines in range; the file has ${total} line${total === 1 ? "" : "s"})`,
      shown: 0,
      total,
    };
  }

  const numbered = slice
    .map((line, i) => `${String(start + i + 1).padStart(6)}|${clipLine(line)}`)
    .join("\n");

  const remaining = total - end;
  const notice =
    remaining > 0
      ? `\n\n… showing lines ${start + 1}-${end} of ${total}. Read again with offset=${end + 1} for the rest.`
      : "";

  return { text: `${numbered}${notice}`, shown: slice.length, total };
}

export function createReadTool(ctx: ToolContext) {
  return tool({
    description:
      "Read a file from the filesystem. Prefer absolute or cwd-relative paths. " +
      `Returns up to ${DEFAULT_LINE_LIMIT} lines at a time; use offset and limit ` +
      "(1-indexed) to move through a longer file rather than raising the limit.",
    inputSchema: z.object({
      path: z.string().describe("File path to read"),
      offset: z.number().int().positive().optional().describe("Start line (1-indexed)"),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(`Max lines to return (default ${DEFAULT_LINE_LIMIT})`),
    }),
    execute: async ({ path, offset, limit }) => {
      const abs = resolvePath(ctx.cwd, path);
      const file = Bun.file(abs);
      if (!(await file.exists())) {
        return `Error: file not found: ${abs}`;
      }
      const { text } = renderFile(await file.text(), { offset, limit });
      return truncate(text, ctx.maxOutputChars);
    },
  });
}
