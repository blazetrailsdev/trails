#!/usr/bin/env npx tsx
/**
 * Ratcheting gate for the call-ARGUMENT parity dimension (RFC 0095).
 *
 * `api:calls` compares the SET OF CALL NAMES a ported body makes, so a body can
 * call `where` where Rails calls `where`, hand it a completely different
 * argument list, and stay green. This gate ratchets
 * output/call-arg-mismatches.json — written by compare.ts under `--calls`.
 *
 * Same only-shrink contract as lint-call-mismatches.ts, which is the template
 * throughout: a committed baseline lists the currently-known mismatches keyed
 * by `package + tsFile + rubyName + call + rubyArgs`, each with a one-line
 * `reason`, and CI fails on a NEW mismatch absent from it (the ratchet) or a
 * STALE entry that no longer flags (only-shrink — a converged call site must be
 * REMOVED). The baseline is its own tree, call-mismatches-args-exclude/,
 * sharded per source file (`<package>/<tsFile .ts→.json>`) so the
 * merge-conflict boundary matches the unit of work; it cannot fold into
 * call-mismatches-exclude/, and call-args-baseline.ts says why.
 *
 * Per RFC 0095 §4 the gate ratchets `shape` rows only — argument count, order,
 * literal values, kwarg keys. `naming` rows (differing only in how a `ref:`
 * identifier is spelled) are the local/parameter-identifier dimension surfacing
 * through the argument comparison rather than an argument defect; they stay
 * report-only, reachable through `--report`, until RFC 0096 drains them.
 *
 * ── Before the seed ─────────────────────────────────────────────────────────
 * The baseline is seeded by its own `main`-only PR (RFC 0095
 * `call-args-baseline-seed`), AFTER this gate lands — a seed generated on a
 * branch drifts from what CI measures. Until then the tree does not exist, and
 * an absent tree is reported as UNSEEDED and exits 0 rather than failing every
 * PR on the merge train with the whole population. The arm is self-closing: the
 * moment the seed lands every arm below is live. An EMPTY tree is not the same
 * thing — a fully converged dimension is a real state and stays gated.
 *
 * A plain gating run first regenerates the artifact itself by shelling out to
 * `pnpm api:compare --calls` (see gate-regen.ts): gating a stale artifact is
 * what makes a sibling PR's deleted method surface as a STALE row on a branch
 * that never touched it. CI opts out — it runs the extraction step separately
 * and must not pay for it twice.
 *
 * Usage: no flag gates (CI); `--write` reseeds; `--report` groups read-only;
 * `--no-regen` gates the artifact already on disk.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-call-mismatches.ts), async fs.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";
import {
  type CallArgArtifact,
  type CallArgExcludeEntry,
  type CallArgKey,
  diffAgainstBaseline,
  findDuplicateKeys,
  gatedRows,
  reseed,
  sortKeys,
} from "./call-args-baseline.js";
import { missingScope } from "./call-mismatch-baseline.js";
import {
  listJsonFiles,
  pruneEmptyDirs,
  reportNonCanonicalBaselines,
  serializeBaseline,
} from "./baseline-json.js";
import { NO_REGEN_FLAG, regenerateArtifact, shouldRegenerate } from "./gate-regen.js";
import { relPathFor } from "./lint-call-mismatches.js";
import { parseTop, renderReport } from "./report-call-args.js";

const BASELINE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "call-mismatches-args-exclude",
);

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-arg-mismatches.json");

/** The seed string a `--write` writes for a row nobody has reviewed yet. */
export const DEFAULT_REASON = "TODO: unreviewed — replace with a one-line justification";

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf-8")) as T;
}

/** The committed baseline, merged across its split files. @internal */
export async function loadBaseline(dir: string = BASELINE_DIR): Promise<CallArgExcludeEntry[]> {
  const files = (await listJsonFiles(dir)).sort();
  const merged: CallArgExcludeEntry[] = [];
  for (const f of files) merged.push(...(await readJson<CallArgExcludeEntry[]>(f)));
  return sortKeys(merged);
}

/** Whether the baseline tree exists at all — see the UNSEEDED arm in the header. */
export async function baselineSeeded(dir: string = BASELINE_DIR): Promise<boolean> {
  return fs.access(dir).then(
    () => true,
    () => false,
  );
}

/** Repartition the reseeded baseline across the split files: one sorted array
 *  per (package, tsFile), creating files for newly-flagged sources and DELETING
 *  a file (plus any emptied parent dirs) once all its rows converge, so a
 *  post-reseed git diff shows only real baseline changes. */
export async function writeSplitBaseline(
  entries: CallArgExcludeEntry[],
  dir: string = BASELINE_DIR,
): Promise<void> {
  const byFile = new Map<string, CallArgExcludeEntry[]>();
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

  for (const rel of existing) await fs.rm(path.join(dir, rel));
  await pruneEmptyDirs(dir);
}

async function loadArtifact(): Promise<CallArgArtifact> {
  const exists = await fs.access(ARTIFACT_PATH).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, ARTIFACT_PATH)} — run \`pnpm api:compare --calls\` ` +
        "first to write it.",
    );
  }
  return readJson<CallArgArtifact>(ARTIFACT_PATH);
}

