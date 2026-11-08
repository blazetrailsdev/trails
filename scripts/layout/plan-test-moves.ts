/**
 * `plan-test-moves <pkg> [--apply]` — the `old → new` table RFC 0223's package
 * PRs apply, by the RFC's "Where a test lands" rules:
 *
 * 1. A test file test-compare name-matches to a Rails test file goes to the
 *    path test-compare looks for it at: its `conventionTsFile` under `test/`.
 * 2. A `*.trails.test.ts` beside a rule-1 file lands beside its new home.
 * 3. Any other test lands under the gem's main test directory at its `lib/`
 *    path.
 *
 * Test-only support files (under `test-helpers/`, `support/`, `test-setup/`,
 * `__fixtures__/`) go to the gem's matching Rails directory, else
 * `test/support/`. One a library file imports stays put and is flagged.
 *
 * Reads `scripts/test-compare/output/convention-comparison.json`, which a full
 * `pnpm parity:test -- --json` writes.
 *
 * Hard rules: no node:* imports, no process.* references, async fs only.
 */

import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { PKG_SRC_DIRS } from "../test-compare/compare.js";
import { moduleSpecifiers } from "../ruby-compat-leaf.js";
import { LIB_TEST_PACKAGES } from "./package-roots.js";
import { COMMITTED_TS_FILES, walkTsFiles } from "../api-compare/ts-file-walk.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const COMPARISON_JSON = path.join(
  ROOT_DIR,
  "scripts/test-compare/output/convention-comparison.json",
);

/** The directory under the gem's `test/` that test-compare reports a compare
 *  package's Ruby test files relative to. */
const RUBY_FILE_ROOT: Record<string, string> = { activerecord: "cases/" };

/** The gem's main test directory, under `test/`, for rule 3. */
const MAIN_TEST_DIR: Record<string, string> = { activerecord: "cases/", activejob: "cases/" };

const SUPPORT_DIRS = new Set(["test-helpers", "support", "test-setup", "__fixtures__"]);
const RAILS_SUPPORT_DIRS = new Set([
  "models",
  "fixtures",
  "schema",
  "support",
  "migrations",
  "assets",
]);

export interface ComparedFile {
  rubyFile: string;
  conventionTsFile: string;
  conventionTsPackage?: string;
  tsFileExists: boolean;
}

export interface ComparedPackage {
  package: string;
  files: ComparedFile[];
}

export interface PlanInput {
  pkg: string;
  /** `src` before the rename commit, `lib` after it. */
  libDir: string;
  /** Every committed `.ts` under `libDir`, relative to it. */
  files: readonly string[];
  /** Files (relative to `libDir`) a non-test library file imports. */
  libImported: ReadonlySet<string>;
  comparison: readonly ComparedPackage[];
}

export interface Plan {
  /** Package-root-relative `[old, new]`, sorted by old. */
  moves: [string, string][];
  /** Support files a library file imports: left in place, a layering finding. */
  flagged: string[];
  /** New paths two files would both land on. */
  collisions: string[];
}

function supportHome(file: string): string | null {
  const parts = file.split("/");
  const at = parts.findIndex((p, i) => i < parts.length - 1 && SUPPORT_DIRS.has(p));
  if (at < 0) return null;
  const rest = parts.slice(at + 1);
  if (rest.length > 1 && RAILS_SUPPORT_DIRS.has(rest[0])) return `test/${rest.join("/")}`;
  if (parts[at] === "__fixtures__") return `test/fixtures/${rest.join("/")}`;
  return `test/support/${rest.join("/")}`;
}

/** A test, or a shared test-behavior module (the twin of Rails'
 *  `test/**\/behaviors/*_behavior.rb`, which test-compare counts as a test). */
function isTestFile(file: string): boolean {
  return file.endsWith(".test.ts") || /(^|\/)behaviors\/[^/]+-behavior\.ts$/.test(file);
}

