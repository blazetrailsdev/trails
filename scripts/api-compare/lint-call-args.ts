#!/usr/bin/env npx tsx
/**
 * Ratcheting gate for the call-ARGUMENT parity dimension (RFC 0095).
 *
 * `parity:api:calls` compares the SET OF CALL NAMES a ported body makes, so a body can
 * call `where` where Rails calls `where`, hand it a completely different
 * argument list, and stay green. This gate ratchets
 * output/call-arg-mismatches.json — written by compare.ts under `--calls`.
 *
 * Same only-shrink contract as lint-call-mismatches.ts, which is the template
 * throughout: the baseline lists the currently-known mismatches keyed by
 * `package + tsFile + rubyName + call + rubyArgs`, each with a one-line
 * `reason`, and CI fails on a NEW mismatch absent from it (the ratchet) or a
 * STALE entry that no longer flags (only-shrink — a converged call site must be
 * REMOVED). Rows live in the EXISTING call-mismatches-exclude/ shards next to
 * the call-set rows for the same source file, discriminated by `kind: "args"`;
 * each gate filters the shard to its own kind, and the two only-shrink arms
 * stay independent — an args row going stale never reds the call-set gate.
 *
 * Per RFC 0095 §4 the gate ratchets `shape` rows only — argument count, order,
 * literal values, kwarg keys. `naming` rows (differing only in how a `ref:`
 * identifier is spelled) are the local/parameter-identifier dimension surfacing
 * through the argument comparison rather than an argument defect, and are never
 * baselined. They are gated per package instead (RFC 0153): in a package listed
 * in {@link NAMING_ENROLLED_PACKAGES}, every differing identifier is renamed
 * away or carries an `@missingRailsName` receipt, and a receipt is legal only
 * on a pair `classifyPair` files as permanent. Elsewhere they are report-only.
 *
 * A plain gating run first regenerates the artifact itself by shelling out to
 * `pnpm parity:api --calls` (see gate-regen.ts): gating a stale artifact is
 * what makes a sibling PR's deleted method surface as a STALE row on a branch
 * that never touched it. CI opts out — it runs the extraction step separately
 * and must not pay for it twice. The regeneration is FORCED (RFC 0106) — a
 * cached one is a PARTIAL one, and a partly-cached artifact both invents rows
 * and hides real ones — and when it is opted out of, the gate REFUSES to run
 * against an artifact older than the compared sources.
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
import { TAG as ARGS_TAG } from "./missing-rails-args-tags.js";
import { TAG as NAME_TAG } from "./missing-rails-name-tags.js";
import { NAMING_CLASSES, classifyPair, refName } from "./naming-taxonomy.js";
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
import {
  type CallMismatchKey as CallMismatchKeyed,
  missingScope,
  rowsOfKind,
} from "./call-mismatch-baseline.js";
import {
  listJsonFiles,
  reportEmptyBaselines,
  reportNonCanonicalBaselines,
} from "./baseline-json.js";
import {
  NO_REGEN_FLAG,
  artifactIsStale,
  regenerateArtifact,
  shouldRegenerate,
  staleArtifactMessage,
} from "./gate-regen.js";
import {
  BASELINE_DIR,
  loadBaseline as loadCallSetRows,
  relPathFor,
  writeSplitBaseline,
} from "./lint-call-mismatches.js";
import {
  type TsApi,
  parseTop,
  renderReport,
  thisTypedFunctionsByPackage,
} from "./report-call-args.js";

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-arg-mismatches.json");
const TS_API_PATH = path.join(OUTPUT_DIR, "ts-api.json");

/**
 * The packages whose `naming` rows are gated (RFC 0153 §2). Only-grow, like
 * `GATED_PACKAGES` in extra-surface-mark.ts: a package joins in the PR that
 * renamed its convergeable rows away and receipted its permanent ones, and is
 * never removed to turn a red run green.
 */
