#!/usr/bin/env npx tsx
/**
 * Report-only (RFC 0156): a matched pair whose port returns `void` /
 * `Promise<void>` where the Rails body ends in a value a caller can use.
 * `ConnectionHandling#establish_connection` returning the pool
 * (`connection_handling.rb:50-54`) ported as `Promise<void>` is the shape.
 *
 *   pnpm parity:api:returns                      # every row
 *   pnpm parity:api:returns --sample=80          # a reproducible audit sample
 *
 * Every Ruby method returns something, so "Rails returns a value" alone would
 * flag nearly every pair. The Ruby half is narrowed to a body whose FINAL
 * expression (`lastExpr`, `extract-ruby-api.rb#body_last_expr`) is a call, a
 * `.new`, or `return <expr>`; a setter (`x=`) and `initialize` are left out,
 * and a body ending in an assignment — a bang-less mutator's usual last
 * statement — never qualifies. The TS half is `returnsVoid`
 * (`extract-ts-api.ts#signatureReturnsVoid`).
 *
 * The population is the skeleton artifact's pairs: every compared pair with a
 * body on both sides. A Ruby name defined twice in one file answers with its
 * first definition, as compare.ts' first-sighting maps do.
 *
 * Run `pnpm parity:api --calls` first so output/call-skeletons.json is fresh.
 */
import * as path from "path";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
import { section, tally } from "./lint-call-mismatches.js";
import type { SkeletonArtifact, SkeletonRow } from "./report-arms.js";
import type { MethodInfo } from "@blazetrails/parity/types";

const VALUE_EXPRS: ReadonlySet<string> = new Set(["call", "new", "return"]);

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

export interface VoidReturnRow extends SkeletonRow {
  lastExpr: string;
}

const key = (pkg: string, file: string, name: string) => `${pkg}\u0000${file}\u0000${name}`;

function methodsOf(pkg: ApiPackage): MethodInfo[] {
  const owners = [...Object.values(pkg.classes ?? {}), ...Object.values(pkg.modules ?? {})];
  return [
    ...owners.flatMap((o) => [...(o.instanceMethods ?? []), ...(o.classMethods ?? [])]),
    ...Object.values(pkg.fileFunctions ?? {}).flat(),
  ];
}

/** First-sighting `lastExpr` per (package, Ruby file, name). */
export function rubyLastExprs(rails: ApiManifest): Map<string, string> {
  const out = new Map<string, string>();
  for (const [pkg, info] of Object.entries(rails.packages)) {
    for (const m of methodsOf(info)) {
      const k = key(pkg, m.file ?? "", m.name);
      if (m.lastExpr !== undefined && !out.has(k)) out.set(k, m.lastExpr);
    }
  }
  return out;
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
  lastExprs: ReadonlyMap<string, string>,
  voids: ReadonlySet<string>,
): VoidReturnRow[] {
  const rows: VoidReturnRow[] = [];
  for (const row of skeletons) {
    if (row.rubyName === "initialize" || row.rubyName.endsWith("=")) continue;
    const lastExpr = lastExprs.get(key(row.package, row.rubyFile, row.rubyName));
    if (lastExpr === undefined || !VALUE_EXPRS.has(lastExpr)) continue;
    if (!voids.has(key(row.package, row.tsFile, row.tsName))) continue;
    rows.push({ ...row, lastExpr });
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
    `void-return report: ${rows.length} pair(s) of ${compared} whose Rails body ends in a ` +
      "call / `.new` / `return <expr>` and whose port returns void — report-only (RFC 0156)",
    section(
      "By package",
      tally(rows, (r) => r.package),
    ),
    section(
      "By Ruby final expression",
      tally(rows, (r) => r.lastExpr),
    ),
    `\nPairs (${rows.length})`,
    ...rows.map(
      (r) =>
        `  ${r.package}/${r.tsFile}#${r.tsName}  <-  ${r.rubyFile}#${r.rubyName} (${r.lastExpr})`,
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

async function main(argv: string[]): Promise<number> {
  const files = ["call-skeletons.json", "rails-api.json", "ts-api.json"].map((f) =>
    path.join(OUTPUT_DIR, f),
  );
  const [artifact, rails, tsApi] = await Promise.all([
    readJson<SkeletonArtifact>(files[0]),
    readJson<ApiManifest>(files[1]),
    readJson<ApiManifest>(files[2]),
  ]);
  if (artifact === undefined || rails === undefined || tsApi === undefined) {
    console.error(
      `void-return report: ${files.map((f) => path.relative(ROOT_DIR, f)).join(", ")} ` +
        "must all exist — run `pnpm parity:api --calls` first.",
    );
    return 2;
  }
  const rows = voidReturnRows(artifact.skeletons, rubyLastExprs(rails), tsVoidReturns(tsApi));
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
