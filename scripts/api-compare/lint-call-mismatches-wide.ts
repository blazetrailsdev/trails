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
 *   - any STALE baseline entry that no longer flags (only-shrink).
 *
 * The wide population is large and dominated by bucket-(b) confirmed
 * equivalents and bucket-(c) tooling noise (see RFC 0047 README). The baseline
 * seeds with the whole current population and shrinks as the per-cluster
 * convergence stories land — removing an entry is how a converged call drops out.
 *
 * ── Split baseline layout ───────────────────────────────────────────────────
 * The baseline is NOT one file: it is a directory (call-mismatches-wide-exclude/)
 * that mirrors the source tree, one JSON file per `tsFile`, at
 * `<dir>/<package>/<tsFile with .ts→.json>`. Each file is a sorted (keyOf) JSON
 * array of exactly that source file's entries. This makes the merge-conflict
 * boundary match the unit of work: an agent converging relation.ts only touches
 * activerecord/relation.json, not a shared 47k-line monolith. The loader globs
 * and concatenates every file; `--write` partitions the reseed back out by
 * (package, tsFile), creating files for newly-flagged sources, and DELETING a
 * file (plus any emptied parent dirs) once all its entries converge — an empty
 * `[]` file is never left behind, so a post-reseed git diff shows only real
 * baseline changes.
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-call-mismatches-wide.ts          # gate (CI)
 *   pnpm tsx scripts/api-compare/lint-call-mismatches-wide.ts --write  # reseed baseline
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
  diffAgainstBaseline,
  findDuplicateKeys,
  flattenArtifact,
  keyOf,
  missingScope,
  reseed,
} from "./lint-call-mismatches.js";

// The baseline is a directory of per-source-file JSON arrays (see header),
// not a single file. Each entry lives at <BASELINE_DIR>/<package>/<tsFile
// with .ts→.json>.
const BASELINE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "call-mismatches-wide-exclude",
);

// Relative baseline path (under BASELINE_DIR) for an entry, mirroring its
// source tree: <package>/<tsFile with .ts→.json>.
function relPathFor(k: CallMismatchKey): string {
  return path.join(k.package, k.tsFile.replace(/\.ts$/, ".json"));
}
// Gates the full-surface wide artifact only — privates are advisory-only
// throughout the compare tooling (mirrors lint-call-mismatches.ts).
const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-mismatches-wide.json");

const DEFAULT_REASON =
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

// Concatenate every per-file baseline array under BASELINE_DIR into one merged,
// deterministically-sorted list. Duplicate-key and partial-scope guards then
// run across the merged set exactly as they did against the monolith.
async function loadBaseline(): Promise<ExcludeEntry[]> {
  const files = (await listJsonFiles(BASELINE_DIR)).sort();
  const merged: ExcludeEntry[] = [];
  for (const f of files) merged.push(...(await readJson<ExcludeEntry[]>(f)));
  return sortKeys(merged);
}

// Repartition the reseeded baseline back across the split files. Writes one
// sorted array per (package, tsFile), creating parent dirs and brand-new files
// for newly-flagged sources; deletes any pre-existing baseline file whose
// entries all converged to zero (never leaving a `[]`), then prunes parent
// directories emptied by those deletions. A post-reseed git diff therefore
// reflects only real baseline changes.
async function writeSplitBaseline(entries: ExcludeEntry[]): Promise<void> {
  const byFile = new Map<string, ExcludeEntry[]>();
  for (const e of entries) {
    const rel = relPathFor(e);
    (byFile.get(rel) ?? byFile.set(rel, []).get(rel)!).push(e);
  }

  const existing = new Set(
    (await listJsonFiles(BASELINE_DIR)).map((f) => path.relative(BASELINE_DIR, f)),
  );

  for (const [rel, arr] of byFile) {
    const dest = path.join(BASELINE_DIR, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, JSON.stringify(sortKeys(arr), null, 2) + "\n");
    existing.delete(rel);
  }

  // Whatever remains in `existing` no longer has any entries — delete it.
  for (const rel of existing) await fs.rm(path.join(BASELINE_DIR, rel));
  await pruneEmptyDirs(BASELINE_DIR);
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

function sortKeys<T extends CallMismatchKey>(entries: T[]): T[] {
  return [...entries].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
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
    await writeSplitBaseline(next);
    console.log(
      `Wrote ${path.relative(ROOT_DIR, BASELINE_DIR)}/: ${next.length} baselined wide call mismatches`,
    );
    return 0;
  }

  const { added, stale } = diffAgainstBaseline(current, baseline);

  if (added.length === 0 && stale.length === 0) {
    console.log(`wide call-mismatches ratchet: OK (${baseline.length} baselined)`);
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

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const code = await main(process.argv.includes("--write"));
  process.exit(code);
}

void runAsScript();
