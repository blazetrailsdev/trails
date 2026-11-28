#!/usr/bin/env npx tsx
/**
 * Report-only (RFC 0156): a matched pair whose port returns `void` /
 * `Promise<void>` where some Rails caller reads the return value.
 * `ConnectionHandling#establish_connection` returning the pool
 * (`connection_handling.rb:50-54`), read as `pool = …establish_connection(…)`
 * at `migration/pending_migration_connection.rb:6`, is the shape.
 *
 *   pnpm parity:api:returns                      # every row
 *   pnpm parity:api:returns --sample=40          # a reproducible audit sample
 *
 * Every Ruby method returns something, and the Rails body's own final
 * expression says nothing about whether anyone uses it: filtering on it
 * reported 712 rows of which a hand audit found none real. So the Ruby half is
 * the CALLERS: `extract-return-uses.rb` walks the package's Rails lib and test
 * trees for a call read as an assignment RHS, a call argument (`assert_equal
 * true, assert_not(nil)`) or a chained receiver, keyed by method name within
 * the package. A setter (`x=`) and `initialize` are left out. The TS half is
 * `returnsVoid` (`extract-ts-api.ts#signatureReturnsVoid`).
 *
 * Two rules keep a read off its homonyms. A receiverless read in a file that
 * defines the name is that definition's alone (`fixture_set/file.rb:55` calling
 * its own `validate` is no read of `Migrator#validate`), and a read through a
 * receiver is no read of a method Rails declares private.
 *
 * The population is the skeleton artifact's pairs: every compared pair with a
 * body on both sides. A Ruby name defined twice in one file answers with its
 * first definition, as compare.ts' first-sighting maps do.
 *
 * `--gate` (RFC 0260) is the half that needs no caller: a pair whose Rails
 * method answers its block's value (`returnsBlock`, extract-ruby-api.rb
 * `returns_block?`) and whose port returns void. `with_lock`
 * (`locking/pessimistic.rb:92-99`) is the shape; no Rails file reads its
 * value, so the report above never finds it. Each package's count is held to
 * returns-block-mark.json, only-shrink: `--tighten` writes it DOWN, and a
 * package with no mark is held to zero.
 *
 *   pnpm parity:api:returns --gate               # gate (CI)
 *   pnpm parity:api:returns --gate --tighten     # narrow marks
 *
 * Run `pnpm parity:api --calls` first so output/call-skeletons.json is fresh.
 */
import * as path from "path";
import { execFile } from "child_process";
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { libPathsManifest, testPathsManifest } from "../../vendor/sources.js";
import { OUTPUT_DIR, ROOT_DIR, SCRIPT_DIR } from "./config.js";
import { section, tally } from "./lint-call-mismatches.js";
import { serializeBaseline } from "./baseline-json.js";
import { exceedances, staleMarks, tightened } from "./lint-ambiguous-parents.js";
import { scopeOf, scopedMarks } from "./scope.js";
import type { SkeletonArtifact, SkeletonRow } from "./report-arms.js";
import type { MethodInfo } from "@blazetrails/parity/types";

interface OwnerInfo {
  instanceMethods?: MethodInfo[];
  classMethods?: MethodInfo[];
}

interface ApiPackage {
  classes?: Record<string, OwnerInfo>;
  modules?: Record<string, OwnerInfo>;
  fileFunctions?: Record<string, MethodInfo[]>;
}

export interface ApiManifest {
  packages: Record<string, ApiPackage>;
}

/** The Rails reads attributed to one method: how many, and the first. */
export interface ReturnUse {
  count: number;
  site: string;
}

/** One read: the Rails file and line, and whether the call is receiverless. */
export type ReturnRead = [file: string, line: number, bare: boolean];

/**
 * `extract-return-uses.rb`'s output for one package: Ruby method name → reads,
 * and Rails file → the method names it defines. `lib` is the package's lib
 * root, which a skeleton row's `rubyFile` is relative to.
 */
export interface PackageReturnUses {
  lib: string;
  reads: Record<string, ReturnRead[]>;
  defs: Record<string, string[]>;
}

export type ReturnUses = Record<string, PackageReturnUses>;

export interface VoidReturnRow extends SkeletonRow {
  use: ReturnUse;
}

const key = (pkg: string, file: string, name: string) => `${pkg}\u0000${file}\u0000${name}`;

function methodsOf(pkg: ApiPackage): MethodInfo[] {
  const owners = [...Object.values(pkg.classes ?? {}), ...Object.values(pkg.modules ?? {})];
  return [
    ...owners.flatMap((o) => [...(o.instanceMethods ?? []), ...(o.classMethods ?? [])]),
    ...Object.values(pkg.fileFunctions ?? {}).flat(),
  ];
}

