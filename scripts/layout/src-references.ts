/**
 * `src-references [<pkg>]` — every committed reference to `packages/<pkg>/src`
 * (every package's, with no argument), as `file:line: text`, plus every bare
 * `<pkg>/src/` citation in a markdown file outside `vendor/` and
 * `node_modules/`. A package's RFC 0223 PR is done when this prints nothing
 * for it. The tasks repo is outside this checkout's index, so its stories
 * (history, not rewritten) never appear.
 *
 * Hard rules: no node:* imports, no process.* references, async fs only.
 */

import { execFile } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function packageNamePattern(pkg: string | null): string {
  return pkg === null ? "[a-z0-9-]+" : pkg.replace(/[.+-]/g, "\\$&");
}

/** The extended regex `git grep` runs: `packages/<pkg>/src` as a whole segment. */
export function srcReferencePattern(pkg: string | null): string {
  return `packages/${packageNamePattern(pkg)}/src([/"'\`]|$)`;
}

/** The extended regex run over markdown: a bare `<pkg>/src/` citation. */
export function markdownSrcReferencePattern(pkg: string | null): string {
  return `(^|[^a-z0-9/-])${packageNamePattern(pkg)}/src/`;
}

async function gitGrep(pattern: string, pathspec: string[], cwd: string): Promise<string[]> {
  try {
    const { stdout } = await promisify(execFile)(
      "git",
      ["grep", "-n", "-I", "-E", pattern, "--", ...pathspec],
      { cwd, maxBuffer: 256 * 1024 * 1024 },
    );
    return stdout.split("\n").filter((line) => line !== "");
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
}

export async function srcReferences(pkg: string | null, cwd = ROOT_DIR): Promise<string[]> {
  const refs = await gitGrep(srcReferencePattern(pkg), [".", ":!packages/website/**"], cwd);
  const markdown = await gitGrep(
    markdownSrcReferencePattern(pkg),
    ["*.md", ":!vendor/**", ":!**/node_modules/**", ":!packages/website/**"],
    cwd,
  );
  return [...new Set([...refs, ...markdown])].sort();
}

export async function main(args: readonly string[], cwd = ROOT_DIR): Promise<string> {
  const refs = await srcReferences(args[0] ?? null, cwd);
  return refs.length === 0 ? "src-references: none" : refs.join("\n");
}
