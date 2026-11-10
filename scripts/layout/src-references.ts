/**
 * `src-references [<pkg>]` — every committed reference to `packages/<pkg>/src`
 * or `../<pkg>/src` (every package's, with no argument), plus every bare
 * `<pkg>/src/` citation in a markdown file outside `vendor/` and
 * `node_modules/`, as `file:line: text`; then each `src/` path a package's own
 * `package.json` or `bin/` names; then the generic resolvers that build a
 * `<pkg>/src/` path from no package name. A package's RFC 0223 PR is done when
 * this prints nothing for it. The tasks repo is outside this checkout's index,
 * so its stories (history, not rewritten) never appear.
 *
 * Hard rules: no node:* imports, no process.* references, async fs only.
 */

import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function packageNamePattern(pkg: string | null): string {
  return pkg === null ? "[a-z0-9-]+" : pkg.replace(/[.+-]/g, "\\$&");
}

/** The extended regex `git grep` runs: `packages/<pkg>/src` or `../<pkg>/src` as a whole segment. */
export function srcReferencePattern(pkg: string | null): string {
  return `(packages|\\.\\.)/${packageNamePattern(pkg)}/src([/"'\`]|$)`;
}

/** The extended regex run over markdown: a bare `<pkg>/src/` citation. */
export function markdownSrcReferencePattern(pkg: string | null): string {
  return `(^|[^a-z0-9/-])${packageNamePattern(pkg)}/src/`;
}

/** Extended regexes (`git grep` and JS alike) for a resolver that builds `<pkg>/src/` generically. */
export const GENERIC_RESOLVER_PATTERNS: readonly string[] = [
  "/\\$\\{[^}]*\\}/src/",
  "replace\\(.*dist.*src",
  "packages\\\\/.*\\\\/src",
];

/** A `src/` path segment a package's own `package.json` or `bin/` file names relative to itself. */
export const LOCAL_SRC_RE = /(^|[^A-Za-z0-9_./-])(\.\/)?src\//;

/** `file:line: text` for each line of `text` naming a package-local `src/` path. */
export function localSrcReferences(file: string, text: string): string[] {
  return text
    .split("\n")
    .flatMap((line, i) => (LOCAL_SRC_RE.test(line) ? [`${file}:${i + 1}:${line}`] : []));
}

async function gitGrep(args: readonly string[], cwd: string): Promise<string[]> {
  try {
    const { stdout } = await promisify(execFile)("git", ["grep", "-n", "-I", ...args], {
      cwd,
      maxBuffer: 256 * 1024 * 1024,
    });
    return stdout.split("\n").filter((line) => line !== "");
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
}

export async function srcReferences(pkg: string | null, cwd = ROOT_DIR): Promise<string[]> {
  const refs = await gitGrep(
    ["-E", srcReferencePattern(pkg), "--", ".", ":!packages/website/**"],
    cwd,
  );
  const markdown = await gitGrep(
    [
      "-E",
      markdownSrcReferencePattern(pkg),
      "--",
      "*.md",
      ":!vendor/**",
      ":!**/node_modules/**",
      ":!packages/website/**",
    ],
    cwd,
  );
  return [...new Set([...refs, ...markdown])].sort();
}

export async function packageLocalSrcReferences(
  pkg: string | null,
  cwd = ROOT_DIR,
): Promise<string[]> {
  const pkgs = pkg === null ? await fs.readdir(path.join(cwd, "packages")) : [pkg];
  const out: string[] = [];
  for (const name of pkgs.sort()) {
    const { stdout } = await promisify(execFile)(
      "git",
      ["ls-files", "--", `packages/${name}/package.json`, `packages/${name}/bin`],
      { cwd },
    );
    for (const file of stdout.split("\n").filter((f) => f !== "")) {
      out.push(...localSrcReferences(file, await fs.readFile(path.join(cwd, file), "utf-8")));
    }
  }
  return out;
}

export function genericResolvers(cwd = ROOT_DIR): Promise<string[]> {
  return gitGrep(
    [
      "-E",
      ...GENERIC_RESOLVER_PATTERNS.flatMap((p) => ["-e", p]),
      "--",
      ".",
      ":!packages/website/**",
      ":!scripts/layout/src-references*",
    ],
    cwd,
  );
}

export async function main(args: readonly string[], cwd = ROOT_DIR): Promise<string> {
  const pkg = args[0] ?? null;
  const refs = await srcReferences(pkg, cwd);
  const local = await packageLocalSrcReferences(pkg, cwd);
  const generic = await genericResolvers(cwd);
  if (refs.length + local.length + generic.length === 0) return "src-references: none";
  return [
    ...refs,
    ...(local.length > 0 ? ["", "package-local src/ paths:", ...local] : []),
    ...(generic.length > 0 ? ["", "generic resolvers:", ...generic] : []),
  ].join("\n");
}