/**
 * (package, TS file, name) keys every declaration of which returns void. One
 * non-void declaration clears the key: an overload set whose writer overload
 * returns `void` (`_helpers(cls, value)`) still has a reader that does not.
 */
export function tsVoidReturns(tsApi: ApiManifest): Set<string> {
  const voids = new Set<string>();
  const values = new Set<string>();
  for (const [pkg, info] of Object.entries(tsApi.packages)) {
    for (const m of methodsOf(info)) {
      (m.returnsVoid === true ? voids : values).add(key(pkg, m.file ?? "", m.name));
    }
  }
  return new Set([...voids].filter((k) => !values.has(k)));
}

/** (package, Ruby file, name) keys of the methods Rails declares private. */
export function rubyPrivates(rubyApi: ApiManifest): Set<string> {
  const privates = new Set<string>();
  for (const [pkg, info] of Object.entries(rubyApi.packages)) {
    for (const m of methodsOf(info)) {
      if (m.visibility === "private") privates.add(key(pkg, m.file ?? "", m.name));
    }
  }
  return privates;
}

/** (package, Ruby file, name) keys of the methods that answer their block's value. */
export function rubyReturnsBlock(rubyApi: ApiManifest): Set<string> {
  const keys = new Set<string>();
  for (const [pkg, info] of Object.entries(rubyApi.packages)) {
    for (const m of methodsOf(info)) {
      if (m.returnsBlock === true) keys.add(key(pkg, m.file ?? "", m.name));
    }
  }
  return keys;
}

/** Matched pairs whose Rails method returns its block's value and whose port returns void. */
export function blockReturnRows(
  skeletons: readonly SkeletonRow[],
  returnsBlock: ReadonlySet<string>,
  voids: ReadonlySet<string>,
): SkeletonRow[] {
  return skeletons.filter(
    (row) =>
      returnsBlock.has(key(row.package, row.rubyFile, row.rubyName)) &&
      voids.has(key(row.package, row.tsFile, row.tsName)),
  );
}

export type PackageCounts = Record<string, number>;

export const RETURNS_BLOCK_MARK_PATH = path.join(SCRIPT_DIR, "returns-block-mark.json");

export function blockReturnCounts(
  rows: readonly SkeletonRow[],
  packages: readonly string[],
): PackageCounts {
  const counts: PackageCounts = Object.fromEntries(packages.map((pkg) => [pkg, 0]));
  for (const r of rows) if (Object.hasOwn(counts, r.package)) counts[r.package] += 1;
  return counts;
}

async function gate(
  rows: readonly SkeletonRow[],
  packages: readonly string[],
  tighten: boolean,
  scope: string | null,
): Promise<number> {
  const current = blockReturnCounts(rows, scope === null ? packages : [scope]);
  if (scope !== null)
    for (const pkg of Object.keys(current)) if (pkg !== scope) delete current[pkg];
  const committed = JSON.parse(await readFile(RETURNS_BLOCK_MARK_PATH, "utf8")) as PackageCounts;
  const marks = scopedMarks(committed, scope);
  const grew = exceedances(marks, current);
  const stale = staleMarks(marks, current);
  if (tighten) {
    if (grew.length > 0) {
      console.error("returns-block gate: refusing to tighten while the mark is EXCEEDED.");
      return 1;
    }
    await writeFile(RETURNS_BLOCK_MARK_PATH, serializeBaseline(tightened(marks, current)));
    console.log(`returns-block gate: narrowed ${stale.length} package(s).`);
    return 0;
  }
  if (grew.length > 0) {
    console.error(
      `\nreturns-block gate: ${grew.length} package(s) GREW past the committed mark.\n` +
        "Return the block's value, as Rails does, rather than raising the mark.\n",
    );
    for (const v of grew) {
      console.error(`  + ${v.package}: mark ${v.mark} → current ${v.current}`);
      for (const r of rows.filter((row) => row.package === v.package)) {
        console.error(`      ${r.tsFile}#${r.tsName}  <-  ${r.rubyFile}#${r.rubyName}`);
      }
    }
    return 1;
  }
  for (const v of stale) {
    console.log(
      `returns-block gate: ${v.package} mark ${v.mark} is above the current ${v.current} — ` +
        "narrow it with `pnpm parity:api:returns --gate --tighten`.",
    );
  }
  console.log("returns-block gate: OK");
  return 0;
}

