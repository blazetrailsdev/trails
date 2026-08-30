#!/usr/bin/env npx tsx
/**
 * Read-only arm-parity report over the skeleton artifact (RFC 0113 Phase 1),
 * mirroring the shape of `report-call-args.ts --report`.
 *
 *   pnpm tsx scripts/api-compare/report-arms.ts --report [--top=N]
 *
 * Reads output/call-skeletons.json, which compare.ts writes for EVERY compared
 * (Ruby, TS) pair under `--calls`. Report-only and staying that way until
 * `measure-arm-mismatch-noise-floor` has a figure: nothing gates, no baseline is
 * seeded, and call-mismatches.json / call-arg-mismatches.json and their two
 * ratchets read exactly what they read before.
 */
import * as path from "path";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";

import { parseTop, section, tally } from "./lint-call-mismatches.js";

export { parseTop };

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-skeletons.json");

/** One row of output/call-skeletons.json (compare.ts:CallSkeleton, plus the
 *  package the flattening writer prefixes onto it). */
export interface SkeletonRow {
  package: string;
  rubyFile: string;
  rubyName: string;
  tsFile: string;
  tsName: string;
  ruby: string[];
  ts: string[];
}

export interface SkeletonArtifact {
  packages: string[];
  skeletons: SkeletonRow[];
}

/**
 * The skeleton stream's CONTROL tokens — the arms. Both extractors emit exactly
 * these four (`extract-ruby-api.rb:2382-2429`, `extract-ts-api.ts:3064-3091`);
 * everything else in a stream is a `ref:<name>` / `new:<Ctor>` reach.
 */
export const CONTROL_TOKENS: ReadonlySet<string> = new Set(["if", "loop", "try", "throw"]);

/**
 * THE MERGE RULE (RFC 0113 open question 3, decided here): project each stream
 * onto its control tokens, then take the multiset difference; only when the two
 * multisets agree does the ORDER of the projection decide. So a pair is
 * `count` (the multisets differ — arms Rails has that the port does not, or the
 * reverse) or `order` (same arms, different sequence), and never both, which is
 * what lets this RFC's `missing-arm` / `invented-arm` and `arm-order` clusters
 * burn down separately.
 *
 * The two rejected options, and why:
 *
 * - **Strict sequence equality over the whole stream.** The interleaved `ref:`
 *   reaches are already the population of RFC 0084 and RFC 0095, so including
 *   them re-reports that debt here and buries the arm signal under it. Worse,
 *   they arrive here with none of the forgiveness the call gate applies to
 *   them: `effectiveTsCalls`' same-file-helper and delegate unions are set
 *   operations that a sequence cannot take, so a faithful port that merely
 *   extracts a helper — the single most common false positive the call gate was
 *   built to absorb — would flag on every one of its moved reaches.
 * - **Multiset equality over the whole stream plus a `reordered` verdict** (the
 *   retired prism-codegen scorer's `matched` / `reordered` split, and
 *   `catalog.ts:skeletonDiff`'s two-directional difference). The verdict split
 *   is the good half and is kept; taking it over the reaches as well is the
 *   same contamination — one call reach moved past another reports as
 *   `arm-order` when no arm moved at all.
 * - **Control-token SUBSEQUENCE only** (option 3 as literally posed). Right
 *   projection, wrong comparison: a subsequence test is directional, so it
 *   answers "does the port contain Rails' arms" and collapses an invented arm
 *   into a pass, or — run the other way — collapses a missing one. This RFC's
 *   clusters need those told apart, so the multiset difference is taken in both
 *   directions instead.
 *
 * Predicate semantics are NOT compared, per this RFC's Non-goals: an `if` is an
 * `if` regardless of what it tests, which is what keeps this out of RFC 0108's
 * territory.
 */
export type ArmVerdict = "count" | "order";

export interface ArmMismatch extends SkeletonRow {
  kind: ArmVerdict;
  /** The projections the verdict was taken over. */
  rubyArms: string[];
  tsArms: string[];
  /** Multiset difference, both directions — empty on an `order` row. */
  missing: string[];
  invented: string[];
}

export function controlArms(skeleton: readonly string[]): string[] {
  return skeleton.filter((token) => CONTROL_TOKENS.has(token));
}

