/**
 * Only-shrink counter for UNREVIEWED wide-ratchet baseline entries (RFC 0083).
 *
 * The wide call-mismatch ratchet (lint-call-mismatches-wide.ts) counts ENTRIES:
 * it moves only when a call converges and the row disappears. But 92.7% of the
 * baseline still carries the verbatim `DEFAULT_REASON` seed written when the
 * ratchet landed — those rows have never been looked at, and an agent who reads
 * one and writes a real reason for it makes no measurable progress against the
 * entry ratchet.
 *
 * This is the second ratchet: a committed high-water mark on the number of
 * entries whose `reason` is still the seed string. Replacing a seeded reason
 * with a reviewed one lowers the count; `--write` lowers the mark to match and
 * never raises it.
 *
 * ── The mark is SHARDED, one file per source ────────────────────────────────
 * It is not one number: it mirrors the split exclude baseline exactly, at
 * `call-mismatches-wide-unreviewed/<package>/<tsFile with .ts→.json>`, each
 * file holding `{"max": N}` for that ONE source file. A single repo-wide
 * `{"max": N}` made every PR that reviewed a reason rewrite the same file, so
 * any two concurrent PRs conflicted on it — a serialization point for the whole
 * repo. Sharded, a PR converging relation.ts touches only relation.json's mark.
 *
 * Every rule below binds PER FILE: each source's count is compared against its
 * own mark, `--write` lowers each mark independently, and a source whose mark
 * reaches 0 has its file deleted rather than left as `{"max": 0}` (same rule as
 * the exclude tree, so a post-reseed diff shows only real changes). The
 * aggregate the gate reports is the SUM of the shards.
 *
 * ── Why newly-seeded rows are held out ──────────────────────────────────────
 * A reseed gives every genuinely-new mismatch the default reason. If those
 * counted toward the lowered mark, an agent could reseed a batch of fresh
 * unreviewed rows into the mark and the counter would report progress that
 * never happened. So `--write` lowers each file's mark using only the rows that
 * were ALREADY in that file's baseline, and lists the newly-seeded keys
 * separately. The gate then fails on the excess until those rows carry a real
 * reason.
 *
 * ── What the gate actually enforces (and what it does not) ──────────────────
 * The gate arm is aggregate WITHIN each source file: it compares one number per
 * file, that file's unreviewed count, against that file's mark. It holds no
 * record of WHICH keys were seeded when the mark was set — that would mean
 * committing a second ~270KB mirror of the seeded keys, duplicating data the
 * baseline already carries. (Sharding tightens the old repo-wide arm: a review
 * in one file can no longer pay for a seeded row added in another.)
 *
 * The per-key rule therefore binds only through `--write`, which does have both
 * states in hand: reseeding after adding a mismatch lowers the mark by the
 * newly-seeded rows, so the gate goes red until they are given real reasons.
 * A HAND-EDITED baseline is caught only in aggregate: adding one row with the
 * seed string while reviewing one old row OF THE SAME SOURCE FILE leaves that
 * file's count unchanged, and the gate passes. That swap is a strictly-neutral
 * trade (unreviewed debt is conserved, never grown), which is the contract to
 * rely on — not "every new entry is individually forced to carry a real
 * reason". The reviewer of the baseline diff is what enforces the stronger
 * rule; this counter guarantees only that no file's total ever rises.
 *
 * Hard rules: no node:* imports, no process.*, async fs.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { listJsonFiles, pruneEmptyDirs, serializeBaseline } from "./baseline-json.js";
import { keyOf, type CallMismatchKey, type ExcludeEntry } from "./lint-call-mismatches.js";

export interface UnreviewedMark {
  max: number;
}

/**
 * The sharded mark: one `{"max": N}` per source file, keyed by the SAME
 * relative path the split exclude baseline uses (`<package>/<tsFile .ts→.json>`).
 * Sources with no unreviewed rows are absent from the map — and from disk.
 */
export type MarkSet = Map<string, number>;

/** One source file's standing against its own shard, as the gate arms report it. */
export interface MarkDelta {
  /** The shard's `<package>/<tsFile .ts→.json>` path. */
  file: string;
  /** Baselined entries in that source still carrying the seed reason. */
  count: number;
  /** That source's committed high-water mark; 0 when it has no shard. */
  mark: number;
}