export const NAMING_ENROLLED_PACKAGES: readonly string[] = [
  "activerecord-test-support",
  "globalid",
  "i18n",
];

export interface NamingFinding {
  package: string;
  tsFile: string;
  tsName: string;
  call: string;
  /** The Ruby identifier at issue; absent for a row with no differing `ref:` pair. */
  identifier?: string;
  problem: "unreceipted" | "receipt-on-convergeable" | "stale-receipt";
}

/**
 * Every naming-gate failure in the enrolled packages. The receipt check
 * classifies with the package's `thisTypedFunctions` — the mixin-aware arm — so
 * a `module-mixin-call` receipt is never rejected as `burndown`.
 */
export function namingFindings(
  artifact: CallArgArtifact,
  thisTyped: ReadonlyMap<string, ReadonlySet<string>>,
  enrolled: readonly string[] = NAMING_ENROLLED_PACKAGES,
): NamingFinding[] {
  const permanent = new Set(NAMING_CLASSES.filter((c) => c.permanent).map((c) => c.name));
  const out: NamingFinding[] = [];
  for (const m of artifact.mismatches) {
    if (m.class !== "naming" || !enrolled.includes(m.package)) continue;
    const at = { package: m.package, tsFile: m.tsFile, tsName: m.tsName, call: m.call };
    let pairs = 0;
    for (let i = 0; i < Math.max(m.rubyArgs.length, m.tsArgs.length); i++) {
      const r = refName(m.rubyArgs[i] ?? "");
      const t = refName(m.tsArgs[i] ?? "");
      if (r === undefined || t === undefined || r === t) continue;
      pairs++;
      if (!m.receipts?.includes(r)) {
        out.push({ ...at, identifier: r, problem: "unreceipted" });
      } else if (!permanent.has(classifyPair(r, t, thisTyped.get(m.package)))) {
        out.push({ ...at, identifier: r, problem: "receipt-on-convergeable" });
      }
    }
    if (pairs === 0) out.push({ ...at, problem: "unreceipted" });
  }
  for (const t of artifact.staleNameTags ?? []) {
    if (!enrolled.includes(t.package)) continue;
    out.push({
      package: t.package,
      tsFile: t.tsFile,
      tsName: t.tsName,
      call: t.call,
      identifier: t.call,
      problem: "stale-receipt",
    });
  }
  return out;
}

export function renderNamingFindings(findings: NamingFinding[]): string {
  return [
    `\ncall-args naming gate: ${findings.length} failure(s) in NAMING_ENROLLED_PACKAGES.`,
    "Rename the TS identifier to the Rails one (camelCased). A pair no rename can close takes " +
      `\`${NAME_TAG} <ruby_identifier> — PERMANENT\` on the enclosing declaration; a receipt on ` +
      "a convergeable pair is rejected, and a receipt matching no row must be deleted.\n",
    ...findings.map(
      (f) =>
        `  ${f.problem}  ${f.package}  ${f.tsFile}  ${f.tsName}  ${f.call}` +
        (f.identifier !== undefined ? `  (${f.identifier})` : ""),
    ),
  ].join("\n");
}

export const DEFAULT_REASON = "TODO: unreviewed — replace with a one-line justification";

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf-8")) as T;
}

/** This gate's rows — the `kind: "args"` half of the shared shards; the
 *  call-set rows in the same files would read as stale here. @internal */
export async function loadBaseline(dir: string = BASELINE_DIR): Promise<CallArgExcludeEntry[]> {
  const files = (await listJsonFiles(dir)).sort();
  const merged: CallMismatchKeyed[] = [];
  for (const f of files) merged.push(...(await readJson<CallMismatchKeyed[]>(f)));
  return sortKeys(rowsOfKind(merged, "args") as CallArgExcludeEntry[]);
}

