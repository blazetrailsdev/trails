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
 * The population is the skeleton artifact's pairs: every compared pair with a
 * body on both sides. A Ruby name defined twice in one file answers with its
 * first definition, as compare.ts' first-sighting maps do.
 *
 * Run `pnpm parity:api --calls` first so output/call-skeletons.json is fresh.
 */
import * as path from "path";
import { execFile } from "child_process";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { libPathsManifest, testPathsManifest } from "../../vendor/sources.js";
import { OUTPUT_DIR, ROOT_DIR, SCRIPT_DIR } from "./config.js";
import { section, tally } from "./lint-call-mismatches.js";
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

/** One Rails read of a method's return value: how many, and the first. */
export interface ReturnUse {
  count: number;
  site: string;
}

/** `extract-return-uses.rb`'s output: package → Ruby method name → reads. */
export type ReturnUses = Record<string, Record<string, ReturnUse>>;

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

export function voidReturnRows(
  skeletons: readonly SkeletonRow[],
  uses: ReturnUses,
  voids: ReadonlySet<string>,
): VoidReturnRow[] {
  const rows: VoidReturnRow[] = [];
  for (const row of skeletons) {
    if (row.rubyName === "initialize" || row.rubyName.endsWith("=")) continue;
    const use = uses[row.package]?.[row.rubyName];
    if (use === undefined) continue;
    if (!voids.has(key(row.package, row.tsFile, row.tsName))) continue;
    rows.push({ ...row, use });
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
  const roots = Object.fromEntries(
    packages.map((pkg) => [pkg, [libs[pkg], tests[pkg]].filter((d) => d !== undefined)]),
  );
  const { stdout } = await promisify(execFile)(
    "ruby",
    [path.join(SCRIPT_DIR, "extract-return-uses.rb"), JSON.stringify(roots)],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as ReturnUses;
}

async function main(argv: string[]): Promise<number> {
  const files = ["call-skeletons.json", "ts-api.json"].map((f) => path.join(OUTPUT_DIR, f));
  const [artifact, tsApi] = await Promise.all([
    readJson<SkeletonArtifact>(files[0]),
    readJson<ApiManifest>(files[1]),
  ]);
  if (artifact === undefined || tsApi === undefined) {
    console.error(
      `void-return report: ${files.map((f) => path.relative(ROOT_DIR, f)).join(", ")} ` +
        "must all exist — run `pnpm parity:api --calls` first.",
    );
    return 2;
  }
  const rows = voidReturnRows(
    artifact.skeletons,
    await railsReturnUses(artifact.packages),
    tsVoidReturns(tsApi),
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