/** Sum of the shards: the one number the console reports as the total. */
export function totalMark(marks: MarkSet): number {
  let sum = 0;
  for (const n of marks.values()) sum += n;
  return sum;
}

/**
 * Unreviewed rows per source file, keyed like {@link MarkSet}. `pathFor` is
 * injected rather than imported so this module stays free of the gate that
 * consumes it (lint-call-mismatches-wide.ts owns `relPathFor`).
 */
export function unreviewedCounts(
  entries: ExcludeEntry[],
  defaultReason: string,
  pathFor: (k: CallMismatchKey) => string,
): MarkSet {
  const counts: MarkSet = new Map();
  for (const e of unreviewedEntries(entries, defaultReason)) {
    const rel = pathFor(e);
    counts.set(rel, (counts.get(rel) ?? 0) + 1);
  }
  return counts;
}

export function unreviewedEntries(entries: ExcludeEntry[], defaultReason: string): ExcludeEntry[] {
  return entries.filter((e) => e.reason === defaultReason);
}

// Rows the reseed just created carrying the seed reason: unreviewed in `next`
// and absent from the baseline that was on disk before the reseed.
export function newlySeeded(
  next: ExcludeEntry[],
  prior: ExcludeEntry[],
  defaultReason: string,
): CallMismatchKey[] {
  const before = new Set(prior.map(keyOf));
  return unreviewedEntries(next, defaultReason).filter((e) => !before.has(keyOf(e)));
}

/**
 * Baseline rows this reseed DROPPED that carried a human-written reason (i.e.
 * not the seed string). A drop means the row stopped flagging — usually a real
 * convergence, but a widened gate (RFC 0083's same-file closure, the delegate
 * union) can also resolve a call for a reason unrelated to the divergence a
 * reviewer recorded. Those rows are the ones whose loss actually costs
 * information, so `--write` lists them for the PR author to spot-check instead
 * of trusting the diff wholesale. Reporting only: it never fails the gate.
 */
export function droppedReviewed(
  next: ExcludeEntry[],
  prior: ExcludeEntry[],
  defaultReason: string,
): ExcludeEntry[] {
  const kept = new Set(next.map(keyOf));
  return prior.filter((e) => e.reason !== defaultReason && !kept.has(keyOf(e)));
}

export function renderDroppedReviewed(dropped: ExcludeEntry[]): string {
  if (dropped.length === 0) return "";
  return [
    ``,
    `${dropped.length} reviewed entr(ies) (reason written by hand) no longer flag and were dropped.`,
    `Spot-check each: a gate that widened — not a port that converged — can also clear a row.`,
    ...dropped.map((e) => `  - ${e.package}  ${e.tsFile}  ${e.rubyName}  ${e.call}`),
  ].join("\n");
}

/**
 * Baseline rows this reseed dropped that still carried the seed reason. These
 * are the same two-cause ambiguity as {@link droppedReviewed} — converged port
 * vs. widened gate — but nobody ever wrote prose for them, so listing every key
 * would bury the reviewed listing (seeded rows are the overwhelming majority of
 * the baseline). They are reported as a COUNT by default, with the keys behind
 * a flag: a widened gate that silently clears hundreds of rows shows up as a
 * number nobody expected, which is the signal that was missing in PR #5869.
 */
export function droppedSeeded(
  next: ExcludeEntry[],
  prior: ExcludeEntry[],
  defaultReason: string,
): ExcludeEntry[] {
  const kept = new Set(next.map(keyOf));
  return unreviewedEntries(prior, defaultReason).filter((e) => !kept.has(keyOf(e)));
}

export const DROPPED_SEEDED_KEYS_ARG = "--show-dropped-seeded";

export function renderDroppedSeeded(dropped: ExcludeEntry[], showKeys: boolean): string {
  if (dropped.length === 0) return "";
  const lines = [
    ``,
    `${dropped.length} seeded entr(ies) (reason never reviewed) no longer flag and were dropped.`,
    `A widened resolution gate clears rows exactly like a converged port does; if that count is ` +
      `larger than the change you made, it is the gate, not the port.`,
  ];
  if (showKeys) {
    lines.push(...dropped.map((e) => `  - ${e.package}  ${e.tsFile}  ${e.rubyName}  ${e.call}`));
  } else {
    lines.push(`  Re-run with \`${DROPPED_SEEDED_KEYS_ARG}\` to list the keys.`);
  }
  return lines.join("\n");
}