export function planTestMoves(input: PlanInput): Plan {
  const { pkg, libDir, files } = input;
  const present = new Set(files);
  const placed = new Map<string, string>();
  for (const cp of input.comparison) {
    const prefix = PKG_SRC_DIRS[cp.package] ?? `packages/${cp.package}/src/`;
    const pkgPrefix = `packages/${pkg}/src/`;
    if (!prefix.startsWith(pkgPrefix)) continue;
    const within = prefix.slice(pkgPrefix.length);
    for (const f of cp.files) {
      if (!f.tsFileExists || f.conventionTsPackage || f.rubyFile.startsWith("../")) continue;
      const old = within + f.conventionTsFile;
      if (!present.has(old) || placed.has(old)) continue;
      placed.set(old, `test/${RUBY_FILE_ROOT[cp.package] ?? ""}${f.conventionTsFile}`);
    }
  }
  for (const [old, to] of [...placed]) {
    const sibling = old.replace(/\.test\.ts$/, ".trails.test.ts");
    if (sibling !== old && present.has(sibling) && !placed.has(sibling)) {
      placed.set(sibling, to.replace(/\.test\.ts$/, ".trails.test.ts"));
    }
  }
  const flagged: string[] = [];
  for (const file of files) {
    if (placed.has(file)) continue;
    const home = supportHome(file);
    if (home !== null && !isTestFile(file)) {
      if (input.libImported.has(file)) flagged.push(`${libDir}/${file}`);
      else placed.set(file, home);
    } else if (isTestFile(file)) {
      placed.set(file, home ?? `test/${MAIN_TEST_DIR[pkg] ?? ""}${file}`);
    }
  }
  const moves = [...placed]
    .map(([old, to]): [string, string] => [`${libDir}/${old}`, to])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const seen = new Map<string, number>();
  for (const [, to] of moves) seen.set(to, (seen.get(to) ?? 0) + 1);
  const collisions = [...seen].filter(([, n]) => n > 1).map(([to]) => to);
  return { moves, flagged: flagged.sort(), collisions: collisions.sort() };
}

/** Files under `libDir` that a non-test file there imports by relative specifier. */
async function libImportedFiles(libPath: string, files: readonly string[]): Promise<Set<string>> {
  const present = new Set(files);
  const imported = new Set<string>();
  for (const file of files) {
    if (isTestFile(file) || supportHome(file) !== null) continue;
    const source = await fs.readFile(path.join(libPath, file), "utf-8");
    for (const { specifier } of moduleSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const target = path.posix
        .normalize(path.posix.join(path.posix.dirname(file), specifier))
        .replace(/\.js$/, ".ts");
      if (present.has(target)) imported.add(target);
    }
  }
  return imported;
}

export async function main(args: readonly string[], cwd = ROOT_DIR): Promise<string> {
  const pkg = args.find((a) => !a.startsWith("--"));
  if (!pkg) throw new Error("usage: plan-test-moves <pkg> [--apply]");
  if (LIB_TEST_PACKAGES.has(pkg)) {
    throw new Error(
      `plan-test-moves: ${pkg} is already in LIB_TEST_PACKAGES; its tests have moved.`,
    );
  }
  const pkgDir = path.join(cwd, "packages", pkg);
  const libDir = await fs.stat(path.join(pkgDir, "lib")).then(
    () => "lib",
    () => "src",
  );
  const libPath = path.join(pkgDir, libDir);
  const files = (await walkTsFiles(libPath, COMMITTED_TS_FILES)).map((f) =>
    path.relative(libPath, f),
  );
  const comparison = JSON.parse(await fs.readFile(COMPARISON_JSON, "utf-8")) as {
    results: ComparedPackage[];
  };
  const plan = planTestMoves({
    pkg,
    libDir,
    files,
    libImported: await libImportedFiles(libPath, files),
    comparison: comparison.results,
  });
  if (plan.collisions.length > 0) {
    throw new Error(`plan-test-moves: two files land on:\n  ${plan.collisions.join("\n  ")}`);
  }
  if (args.includes("--apply")) {
    const git = promisify(execFile);
    for (const [from, to] of plan.moves) {
      await fs.mkdir(path.dirname(path.join(pkgDir, to)), { recursive: true });
      await git("git", ["mv", from, to], { cwd: pkgDir });
    }
  }
  return [
    ...plan.moves.map(([from, to]) => `${from} → ${to}`),
    ...plan.flagged.map((f) => `FLAGGED (library imports it, left in place): ${f}`),
  ].join("\n");
}
