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
import type { CallSkeleton } from "./compare.js";

import { parseTop, section, tally } from "./lint-call-mismatches.js";

export { parseTop };

const ARTIFACT_PATH = path.join(OUTPUT_DIR, "call-skeletons.json");

/** One row of output/call-skeletons.json: a {@link CallSkeleton} plus the
 *  package the flattening writer prefixes onto it (compare.ts:skeletonsFlat). */
export interface SkeletonRow extends CallSkeleton {
  package: string;
}

export interface SkeletonArtifact {
  packages: string[];
  skeletons: SkeletonRow[];
}

/**
 * The skeleton stream's CONTROL tokens — the arms. Both extractors emit exactly
 * these five (`extract-ruby-api.rb#walk_for_skeleton`,
 * `extract-ts-api.ts#extractSkeleton`); everything else in a stream is a
 * `ref:<name>` / `new:<Ctor>` reach. `rescue` is the per-CLAUSE arm of a
 * `begin`/`rescue` chain, sitting after the `try` its `:bodystmt` emits, so a
 * two-clause Ruby `rescue` reads against the two `instanceof` arms of its TS
 * `catch` rather than against one opaque `try` apiece.
 */
export const CONTROL_TOKENS: ReadonlySet<string> = new Set([
  "if",
  "loop",
  "try",
  "rescue",
  "throw",
]);

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
 *   operations that a sequence cannot take WHOLE, so a faithful port that merely
 *   extracts a helper — the single most common false positive the call gate was
 *   built to absorb — would flag on every one of its moved reaches. The
 *   same-file half of that forgiveness IS taken here, at the reach rather than
 *   over the stream: see {@link spliceHelperSkeletons}.
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

/**
 * `skeleton` with every `ref:<helper>` reach that resolves to a SAME-FILE
 * method replaced, in place, by that method's own skeleton — the sequence
 * analogue of the union `effectiveTsCalls` (`compare.ts`) already takes over
 * call SETS, and taken on the same terms: only a same-file reach splices, so a
 * cross-file delegation still cannot credit an arm, and the resolution itself
 * was done by compare.ts (`sameFileHelperSkeletons`), which owns the
 * per-(file, name) scoping.
 *
 * `ArmVerdict`'s rejected option 1 rejected a union over the WHOLE stream
 * because a set operation cannot be taken over a sequence. It can be taken at
 * the reach: the splice is positional, so the `order` verdict survives it. Once
 * per reach and one hop deep — the spliced skeletons carry their own reaches
 * unresolved, so mutual recursion terminates by construction.
 *
 * Resolved as an OWN property: a reach is a method name, so `ref:constructor`
 * and `ref:toString` would otherwise resolve against Object.prototype.
 */