export function parseMark(text: string): number {
  const parsed = JSON.parse(text) as unknown;
  const max = (parsed as UnreviewedMark | null)?.max;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 0) {
    throw new Error(
      `unreviewed high-water mark: expected {"max": <non-negative integer>}, got ${text.trim()}`,
    );
  }
  return max;
}

/**
 * Read every shard under `dir`. A source with no shard reads as 0 — the strict
 * direction, so a deleted shard reds the gate on its file's first unreviewed
 * row rather than silently granting headroom.
 *
 * A missing or empty tree is therefore NOT an error, which is a change the
 * split earns. The monolithic mark needed a loud ENOENT guard because deleting
 * one file silently disarmed the whole ratchet; here, deleting the tree makes
 * every seeded row in the baseline exceed a mark of 0, so `excessByPath` reds
 * the gate maximally and names each file. Keeping the guard would instead make
 * the ratchet throw on its own SUCCESS state: the last shard is deleted when
 * the last seeded reason is reviewed, and an empty tree cannot survive a clone
 * anyway (git does not track empty directories).
 */
export async function loadMarks(dir: string): Promise<MarkSet> {
  const marks: MarkSet = new Map();
  for (const f of (await listJsonFiles(dir)).sort()) {
    marks.set(path.relative(dir, f), parseMark(await fs.readFile(f, "utf-8")));
  }
  return marks;
}

/**
 * Per-file unreviewed counts with the rows THIS reseed seeded subtracted, which
 * is what `--write` lowers each mark to: a reseed can never buy headroom for the
 * source it just seeded rows into (see the held-out rationale in the header).
 */
export function heldOutCounts(
  counts: MarkSet,
  newly: CallMismatchKey[],
  pathFor: (k: CallMismatchKey) => string,
): MarkSet {
  const held = new Map(counts);
  for (const k of newly) {
    const rel = pathFor(k);
    held.set(rel, (held.get(rel) ?? 0) - 1);
  }
  return held;
}

// Only-shrink, per file: a source's stored mark never rises, so a reseed that
// adds unreviewed rows cannot buy headroom — in that file or any other. A
// source absent from `counts` drops out entirely (its mark is now 0).
export function nextMarks(counts: MarkSet, marks: MarkSet): MarkSet {
  const next: MarkSet = new Map();
  for (const [rel, count] of counts) {
    const max = Math.min(count, marks.get(rel) ?? Number.POSITIVE_INFINITY);
    // A source at 0 leaves the tree entirely rather than carrying `{"max": 0}`.
    if (max > 0) next.set(rel, max);
  }
  return next;
}

/**
 * Write the sharded mark under `dir`: one `{"max": N}` per source, deleting the
 * shards of sources that reached 0 (never leaving `{"max": 0}` behind) and
 * pruning the directories those deletions emptied.
 */
export async function writeMarks(dir: string, marks: MarkSet): Promise<void> {
  const existing = new Set((await listJsonFiles(dir)).map((f) => path.relative(dir, f)));
  for (const [rel, max] of marks) {
    // A source at or below 0 has no shard at all, so its file is left to the
    // deletion pass below rather than written as `{"max": 0}`.
    if (max <= 0) continue;
    const dest = path.join(dir, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, serializeBaseline({ max } satisfies UnreviewedMark));
    existing.delete(rel);
  }
  for (const rel of existing) await fs.rm(path.join(dir, rel));
  await pruneEmptyDirs(dir);
}

// Ties in either arm fall back to the shard path, so a listing of equal-sized
// deltas is stable run to run.
function compareFiles(a: MarkDelta, b: MarkDelta): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
}

/** Sources whose unreviewed count sits ABOVE their own mark, worst overshoot first. */
export function excessByPath(counts: MarkSet, marks: MarkSet): MarkDelta[] {
  const out: MarkDelta[] = [];
  for (const [file, count] of counts) {
    const mark = marks.get(file) ?? 0;
    if (count > mark) out.push({ file, count, mark });
  }
  return out.sort((a, b) => b.count - b.mark - (a.count - a.mark) || compareFiles(a, b));
}