export function renderKey(k: CallArgKey): string {
  return `${k.package}  ${k.tsFile}  ${k.rubyName}  ${k.call}(${k.rubyArgs.join(", ")})`;
}

export function renderUnseeded(rows: CallArgKey[], dir: string): string {
  return (
    `call-args ratchet: UNSEEDED — ${path.relative(ROOT_DIR, dir)}/ does not exist yet, ` +
    `so the ${rows.length} flagged shape row(s) are reported, not gated.\n` +
    "The baseline is seeded on `main` by its own PR (RFC 0095 call-args-baseline-seed); " +
    "this arm disappears the moment that tree exists."
  );
}

export async function main(write: boolean): Promise<number> {
  const artifact = await loadArtifact();
  const current: CallArgKey[] = gatedRows(artifact);

  // Determinism guard (RFC 0044): an artifact covering fewer packages than CI
  // must neither seed nor pass a gate. Shared with the call-set ratchet — the
  // check reads only the `packages` field both artifacts carry.
  const absent = missingScope({ packages: artifact.packages, mismatches: [] });
  if (absent.length > 0) {
    console.error(
      `\ncall-args ratchet: artifact compared a PARTIAL scope — missing ` +
        `${absent.length} package(s): ${absent.join(", ")}.\n` +
        "It covers fewer packages than CI (an unfetched vendor source, a " +
        "`--package`-filtered run, or a stale artifact); reseeding or gating " +
        "from it would desync local vs CI. Regenerate the full surface:\n" +
        "  API_COMPARE_FORCE=1 pnpm api:compare --calls\n",
    );
    return 1;
  }

  if (write) {
    const next = reseed(current, await loadBaseline(), DEFAULT_REASON);
    await writeSplitBaseline(next);
    console.log(
      `Wrote ${path.relative(ROOT_DIR, BASELINE_DIR)}/: ${next.length} baselined call-argument ` +
        `mismatch(es) (shape only; ${artifact.mismatches.length - current.length} naming row(s) ` +
        "are report-only)",
    );
    return 0;
  }

  if (!(await baselineSeeded())) {
    console.log(renderUnseeded(current, BASELINE_DIR));
    return 0;
  }

  const baseline = await loadBaseline();

  const dups = findDuplicateKeys(baseline);
  if (dups.length > 0) {
    console.error(
      `\ncall-args ratchet: ${dups.length} duplicate baseline key(s):\n` +
        dups.map((d) => `  ${d}`).join("\n"),
    );
    return 1;
  }

  if (await reportNonCanonicalBaselines(await listJsonFiles(BASELINE_DIR), "call-args ratchet")) {
    return 1;
  }

  const { added, stale } = diffAgainstBaseline(current, baseline);
  if (added.length === 0 && stale.length === 0) {
    console.log(`call-args ratchet: OK (${baseline.length} baselined shape row(s))`);
    return 0;
  }

  if (added.length > 0) {
    console.error(`\ncall-args ratchet: ${added.length} NEW call-argument mismatch(es).`);
    console.error(
      "A ported TS call site passes a different argument list than Rails' — a different " +
        "count, order, literal value or kwarg key. Pass what Rails passes, or — if the " +
        "deviation is justified — add it (with a one-line reason) to its per-source " +
        `baseline file under\n  ${path.relative(ROOT_DIR, BASELINE_DIR)}/  ` +
        "(<package>/<tsFile .ts→.json>).\n",
    );
    for (const k of sortKeys(added)) console.error(`  + ${renderKey(k)}  (${relPathFor(k)})`);
  }

  if (stale.length > 0) {
    console.error(
      `\ncall-args ratchet: ${stale.length} STALE baseline entr(ies) that no longer flag.`,
    );
    console.error(
      "The baseline only shrinks. Delete the converged row(s) by hand — do NOT `--write`, " +
        "which rewrites the whole tree and buries the one row you meant to retire:\n",
    );
    for (const e of sortKeys(stale)) console.error(`  - ${renderKey(e)}`);
  }

  return 1;
}

/** `--report`: the whole artifact, `naming` rows included — the class the gate
 *  excludes is only reachable here. Never fails. */
async function reportMain(top: number): Promise<number> {
  console.log(renderReport(await loadArtifact(), top));
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const argv = process.argv.slice(2);
  if (argv.includes("--report")) {
    let top: number;
    try {
      top = parseTop(argv, 20);
    } catch (e) {
      console.error(`call-args report: ${(e as Error).message}`);
      process.exit(2);
    }
    process.exit(await reportMain(top));
  }
  if (shouldRegenerate(argv, process.env)) {
    console.log("Regenerating output/call-arg-mismatches.json (compare.ts --calls)…");
    try {
      await regenerateArtifact(process.env, ["--calls"]);
    } catch (e) {
      console.error(
        `\ncall-args ratchet: could not regenerate the artifact: ${(e as Error).message}\n` +
          `Re-run with ${NO_REGEN_FLAG} to gate against the artifact already on disk.\n`,
      );
      process.exit(2);
    }
  }
  process.exit(await main(argv.includes("--write")));
}

void runAsScript();
