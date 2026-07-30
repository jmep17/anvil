import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";

export function resolveEditor(override?: string): string {
  if (override?.trim()) return override.trim();
  const fromEnv = process.env.VISUAL || process.env.EDITOR;
  if (fromEnv?.trim()) return fromEnv.trim();
  return "nvim";
}

/** Split editor command into binary + args (supports "nvim -b"). */
export function splitEditorCommand(cmd: string): { bin: string; args: string[] } {
  const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((p) => p.replace(/^"|"$/g, "")) ?? [
    cmd,
  ];
  return { bin: parts[0] || "nvim", args: parts.slice(1) };
}

export async function editInExternalEditor(
  text: string,
  opts: {
    editor?: string;
    suspendTerminal: (fn: () => Promise<void>) => Promise<void>;
  },
): Promise<string> {
  const path = join(tmpdir(), `anvil-prompt-${Date.now()}-${process.pid}.md`);
  await writeFile(path, text, "utf8");
  const { bin, args } = splitEditorCommand(resolveEditor(opts.editor));

  try {
    await opts.suspendTerminal(async () => {
      await execa(bin, [...args, path], { stdio: "inherit", reject: false });
    });
    const file = Bun.file(path);
    if (await file.exists()) {
      return await file.text();
    }
    return text;
  } finally {
    await unlink(path).catch(() => {});
  }
}