export function voidReturnRows(
  skeletons: readonly SkeletonRow[],
  uses: ReturnUses,
  voids: ReadonlySet<string>,
  privates: ReadonlySet<string> = new Set(),
): VoidReturnRow[] {
  const rows: VoidReturnRow[] = [];
  for (const row of skeletons) {
    if (row.rubyName === "initialize" || row.rubyName.endsWith("=")) continue;
    const pkg = uses[row.package];
    if (pkg === undefined) continue;
    const own = `${pkg.lib}/${row.rubyFile}`;
    const isPrivate = privates.has(key(row.package, row.rubyFile, row.rubyName));
    const reads = (pkg.reads[row.rubyName] ?? []).filter(([file, , bare]) =>
      bare ? file === own || !pkg.defs[file]?.includes(row.rubyName) : !isPrivate,
    );
    if (reads.length === 0) continue;
    if (!voids.has(key(row.package, row.tsFile, row.tsName))) continue;
    rows.push({ ...row, use: { count: reads.length, site: `${reads[0][0]}:${reads[0][1]}` } });
  }
  return rows;
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function sampleRows(rows: readonly VoidReturnRow[], n: number): VoidReturnRow[] {
  const id = (r: VoidReturnRow) => `${r.package}/${r.rubyFile}#${r.rubyName}`;
  return [...rows]
    .sort((a, b) => fnv1a(id(a)) - fnv1a(id(b)) || (id(a) < id(b) ? -1 : 1))
    .slice(0, n);
}

export function renderReport(rows: readonly VoidReturnRow[], compared: number): string {
  return [
    `void-return report: ${rows.length} pair(s) of ${compared} whose return value a Rails ` +
      "caller reads and whose port returns void — report-only (RFC 0156)",
    section(
      "By package",
      tally(rows, (r) => r.package),
    ),
    `\nPairs (${rows.length})`,
    ...rows.map(
      (r) =>
        `  ${r.package}/${r.tsFile}#${r.tsName}  <-  ${r.rubyFile}#${r.rubyName}` +
        `  (${r.use.count} read(s), first ${r.use.site})`,
    ),
  ].join("\n");
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    return undefined;
  }
}

/** Runs `extract-return-uses.rb` over each compared package's lib and test trees. */
async function railsReturnUses(packages: readonly string[]): Promise<ReturnUses> {
  const libs = libPathsManifest();
  const tests = testPathsManifest();
  const present = packages.filter((pkg) => libs[pkg] !== undefined);
  const roots = Object.fromEntries(
    present.map((pkg) => [pkg, [libs[pkg], tests[pkg]].filter((d) => d !== undefined)]),
  );
  const { stdout } = await promisify(execFile)(
    "ruby",
    [path.join(SCRIPT_DIR, "extract-return-uses.rb"), JSON.stringify(roots)],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  const uses = JSON.parse(stdout) as Record<string, Omit<PackageReturnUses, "lib">>;
  return Object.fromEntries(
    present.map((pkg) => [
      pkg,
      { ...uses[pkg], lib: libs[pkg].replace(/^.*\/vendor\/[^/]+\/[^/]+\//, "") },
    ]),
  );
}

async function main(argv: string[]): Promise<number> {
  const files = ["call-skeletons.json", "ts-api.json", "rails-api.json"].map((f) =>
    path.join(OUTPUT_DIR, f),
  );
  const [artifact, tsApi, rubyApi] = await Promise.all([
    readJson<SkeletonArtifact>(files[0]),
    readJson<ApiManifest>(files[1]),
    readJson<ApiManifest>(files[2]),
  ]);
  if (artifact === undefined || tsApi === undefined || rubyApi === undefined) {
    console.error(
      `void-return report: ${files.map((f) => path.relative(ROOT_DIR, f)).join(", ")} ` +
        "must all exist — run `pnpm parity:api --calls` first.",
    );
    return 2;
  }
  if (argv.includes("--gate")) {
    const rows = blockReturnRows(
      artifact.skeletons,
      rubyReturnsBlock(rubyApi),
      tsVoidReturns(tsApi),
    );
    return gate(rows, artifact.packages, argv.includes("--tighten"), scopeOf(argv));
  }
  const rows = voidReturnRows(
    artifact.skeletons,
    await railsReturnUses(artifact.packages),
    tsVoidReturns(tsApi),
    rubyPrivates(rubyApi),
  );
  const raw = argv.find((a) => a.startsWith("--sample="))?.slice("--sample=".length);
  console.log(
    renderReport(
      raw === undefined ? rows : sampleRows(rows, Number(raw)),
      artifact.skeletons.length,
    ),
  );
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main(process.argv.slice(2)));
}

void runAsScript();