async function loadArtifact(): Promise<CallArgArtifact> {
  const exists = await fs.access(ARTIFACT_PATH).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, ARTIFACT_PATH)} — run \`pnpm parity:api --calls\` ` +
        "first to write it.",
    );
  }
  return readJson<CallArgArtifact>(ARTIFACT_PATH);
}

export function renderKey(k: CallArgKey): string {
  return `${k.package}  ${k.tsFile}  ${k.rubyName}  ${k.call}(${k.rubyArgs.join(", ")})`;
}

export async function main(write: boolean): Promise<number> {
  const artifact = await loadArtifact();
  const current: CallArgKey[] = gatedRows(artifact);
  const namingRows = artifact.mismatches.length - current.length;

  // Determinism guard (RFC 0044): an artifact covering fewer packages than CI
  // must neither seed nor pass a gate. Shared with the call-set ratchet.
  const absent = missingScope({ packages: artifact.packages, mismatches: [] });
  if (absent.length > 0) {
    console.error(
      `\ncall-args ratchet: artifact compared a PARTIAL scope — missing ` +
        `${absent.length} package(s): ${absent.join(", ")}.\n` +
        "It covers fewer packages than CI (an unfetched vendor source, a " +
        "`--package`-filtered run, or a stale artifact); reseeding or gating " +
        "from it would desync local vs CI. Regenerate the full surface:\n" +
        "  API_COMPARE_FORCE=1 pnpm parity:api --calls\n",
    );
    return 1;
  }

  if (write) {
    const next = reseed(current, await loadBaseline(), DEFAULT_REASON);
    // The call-set rows share these shards and are not this gate's to rewrite.
    await writeSplitBaseline([...next, ...(await loadCallSetRows())], BASELINE_DIR);
    console.log(
      `Wrote ${path.relative(ROOT_DIR, BASELINE_DIR)}/: ${next.length} baselined call-argument ` +
        `mismatch(es) (shape only; ${namingRows} naming row(s) are never baselined)`,
    );
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

  const files = await listJsonFiles(BASELINE_DIR);
  if (await reportNonCanonicalBaselines(files, "call-args ratchet")) return 1;
  if (await reportEmptyBaselines(files, "call-args ratchet")) return 1;

  const { added, stale } = diffAgainstBaseline(current, baseline);
  const staleTags = artifact.staleTags ?? [];
  if (staleTags.length > 0) console.error(renderStaleTags(staleTags));
  const api = await readJson<TsApi>(TS_API_PATH);
  const naming = namingFindings(artifact, thisTypedFunctionsByPackage(api));
  if (naming.length > 0) console.error(renderNamingFindings(naming));
  if (added.length === 0 && stale.length === 0 && staleTags.length === 0 && naming.length === 0) {
    console.log(
      `call-args ratchet: OK (${baseline.length} baselined shape row(s); naming gated in ` +
        `${NAMING_ENROLLED_PACKAGES.join(", ")})`,
    );
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

/** The STALE-tag half of the only-shrink contract: a call-site
 *  `@missingRailsArgs` receipt that suppresses nothing any more. A
 *  justification only shrinks, exactly like a baseline row. */
export function renderStaleTags(staleTags: NonNullable<CallArgArtifact["staleTags"]>): string {
  return [
    `\ncall-args ratchet: ${staleTags.length} STALE ${ARGS_TAG} tag(s) whose call site no ` +
      "longer flags.",
    "The TS call site now passes what Rails passes, so delete the tag from its JSDoc block.\n",
    ...staleTags.map((t) => `  - ${t.package}  ${t.tsFile}  ${t.tsName}  ${t.call}`),
  ].join("\n");
}

/** `--report`: the whole artifact, `naming` included — the excluded class is
 *  reachable only here. Never fails. */
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
  } else if (await artifactIsStale(ARTIFACT_PATH)) {
    console.error(staleArtifactMessage("call-args ratchet", ARTIFACT_PATH));
    process.exit(2);
  }
  process.exit(await main(argv.includes("--write")));
}

void runAsScript();
