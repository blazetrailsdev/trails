#!/usr/bin/env npx tsx
/**
 * Ratcheting gate for the WIDE call-set parity dimension (RFC 0047).
 *
 * This is the wide sibling of lint-call-mismatches.ts. The narrow gate ratchets
 * output/call-mismatches.json, produced over the curated SIGNIFICANT_CALLS
 * allowlist (RFC 0044). This one ratchets output/call-mismatches-wide.json,
 * produced when compare.ts runs with `--wide-calls` / `API_COMPARE_WIDE_CALLS=1`
 * (WIDE_SIGNIFICANT_CALLS — every ported call name except `super`). The two
 * artifacts and baselines are entirely separate, so widening the population
 * never perturbs the narrow 0044 gate.
 *
 * Same only-shrink contract: a committed baseline lists the currently-known
 * wide mismatches keyed by `package + tsFile + rubyName + call`, each with a
 * one-line `reason`, and CI fails on:
 *
 *   - any NEW wide mismatch absent from the baseline (the ratchet);
 *   - any STALE baseline entry that no longer flags (only-shrink);
 *   - more entries still carrying the seeded {@link DEFAULT_REASON} than the
 *     committed high-water mark in call-mismatches-wide-unreviewed.json
 *     (RFC 0083 — see unreviewed-ratchet.ts for why that is a second ratchet).
 *
 * The wide population is large and dominated by bucket-(b) confirmed
 * equivalents and bucket-(c) tooling noise (see RFC 0047 README). The baseline
 * seeds with the whole current population and shrinks as the per-cluster
 * convergence stories land — removing an entry is how a converged call drops out.
 *
 * ── Split baseline layout ───────────────────────────────────────────────────
 * The baseline is NOT one file: it is a directory (call-mismatches-wide-exclude/)
 * that mirrors the source tree, one JSON file per `tsFile`, at
 * `<dir>/<package>/<tsFile with .ts→.json>`. Each file is a JSON array of
 * exactly that source file's entries, sorted by the code-unit `compareKeys`
 * order (see lint-call-mismatches.ts) so a reseed rewrites only the files whose
 * entries actually changed. This makes the merge-conflict
 * boundary match the unit of work: an agent converging relation.ts only touches
 * activerecord/relation.json, not a shared 47k-line monolith. The loader globs
 * and concatenates every file; `--write` partitions the reseed back out by
 * (package, tsFile), creating files for newly-flagged sources, and DELETING a
 * file (plus any emptied parent dirs) once all its entries converge — an empty
 * `[]` file is never left behind, so a post-reseed git diff shows only real
 * baseline changes.
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-call-mismatches-wide.ts           # gate (CI)
 *   pnpm tsx scripts/api-compare/lint-call-mismatches-wide.ts --write   # reseed baseline
 *   pnpm tsx scripts/api-compare/lint-call-mismatches-wide.ts --report  # read-only grouping
 *
 * `--report` (RFC 0083) groups the baselined population by package, source
 * file, Ruby call name, and derived cause bucket, so a burndown story can be
 * scoped off a coherent slice instead of a 4794-line flat list. It never writes
 * the baseline and always exits 0. `--unreviewed` prints just the count of
 * entries whose `reason` is still the seeded {@link DEFAULT_REASON}.
 *
 * `--write` regenerates the baseline from the current wide artifact, preserving
 * the `reason` of entries that still flag and dropping stale rows, then
 * repartitions it across the split files (adding/removing files as needed).
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-call-mismatches.ts), async fs.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
import {
  type Artifact,
  type CallMismatchKey,
  type ExcludeEntry,
  compareKeys,
  diffAgainstBaseline,
  findDuplicateKeys,
  flattenArtifact,
  missingScope,
  reseed,
} from "./lint-call-mismatches.js";
import { reportNonCanonicalBaselines, serializeBaseline } from "./baseline-json.js";
import {
  loadMark,
  newlySeeded,
  nextMark,
  renderExcess,
  renderWriteSummary,
  writeMark,
} from "./unreviewed-ratchet.js";
import { rubyMethodToTsIgnoringSkip, snakeToCamel } from "./conventions.js";
import type { ApiManifest, ClassInfo, MethodInfo } from "./types.js";

// The baseline is a directory of per-source-file JSON arrays (see header),
// not a single file. Each entry lives at <BASELINE_DIR>/<package>/<tsFile
// with .ts→.json>.
const BASELINE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "call-mismatches-wide-exclude",
);

// Relative baseline path (under BASELINE_DIR) for an entry, mirroring its
// source tree: <package>/<tsFile with .ts→.json>. Every artifact tsFile ends in
// `.ts`; guard anyway, because a path that kept a non-`.json` extension would be
// written but then skipped by the `.json` glob on reload — a silent round-trip
// data loss rather than a loud failure.
export function relPathFor(k: CallMismatchKey): string {
  if (!k.tsFile.endsWith(".ts")) {
    throw new Error(
      `wide call-mismatches baseline: tsFile ${JSON.stringify(k.tsFile)} does not end in ` +
        `".ts" (package ${k.package}); the split baseline maps <tsFile .ts→.json> and ` +
        "cannot place a non-.ts source.",
    );
  }
  return path.join(k.package, k.tsFile.replace(/\.ts$/, ".json"));
}
// Gates the full-surface wide artifact only — privates are advisory-only
// throughout the compare tooling (mirrors lint-call-mismatches.ts).
const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-mismatches-wide.json");

// Committed high-water mark for the unreviewed-reason counter (RFC 0083); see
// unreviewed-ratchet.ts.
const MARK_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "call-mismatches-wide-unreviewed.json",
);

export const DEFAULT_REASON =
  "Baseline (RFC 0047): wide call-set flag seeded when the wide ratchet landed; " +
  "bucket (b) equivalent or (c) noise pending per-cluster burndown review.";

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf-8")) as T;
}

// Recursively list *.json files under `dir` as absolute paths (empty if the
// directory does not exist yet).
async function listJsonFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw e;
  }
  for (const d of dirents) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await listJsonFiles(full)));
    else if (d.name.endsWith(".json")) out.push(full);
  }
  return out;
}

// Concatenate every per-file baseline array under `dir` into one merged,
// deterministically-sorted list. Duplicate-key and partial-scope guards then
// run across the merged set exactly as they did against the monolith.
export async function loadSplitBaseline(dir: string): Promise<ExcludeEntry[]> {
  const files = (await listJsonFiles(dir)).sort();
  const merged: ExcludeEntry[] = [];
  for (const f of files) merged.push(...(await readJson<ExcludeEntry[]>(f)));
  return sortKeys(merged);
}

async function loadBaseline(): Promise<ExcludeEntry[]> {
  return loadSplitBaseline(BASELINE_DIR);
}

// Repartition the reseeded baseline back across the split files under `dir`.
// Writes one sorted array per (package, tsFile), creating parent dirs and
// brand-new files for newly-flagged sources; deletes any pre-existing baseline
// file whose entries all converged to zero (never leaving a `[]`), then prunes
// parent directories emptied by those deletions. A post-reseed git diff
// therefore reflects only real baseline changes.
export async function writeSplitBaseline(entries: ExcludeEntry[], dir: string): Promise<void> {
  const byFile = new Map<string, ExcludeEntry[]>();
  for (const e of entries) {
    const rel = relPathFor(e);
    (byFile.get(rel) ?? byFile.set(rel, []).get(rel)!).push(e);
  }

  const existing = new Set((await listJsonFiles(dir)).map((f) => path.relative(dir, f)));

  for (const [rel, arr] of byFile) {
    const dest = path.join(dir, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, serializeBaseline(sortKeys(arr)));
    existing.delete(rel);
  }

  // Whatever remains in `existing` no longer has any entries — delete it.
  for (const rel of existing) await fs.rm(path.join(dir, rel));
  await pruneEmptyDirs(dir);
}

// Recursively remove empty subdirectories under `dir` (keeps `dir` itself).
async function pruneEmptyDirs(dir: string): Promise<boolean> {
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw e;
  }
  let empty = true;
  for (const d of dirents) {
    if (d.isDirectory()) {
      const sub = path.join(dir, d.name);
      if (await pruneEmptyDirs(sub)) await fs.rmdir(sub);
      else empty = false;
    } else {
      empty = false;
    }
  }
  return empty;
}

async function loadArtifact(): Promise<Artifact> {
  const exists = await fs.access(ARTIFACT_PATH).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, ARTIFACT_PATH)} — run \`pnpm exec tsx ` +
        "scripts/api-compare/compare.ts --wide-calls` (or `pnpm api:compare --wide-calls`) first to write it.",
    );
  }
  return readJson<Artifact>(ARTIFACT_PATH);
}

// Emission order for every baseline file (and every console listing): the
// shared code-unit `compareKeys` order documented in lint-call-mismatches.ts.
function sortKeys<T extends CallMismatchKey>(entries: T[]): T[] {
  return [...entries].sort(compareKeys);
}

const TS_API_PATH = path.join(OUTPUT_DIR, "ts-api.json");

export type CauseBucket =
  | "same-file candidate takes args"
  | "same-file zero-arg member"
  | "candidate elsewhere in package"
  | "candidate not in package";

export interface MemberSite {
  file: string;
  takesArgs: boolean;
}

export type TsMemberIndex = Map<string, Map<string, MemberSite[]>>;

function addSite(index: Map<string, MemberSite[]>, m: MethodInfo, fallbackFile: string): void {
  // On a synthesized mixin pseudo-module the member is usually declared in a
  // different file than the one the pseudo-module is keyed under, so
  // `declaredIn` — when present — is the only correct attribution.
  const file = m.declaredIn ?? m.file ?? fallbackFile;
  if (!file) return;
  const sites = index.get(m.name) ?? index.set(m.name, []).get(m.name)!;
  sites.push({ file, takesArgs: m.params.length > 0 });
}

export function indexTsMembers(manifest: ApiManifest): TsMemberIndex {
  const out: TsMemberIndex = new Map();
  for (const [pkg, info] of Object.entries(manifest.packages)) {
    const byName = new Map<string, MemberSite[]>();
    const containers: ClassInfo[] = [
      ...Object.values(info.classes ?? {}),
      ...Object.values(info.modules ?? {}),
    ];
    for (const c of containers) {
      for (const m of [...c.instanceMethods, ...c.classMethods]) addSite(byName, m, c.file ?? "");
    }
    for (const [file, fns] of Object.entries(info.fileFunctions ?? {})) {
      for (const m of fns) addSite(byName, m, file);
    }
    out.set(pkg, byName);
  }
  return out;
}

export function tsCandidatesFor(call: string): string[] {
  return [...new Set([...(rubyMethodToTsIgnoringSkip(call) ?? []), snakeToCamel(call)])];
}

export function bucketFor(key: CallMismatchKey, index: TsMemberIndex): CauseBucket {
  const byName = index.get(key.package);
  const sites = byName ? tsCandidatesFor(key.call).flatMap((n) => byName.get(n) ?? []) : [];
  if (sites.length === 0) return "candidate not in package";
  const sameFile = sites.filter((s) => s.file === key.tsFile);
  if (sameFile.length === 0) return "candidate elsewhere in package";
  return sameFile.some((s) => s.takesArgs)
    ? "same-file candidate takes args"
    : "same-file zero-arg member";
}

function tally<T>(items: T[], keyFn: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = keyFn(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function section(title: string, rows: [string, number][], top?: number): string {
  const shown = top === undefined ? rows : rows.slice(0, top);
  const head =
    rows.length > shown.length
      ? `${title} (top ${shown.length} of ${rows.length})`
      : `${title} (${rows.length})`;
  const width = Math.max(0, ...shown.map(([k]) => k.length));
  return [
    `\n${head}`,
    ...shown.map(([k, n]) => `  ${k.padEnd(width)}  ${String(n).padStart(5)}`),
  ].join("\n");
}

export function unreviewedCount(entries: ExcludeEntry[]): number {
  return entries.filter((e) => e.reason === DEFAULT_REASON).length;
}

export function renderReport(
  entries: ExcludeEntry[],
  index: TsMemberIndex | undefined,
  top: number,
): string {
  const files = new Set(entries.map((e) => `${e.package} ${e.tsFile}`)).size;
  const parts = [
    `wide call-mismatches report: ${entries.length} entr(ies) across ${files} file(s)`,
    `  unreviewed (reason still the seeded default): ${unreviewedCount(entries)} of ${entries.length}`,
    section(
      "By package",
      tally(entries, (e) => e.package),
    ),
    section(
      "By file",
      tally(entries, (e) => `${e.package}/${e.tsFile}`),
      top,
    ),
    section(
      "By Ruby call name",
      tally(entries, (e) => e.call),
      top,
    ),
  ];
  parts.push(
    index === undefined
      ? `\nBy cause bucket: SKIPPED — ${path.relative(ROOT_DIR, TS_API_PATH)} is missing ` +
          "(run `pnpm api:compare` first)."
      : section(
          "By cause bucket",
          tally(entries, (e) => bucketFor(e, index)),
        ),
  );
  return parts.join("\n");
}

async function readJsonIfPresent<T>(file: string): Promise<T | undefined> {
  try {
    return await readJson<T>(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

async function main(write: boolean): Promise<number> {
  const baseline = await loadBaseline();
  const artifact = await loadArtifact();
  const current = flattenArtifact(artifact);

  const dups = findDuplicateKeys(baseline);
  if (dups.length > 0) {
    console.error(
      `\nwide call-mismatches ratchet: ${dups.length} duplicate baseline key(s):\n` +
        dups.map((d) => `  ${d}`).join("\n"),
    );
    return 1;
  }

  // Determinism guard (RFC 0044): same partial-scope coverage check as the
  // narrow gate (see lint-call-mismatches.ts header).
  const absent = missingScope(artifact);
  if (absent.length > 0) {
    console.error(
      `\nwide call-mismatches ratchet: artifact compared a PARTIAL scope — missing ` +
        `${absent.length} package(s): ${absent.join(", ")}.\n` +
        "It covers fewer packages than CI (an unfetched vendor source, a " +
        "`--package`-filtered run, or a stale artifact); reseeding or gating " +
        "from it would desync local vs CI. Regenerate the full surface:\n" +
        "  pnpm api:calls:wide:reseed   (or `API_COMPARE_FORCE=1 pnpm " +
        "api:compare --wide-calls` then re-run this).\n",
    );
    return 1;
  }

  if (write) {
    const next = reseed(current, baseline, DEFAULT_REASON);
    await writeSplitBaseline(next, BASELINE_DIR);
    console.log(
      `Wrote ${path.relative(ROOT_DIR, BASELINE_DIR)}/: ${next.length} baselined wide call mismatches`,
    );

    const count = unreviewedCount(next);
    const newly = sortKeys(newlySeeded(next, baseline, DEFAULT_REASON));
    // Rows this reseed just seeded are held out of the mark, so a reseed can
    // never buy unreviewed headroom (see unreviewed-ratchet.ts header).
    const mark = nextMark(count - newly.length, await loadMark(MARK_PATH));
    await writeMark(MARK_PATH, mark);
    console.log(renderWriteSummary(count, newly, mark, path.relative(ROOT_DIR, MARK_PATH)));
    return 0;
  }

  const files = await listJsonFiles(BASELINE_DIR);
  if (await reportNonCanonicalBaselines(files, "wide call-mismatches ratchet")) return 1;

  const { added, stale } = diffAgainstBaseline(current, baseline);

  const unreviewed = unreviewedCount(baseline);
  const mark = await loadMark(MARK_PATH);
  const overMark = unreviewed > mark;
  if (overMark) console.error(renderExcess(unreviewed, mark, path.relative(ROOT_DIR, MARK_PATH)));

  if (added.length === 0 && stale.length === 0) {
    if (overMark) return 1;
    console.log(
      `wide call-mismatches ratchet: OK (${baseline.length} baselined, ` +
        `${unreviewed} unreviewed <= mark ${mark})`,
    );
    return 0;
  }

  if (added.length > 0) {
    console.error(
      `\nwide call-mismatches ratchet: ${added.length} NEW wide mismatch(es) not in the baseline.`,
    );
    console.error(
      "A ported TS body omits a call Rails makes (wide population). Implement the " +
        "call, or — if it is satisfied by a different path — add it (with a " +
        "one-line reason) to its per-source baseline file under\n  " +
        `${path.relative(ROOT_DIR, BASELINE_DIR)}/  (<package>/<tsFile .ts→.json>).\n`,
    );
    for (const k of sortKeys(added)) {
      console.error(`  + ${k.package}  ${k.tsFile}  ${k.rubyName}  ${k.call}  (${relPathFor(k)})`);
    }
  }

  if (stale.length > 0) {
    console.error(
      `\nwide call-mismatches ratchet: ${stale.length} STALE baseline entr(ies) that no longer flag.`,
    );
    console.error(
      "The baseline only shrinks. Remove the converged entr(ies) (or run " +
        "`--write` to reseed):\n",
    );
    for (const e of sortKeys(stale)) {
      console.error(`  - ${e.package}  ${e.tsFile}  ${e.rubyName}  ${e.call}`);
    }
  }

  return 1;
}

async function reportMain(top: number, unreviewedOnly: boolean): Promise<number> {
  const baseline = await loadBaseline();
  if (unreviewedOnly) {
    console.log(
      `wide call-mismatches: ${unreviewedCount(baseline)} of ${baseline.length} baselined ` +
        `entr(ies) still carry the seeded default reason (unreviewed); high-water mark ` +
        `${await loadMark(MARK_PATH)}.`,
    );
    return 0;
  }

  const entries = [...baseline];
  const artifact = await readJsonIfPresent<Artifact>(ARTIFACT_PATH);
  if (artifact === undefined) {
    console.log(
      "(baseline only — the wide artifact is missing; run `pnpm api:compare --wide-calls`)",
    );
  } else {
    // Not-yet-baselined mismatches carry no reason, so they are reported in the
    // groupings without inflating the unreviewed-but-seeded count.
    const { added } = diffAgainstBaseline(flattenArtifact(artifact), baseline);
    entries.push(...added.map((k) => ({ ...k, reason: "" })));
    if (added.length > 0) console.log(`(including ${added.length} not-yet-baselined mismatch(es))`);
  }

  const manifest = await readJsonIfPresent<ApiManifest>(TS_API_PATH);
  console.log(renderReport(sortKeys(entries), manifest && indexTsMembers(manifest), top));
  return 0;
}

export function parseTop(argv: string[], fallback: number): number {
  const raw = argv.find((a) => a.startsWith("--top="))?.slice("--top=".length);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--top expects a positive integer, got ${JSON.stringify(raw)}`);
  }
  return n;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const argv = process.argv.slice(2);
  const unreviewed = argv.includes("--unreviewed");
  if (!argv.includes("--report") && !unreviewed) {
    process.exit(await main(argv.includes("--write")));
  }
  let top: number;
  try {
    top = parseTop(argv, 20);
  } catch (e) {
    console.error(`wide call-mismatches report: ${(e as Error).message}`);
    process.exit(2);
  }
  process.exit(await reportMain(top, unreviewed));
}

void runAsScript();