export function spliceHelperSkeletons(
  skeleton: readonly string[],
  sameFileSkeletons: Readonly<Record<string, readonly string[]>> | undefined,
): string[] {
  if (sameFileSkeletons === undefined) return [...skeleton];
  const out: string[] = [];
  for (const token of skeleton) {
    const name = token.startsWith("ref:") ? token.slice("ref:".length) : undefined;
    const helper =
      name !== undefined && Object.hasOwn(sameFileSkeletons, name)
        ? sameFileSkeletons[name]
        : undefined;
    if (helper === undefined) out.push(token);
    else out.push(...helper);
  }
  return out;
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

function armVerdict(row: SkeletonRow, ruby: readonly string[], ts: readonly string[]) {
  const rubyArms = controlArms(ruby);
  const tsArms = controlArms(ts);
  const missing = multisetDifference(rubyArms, tsArms);
  const invented = multisetDifference(tsArms, rubyArms);
  if (missing.length > 0 || invented.length > 0) {
    return { ...row, kind: "count" as const, rubyArms, tsArms, missing, invented };
  }
  if (rubyArms.join(" ") === tsArms.join(" ")) return undefined;
  return { ...row, kind: "order" as const, rubyArms, tsArms, missing: [], invented: [] };
}

/**
 * The verdict for one pair, or undefined when its arms agree exactly.
 *
 * Taken TWICE: once over the two bodies' own streams, and — only if that
 * flagged — again over the streams with their same-file helpers spliced in
 * ({@link spliceHelperSkeletons}). The splice can only DISCHARGE a flag, never
 * raise one, which is the contract `effectiveTsCalls`' union carries by being a
 * set union: unioning a helper's calls in can satisfy a Rails call the body
 * omitted but can never invent one. A sequence splice has no such guarantee —
 * it charges the helper's own arms to every caller, so one divergent helper
 * would report once on its own row and again on each of its callers — so the
 * one-directional reading is imposed here instead. The verdict reported is the
 * body's OWN, for the same reason: the helper's divergence is the helper row's.
 */
export function compareArms(row: SkeletonRow): ArmMismatch | undefined {
  const plain = armVerdict(row, row.ruby, row.ts);
  if (plain === undefined) return undefined;
  const spliced = armVerdict(
    row,
    spliceHelperSkeletons(row.ruby, row.rubyHelpers),
    spliceHelperSkeletons(row.ts, row.tsHelpers),
  );
  return spliced === undefined ? undefined : plain;
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

/**
 * A seeded 32-bit PRNG (mulberry32), so a stated `--seed` reproduces the exact
 * sample a later reader has to be able to re-draw. `Math.random()` cannot: the
 * audit's per-row verdicts are only checkable against the rows they were taken
 * over.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `size` rows drawn uniformly without replacement from the mismatch population,
 * under `seed`. The population is sorted first so the draw does not inherit the
 * artifact's own row order, which moves with extraction.
 */
export function sampleRows(
  rows: readonly ArmMismatch[],
  size: number,
  seed: number,
): ArmMismatch[] {
  const pool = [...rows].sort((a, b) =>
    `${a.package}/${a.tsFile}#${a.tsName}`.localeCompare(`${b.package}/${b.tsFile}#${b.tsName}`),
  );
  const random = mulberry32(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

export function renderSample(artifact: SkeletonArtifact, size: number, seed: number): string {
  const rows = artifact.skeletons.flatMap((s) => compareArms(s) ?? []);
  const drawn = sampleRows(rows, size, seed);
  return [
    `call-skeleton arms sample: ${drawn.length} of ${rows.length} mismatched pair(s), seed ${seed}`,
    ...drawn.map((r, i) =>
      [
        ``,
        `[${i + 1}] ${pairLine(r)}`,
        `    ruby ${r.rubyFile}#${r.rubyName}`,
        `    ruby-skeleton ${r.ruby.join(" ")}`,
        `    ts-skeleton   ${r.ts.join(" ")}`,
      ].join("\n"),
    ),
  ].join("\n");
}

async function readArtifact(): Promise<SkeletonArtifact | undefined> {
  try {
    return JSON.parse(await readFile(ARTIFACT_PATH, "utf8")) as SkeletonArtifact;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    console.error(
      `call-skeleton arms report: ${path.relative(ROOT_DIR, ARTIFACT_PATH)} is missing — ` +
        "run `pnpm parity:api --calls` first.",
    );
    return undefined;
  }
}

async function reportMain(top: number): Promise<number> {
  const artifact = await readArtifact();
  if (artifact === undefined) return 2;
  console.log(renderReport(artifact, top));
  return 0;
}

async function sampleMain(size: number, seed: number): Promise<number> {
  const artifact = await readArtifact();
  if (artifact === undefined) return 2;
  console.log(renderSample(artifact, size, seed));
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const argv = process.argv.slice(2);
  const sampleArg = argv.find((a) => a.startsWith("--sample="));
  if (sampleArg !== undefined) {
    const size = Number(sampleArg.slice("--sample=".length));
    const seedArg = argv.find((a) => a.startsWith("--seed="));
    const seed = seedArg === undefined ? 0 : Number(seedArg.slice("--seed=".length));
    if (!Number.isInteger(size) || size <= 0 || !Number.isInteger(seed)) {
      console.error("call-skeleton arms sample: --sample=N and --seed=S take integers.");
      process.exit(2);
    }
    process.exit(await sampleMain(size, seed));
  }
  if (!argv.includes("--report")) {
    console.error(
      "call-skeleton arms: the modes are `--report` and `--sample=N [--seed=S]` " +
        "(RFC 0113 Phase 1 is advisory).",
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