export function renderExcess(excess: MarkDelta[], markDir: string): string {
  const total = excess.reduce((n, d) => n + d.count - d.mark, 0);
  return (
    `\nwide call-mismatches unreviewed ratchet: ${total} baselined entr(ies) across ` +
    `${excess.length} source file(s) carry the seeded default reason beyond that file's ` +
    "committed high-water mark.\n" +
    `That means ${total} row(s) gained the placeholder reason since the mark was set — either ` +
    "newly seeded by a reseed, or a reviewed reason reverted to the seed. A baseline entry must " +
    "be reviewed as it is added, not inherited as unreviewed debt: replace each placeholder " +
    `\`reason\` with a real one-line explanation, then re-run \`--write\` to lower ${markDir}/.\n` +
    "(Each mark only shrinks; reseeding can never raise one.)\n" +
    excess.map((d) => `  + ${d.file}  ${d.count} unreviewed, mark ${d.mark}`).join("\n")
  );
}

/**
 * Slack between a committed shard and what a clean reseed would write for it: a
 * mark that sits ABOVE that source's current unreviewed count (RFC 0083).
 *
 * The excess arm above only fires when a count RISES past its mark, so a mark
 * left stale-HIGH — rows converged out of the baseline, or reasons were
 * reviewed, without a reseed to lower it — never surfaces: the ratchet passes
 * either way. That silence is what makes the next story's measured delta wrong,
 * because its "before" value is a number no clean tree produces. Slack is
 * therefore gated, not advisory: a mark is a measurement, and one that only
 * shrinks is always safe to tighten. `--write` tightens it for you, and any
 * change that drops rows already has to reseed for the STALE-entry arm, so a
 * legitimately-reseeded tree has zero slack by construction.
 *
 * A file whose count sits ABOVE its mark is the excess arm's job, not this one.
 *
 * Sharded, this also covers the ORPHAN shard: a mark whose source has no
 * unreviewed rows left — or no baseline file at all — is a count of 0 under a
 * positive mark, i.e. pure slack, and the next `--write` deletes it.
 */
export function slackByPath(counts: MarkSet, marks: MarkSet): MarkDelta[] {
  const out: MarkDelta[] = [];
  for (const [file, mark] of marks) {
    const count = counts.get(file) ?? 0;
    if (mark > count) out.push({ file, count, mark });
  }
  return out.sort((a, b) => b.mark - b.count - (a.mark - a.count) || compareFiles(a, b));
}

export function renderSlack(slack: MarkDelta[], markDir: string): string {
  const total = slack.reduce((n, d) => n + d.mark - d.count, 0);
  return (
    `\nwide call-mismatches unreviewed ratchet: STALE high-water mark — ${slack.length} file(s) ` +
    `under ${markDir}/ claim more unreviewed entr(ies) than the baseline still carries ` +
    `(${total} of slack).\n` +
    "A mark is a measurement of remaining unreviewed debt; left high it hands the next " +
    "story a “before” value no clean tree produces, and the drift is discovered only " +
    "when someone reseeds. A mark only shrinks, so tightening is always safe:\n" +
    "  pnpm api:calls:wide:reseed\n" +
    slack.map((d) => `  - ${d.file}  mark ${d.mark}, only ${d.count} unreviewed`).join("\n")
  );
}

export function renderWriteSummary(
  count: number,
  newly: CallMismatchKey[],
  marks: MarkSet,
  markDir: string,
): string {
  const lines = [
    `Wrote ${markDir}/: ${marks.size} per-file unreviewed high-water mark(s) totalling ` +
      `${totalMark(marks)} (${count} entr(ies) carry the seeded default reason).`,
  ];
  if (newly.length > 0) {
    lines.push(
      `${newly.length} of those were seeded by THIS reseed and are held out of the mark — ` +
        "give each a real reason (the gate fails until you do):",
    );
    for (const k of newly) lines.push(`  ~ ${k.package}  ${k.tsFile}  ${k.rubyName}  ${k.call}`);
  }
  return lines.join("\n");
}
