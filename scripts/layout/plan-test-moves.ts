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
 * `test/support/`. One a library file imports stays put and is flagged. A test
 * file inside such a directory is still placed by rules 1-3.
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
import { LIB_TEST_PACKAGES } from "./package-roots.mjs";
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
  /** Each non-`.ts` file under `libDir` to the files there naming it by a relative path. */
  assetRefs?: ReadonlyMap<string, readonly string[]>;
  /** The directories directly under the gem's own `test/` (`jobs`, `adapters`). */
  railsTestDirs?: ReadonlySet<string>;
}

export interface Plan {
  /** Package-root-relative `[old, new]`, sorted by old. */
  moves: [string, string][];
  /** Support files a library file imports: left in place, a layering finding. */
  flagged: string[];
  /** New paths two files would both land on. */
  collisions: string[];
}

function supportHome(file: string, railsTestDirs: ReadonlySet<string> = new Set()): string | null {
  const parts = file.split("/");
  const at = parts.findIndex((p, i) => i < parts.length - 1 && SUPPORT_DIRS.has(p));
  if (at < 0) return null;
  const rest = parts.slice(at + 1);
  if (rest.length > 1 && (RAILS_SUPPORT_DIRS.has(rest[0]) || railsTestDirs.has(rest[0]))) {
    return `test/${rest.join("/")}`;
  }
  if (rest.length === 1 && rest[0] === "helper.ts") return "test/helper.ts";
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
  const prefixOf = (cp: ComparedPackage): string =>
    PKG_SRC_DIRS[cp.package] ?? `packages/${cp.package}/src/`;
  const ordered = [...input.comparison].sort((a, b) => prefixOf(b).length - prefixOf(a).length);
  for (const cp of ordered) {
    const prefix = prefixOf(cp);
    const pkgPrefix = prefix.match(new RegExp(`^packages/${pkg}/(?:src|lib)/`))?.[0];
    if (pkgPrefix === undefined) continue;
    const within = prefix.slice(pkgPrefix.length);
    for (const f of cp.files) {
      if (!f.tsFileExists || f.conventionTsPackage || f.rubyFile.startsWith("../")) continue;
      const old = within + f.conventionTsFile;
      if (!present.has(old) || placed.has(old)) continue;
      placed.set(old, `test/${within}${RUBY_FILE_ROOT[cp.package] ?? ""}${f.conventionTsFile}`);
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
    const home = supportHome(file, input.railsTestDirs);
    if (home !== null && !isTestFile(file)) {
      if (input.libImported.has(file)) flagged.push(`${libDir}/${file}`);
      else placed.set(file, home);
    } else if (isTestFile(file)) {
      placed.set(file, `test/${MAIN_TEST_DIR[pkg] ?? ""}${file}`);
    }
  }
  for (const [asset, refs] of input.assetRefs ?? []) {
    if (refs.length === 0) continue;
    const dirs = new Set(
      refs.map((ref) => (placed.has(ref) ? path.posix.dirname(placed.get(ref)!) : null)),
    );
    const [dir] = dirs;
    if (dirs.size !== 1 || dir == null) {
      flagged.push(`${libDir}/${asset}`);
      continue;
    }
    const from = path.posix.relative(path.posix.dirname(refs[0]), asset);
    placed.set(asset, path.posix.normalize(path.posix.join(dir, from)));
  }
  const moves = [...placed]
    .map(([old, to]): [string, string] => [`${libDir}/${old}`, to])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const seen = new Map<string, number>();
  for (const [, to] of moves) seen.set(to, (seen.get(to) ?? 0) + 1);
  const collisions = [...seen].filter(([, n]) => n > 1).map(([to]) => to);
  return { moves, flagged: flagged.sort(), collisions: collisions.sort() };
}

const SPECIFIER_RE =
  /(\bfrom\s*|\bimport\s*\(?\s*|\bdeclare\s+module\s+|\bvi\.(?:mock|doMock|doUnmock|importActual)\s*(?:<[^>]*>)?\(\s*)(["'])(\.{1,2}\/[^"'\n]*)\2/g;

/**
 * Rewrites each relative module specifier in `source`, a file moving from
 * `from` to `to` (package-root-relative), so it names the same target after
 * the move, `moved` (old path to new path) included.
 */
export function rewriteSpecifiers(
  source: string,
  from: string,
  to: string,
  moved: ReadonlyMap<string, string>,
): string {
  return source.replace(SPECIFIER_RE, (whole, lead: string, quote: string, spec: string) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    const ts = target.replace(/\.js$/, ".ts");
    const dest = moved.has(ts)
      ? moved.get(ts)!.replace(/\.ts$/, path.posix.extname(target))
      : target;
    let rel = path.posix.relative(path.posix.dirname(to), dest);
    if (!rel.startsWith(".")) rel = `./${rel}`;
    if (spec.endsWith("/") && !rel.endsWith("/")) rel += "/";
    return rel === spec ? whole : `${lead}${quote}${rel}${quote}`;
  });
}

/** Adds `pkg` to the `LIB_TEST_PACKAGES` set literal in `source`, sorted. */
export function registerLibTestPackage(source: string, pkg: string): string {
  return source.replace(
    /(LIB_TEST_PACKAGES: ReadonlySet<string> = new Set<string>\(\[)([^\]]*)(\]\))/,
    (_, open: string, body: string, close: string) => {
      const names = new Set([...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
      names.add(pkg);
      return `${open}\n${[...names]
        .sort()
        .map((n) => `  "${n}",\n`)
        .join("")}${close}`;
    },
  );
}

/** Each non-`.ts` committed file under `libPath` to the `.ts` files naming it by a relative path. */
async function assetReferences(
  libPath: string,
  files: readonly string[],
): Promise<Map<string, string[]>> {
  const { stdout } = await promisify(execFile)("git", ["ls-files"], { cwd: libPath });
  const assets = stdout.split("\n").filter((f) => f !== "" && !f.endsWith(".ts"));
  const refs = new Map(assets.map((a): [string, string[]] => [a, []]));
  for (const file of files) {
    const source = await fs.readFile(path.join(libPath, file), "utf-8");
    for (const [, spec] of source.matchAll(/["'`](\.{1,2}\/[^"'`\n$]+)["'`]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      if (refs.has(target)) refs.get(target)!.push(file);
    }
  }
  return refs;
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

/** The directories under `vendor/rails/v8.0.2/<gem>/test/`, empty for a non-Rails gem. */
async function railsTestDirs(pkg: string, cwd: string): Promise<Set<string>> {
  const entries = await fs
    .readdir(path.join(cwd, "vendor/rails/v8.0.2", pkg, "test"), { withFileTypes: true })
    .catch(() => []);
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
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
    assetRefs: await assetReferences(libPath, files),
    railsTestDirs: await railsTestDirs(pkg, cwd),
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
    const moved = new Map(plan.moves);
    for (const [from, to] of plan.moves) {
      if (!to.endsWith(".ts")) continue;
      const file = path.join(pkgDir, to);
      const source = await fs.readFile(file, "utf-8");
      const rewritten = rewriteSpecifiers(source, from, to, moved);
      if (rewritten !== source) await fs.writeFile(file, rewritten);
    }
    const roots = path.join(cwd, "scripts/layout/package-roots.mts");
    await fs.writeFile(roots, registerLibTestPackage(await fs.readFile(roots, "utf-8"), pkg));
  }
  return [
    ...plan.moves.map(([from, to]) => `${from} → ${to}`),
    ...plan.flagged.map((f) => `FLAGGED (library imports it, left in place): ${f}`),
  ].join("\n");
}