/** The multiset difference `a - b`, in `a`'s own order. */
function multisetDifference(a: readonly string[], b: readonly string[]): string[] {
  const remaining = new Map<string, number>();
  for (const token of b) remaining.set(token, (remaining.get(token) ?? 0) + 1);
  const out: string[] = [];
  for (const token of a) {
    const n = remaining.get(token) ?? 0;
    if (n > 0) remaining.set(token, n - 1);
    else out.push(token);
  }
  return out;
}

/** The verdict for one pair, or undefined when its arms agree exactly. */
export function compareArms(row: SkeletonRow): ArmMismatch | undefined {
  const rubyArms = controlArms(row.ruby);
  const tsArms = controlArms(row.ts);
  const missing = multisetDifference(rubyArms, tsArms);
  const invented = multisetDifference(tsArms, rubyArms);
  if (missing.length > 0 || invented.length > 0) {
    return { ...row, kind: "count", rubyArms, tsArms, missing, invented };
  }
  if (rubyArms.join(" ") === tsArms.join(" ")) return undefined;
  return { ...row, kind: "order", rubyArms, tsArms, missing: [], invented: [] };
}

/** The RFC 0113 cluster a `count` row belongs to; an `order` row is `arm-order`. */
export function cluster(row: ArmMismatch): string {
  if (row.kind === "order") return "arm-order";
  if (row.missing.length > 0 && row.invented.length > 0) return "missing-arm + invented-arm";
  return row.missing.length > 0 ? "missing-arm" : "invented-arm";
}

function pairLine(row: ArmMismatch): string {
  const delta = [
    ...row.missing.map((t) => `-${t}`),
    ...row.invented.map((t) => `+${t}`),
    ...(row.kind === "order" ? [`${row.rubyArms.join(" ")} -> ${row.tsArms.join(" ")}`] : []),
  ].join(" ");
  return `${row.package}/${row.tsFile}#${row.tsName}  ${row.kind}  ${delta}`;
}

export function renderReport(artifact: SkeletonArtifact, top: number): string {
  const rows = artifact.skeletons.flatMap((s) => compareArms(s) ?? []);
  const files = new Set(rows.map((r) => `${r.package} ${r.tsFile}`)).size;
  return [
    `call-skeleton arms report: ${rows.length} mismatched pair(s) across ${files} file(s), ` +
      `${artifact.skeletons.length} pair(s) compared` +
      " — report-only, nothing gates on this (RFC 0113)",
    section(
      "By verdict",
      tally(rows, (r) => r.kind),
    ),
    section(
      "By cluster",
      tally(rows, (r) => cluster(r)),
    ),
    section(
      "By package",
      tally(rows, (r) => r.package),
    ),
    section(
      "By file",
      tally(rows, (r) => `${r.package}/${r.tsFile}`),
      top,
    ),
    section(
      "Missing arms by token",
      tally(
        rows.flatMap((r) => r.missing),
        (t) => t,
      ),
    ),
    section(
      "Invented arms by token",
      tally(
        rows.flatMap((r) => r.invented),
        (t) => t,
      ),
    ),
    section(
      "Mismatched pairs",
      rows.map((r): [string, number] => [pairLine(r), r.missing.length + r.invented.length]),
      top,
    ),
  ].join("\n");
}

async function reportMain(top: number): Promise<number> {
  let artifact: SkeletonArtifact;
  try {
    artifact = JSON.parse(await readFile(ARTIFACT_PATH, "utf8")) as SkeletonArtifact;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    console.error(
      `call-skeleton arms report: ${path.relative(ROOT_DIR, ARTIFACT_PATH)} is missing — ` +
        "run `pnpm parity:api --calls` first.",
    );
    return 2;
  }
  console.log(renderReport(artifact, top));
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const argv = process.argv.slice(2);
  if (!argv.includes("--report")) {
    console.error(
      "call-skeleton arms: the only mode is `--report` (RFC 0113 Phase 1 is advisory).",
    );
    process.exit(2);
  }
  let top: number;
  try {
    top = parseTop(argv, 20);
  } catch (e) {
    console.error(`call-skeleton arms report: ${(e as Error).message}`);
    process.exit(2);
  }
  process.exit(await reportMain(top));
}

void runAsScript();
