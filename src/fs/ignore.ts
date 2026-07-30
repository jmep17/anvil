import ignore from "ignore";

/** Load .gitignore / .anvilignore plus common default excludes for cwd. */
export async function loadIgnore(cwd: string) {
  const ig = ignore();
  ig.add([".git", "node_modules", "dist", "build", ".next", "coverage"]);
  for (const name of [".gitignore", ".anvilignore"]) {
    const file = Bun.file(`${cwd}/${name}`);
    if (await file.exists()) {
      ig.add(await file.text());
    }
  }
  return ig;
}
