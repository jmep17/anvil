import { memo } from "react";
import { extname } from "node:path";
import { colors, markdownParser } from "./theme.ts";

/** Tree-sitter language hint from a file extension. */
export function filetypeOf(path: string): string | undefined {
  const ext = extname(path).slice(1).toLowerCase();
  if (!ext) return undefined;
  const alias: Record<string, string> = {
    mjs: "javascript",
    cjs: "javascript",
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    md: "markdown",
    yml: "yaml",
    sh: "bash",
    py: "python",
    rs: "rust",
    go: "go",
  };
  return alias[ext] ?? ext;
}

/** Lines a diff will occupy once rendered, for height reservation. */
export function diffHeight(diff: string, max = 20): number {
  return Math.min(max, diff.split("\n").length);
}

/**
 * Unified diff with +/- backgrounds and syntax highlighting, via OpenTUI's
 * native diff renderable.
 */
export const DiffView = memo(function DiffView({
  diff,
  path,
  maxHeight = 20,
}: {
  diff: string;
  path?: string;
  maxHeight?: number;
}) {
  return (
    <box flexDirection="column" width="100%" flexShrink={0} height={diffHeight(diff, maxHeight)}>
      <diff
        diff={diff}
        view="unified"
        treeSitterClient={markdownParser()}
        filetype={path ? filetypeOf(path) : undefined}
        showLineNumbers
        wrapMode="none"
        width="100%"
        lineNumberFg={colors.faint}
        addedSignColor={colors.success}
        removedSignColor={colors.danger}
      />
    </box>
  );
});
