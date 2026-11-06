/**
 * `src-references [<pkg>]` — every committed reference to `packages/<pkg>/src`
 * (every package's, with no argument), as `file:line: text`. A package's RFC
 * 0223 PR is done when this prints nothing for it. The tasks repo is outside
 * this checkout's index, so its stories (history, not rewritten) never appear.
 *
 * Hard rules: no node:* imports, no process.* references, async fs only.
 */

import { execFile } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The extended regex `git grep` runs: `packages/<pkg>/src` as a whole segment. */
export function srcReferencePattern(pkg: string | null): string {
  const name = pkg === null ? "[a-z0-9-]+" : pkg.replace(/[.+-]/g, "\\$&");
  return `packages/${name}/src([/"'\`]|$)`;
}

export async function srcReferences(pkg: string | null, cwd = ROOT_DIR): Promise<string[]> {
  try {
    const { stdout } = await promisify(execFile)(
      "git",
      ["grep", "-n", "-I", "-E", srcReferencePattern(pkg), "--", ".", ":!packages/website/**"],
      { cwd, maxBuffer: 256 * 1024 * 1024 },
    );
    return stdout.split("\n").filter((line) => line !== "");
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
}

export async function main(args: readonly string[], cwd = ROOT_DIR): Promise<string> {
  const refs = await srcReferences(args[0] ?? null, cwd);
  return refs.length === 0 ? "src-references: none" : refs.join("\n");
}
