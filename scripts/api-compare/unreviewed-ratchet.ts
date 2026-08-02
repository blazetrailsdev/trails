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
 * ── Why newly-seeded rows are held out ──────────────────────────────────────
 * A reseed gives every genuinely-new mismatch the default reason. If those
 * counted toward the lowered mark, an agent could reseed a batch of fresh
 * unreviewed rows into the mark and the counter would report progress that
 * never happened. So `--write` lowers the mark using only the rows that were
 * ALREADY in the baseline, and lists the newly-seeded keys separately. The
 * gate then fails on the excess until those new rows carry a real reason.
 *
 * ── What the gate actually enforces (and what it does not) ──────────────────
 * The gate arm is AGGREGATE: it compares one number, `unreviewedCount(baseline)`,
 * against the mark. It holds no record of WHICH keys were seeded when the mark
 * was set — that would mean committing a second ~270KB mirror of the 4441
 * seeded keys, duplicating data the baseline already carries.
 *
 * The per-key rule therefore binds only through `--write`, which does have both
 * states in hand: reseeding after adding a mismatch lowers the mark by the
 * newly-seeded rows, so the gate goes red until they are given real reasons.
 * A HAND-EDITED baseline is caught only in aggregate: adding one row with the
 * seed string while reviewing one old row leaves the count unchanged, and the
 * gate passes. That swap is a strictly-neutral trade (unreviewed debt is
 * conserved, never grown), which is the contract to rely on — not "every new
 * entry is individually forced to carry a real reason". The reviewer of the
 * baseline diff is what enforces the stronger rule; this counter guarantees
 * only that the total never rises.
 *
 * Hard rules: no node:* imports, no process.*, async fs.
 */
import * as fs from "fs/promises";
import { serializeBaseline } from "./baseline-json.js";
import { keyOf, type CallMismatchKey, type ExcludeEntry } from "./lint-call-mismatches.js";

export interface UnreviewedMark {
  max: number;
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

export async function loadMark(file: string): Promise<number> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    // Deleting the mark is how the ratchet would be silently disarmed, so say
    // what it is rather than surfacing a bare ENOENT.
    throw new Error(
      `unreviewed high-water mark: ${file} is missing. It is a committed ratchet file; ` +
        "restore it from git rather than regenerating, or the mark is lost.",
      { cause: e },
    );
  }
  return parseMark(text);
}

// Only-shrink: the stored mark never rises, so a reseed that adds unreviewed
// rows cannot buy headroom.
export function nextMark(current: number, mark: number): number {
  return Math.min(current, mark);
}

export async function writeMark(file: string, max: number): Promise<void> {
  await fs.writeFile(file, serializeBaseline({ max } satisfies UnreviewedMark));
}

export function renderExcess(count: number, mark: number, markPath: string): string {
  const excess = count - mark;
  return (
    `\nwide call-mismatches unreviewed ratchet: ${count} baselined entr(ies) still carry the ` +
    `seeded default reason, ${excess} more than the committed high-water mark of ${mark}.\n` +
    `That means ${excess} row(s) gained the placeholder reason since the mark was set — either ` +
    "newly seeded by a reseed, or a reviewed reason reverted to the seed. A baseline entry must " +
    "be reviewed as it is added, not inherited as unreviewed debt: replace each placeholder " +
    `\`reason\` with a real one-line explanation, then re-run \`--write\` to lower ${markPath}.\n` +
    "(The mark only shrinks; reseeding can never raise it.)"
  );
}

/**
 * Slack between the committed mark and what a clean reseed would write: a
 * mark that sits ABOVE the current unreviewed count (RFC 0083).
 *
 * The excess arm above only fires when the count RISES past the mark, so a
 * mark left stale-HIGH — rows converged out of the baseline, or reasons were
 * reviewed, without a reseed to lower it — never surfaces: the ratchet passes
 * either way. That silence is what makes the next story's measured delta wrong,
 * because its "before" value is a number no clean tree produces. Slack is
 * therefore gated, not advisory: a mark is a measurement, and one that only
 * shrinks is always safe to tighten. `--write` tightens it for you, and any
 * change that drops rows already has to reseed for the STALE-entry arm, so a
 * legitimately-reseeded tree has zero slack by construction.
 *
 * Negative slack (count above the mark) is the excess arm's job; this returns 0.
 */
export function markSlack(count: number, mark: number): number {
  return Math.max(0, mark - count);
}

export function renderSlack(count: number, mark: number, markPath: string): string {
  return (
    `\nwide call-mismatches unreviewed ratchet: STALE high-water mark — ${markPath} says ` +
    `${mark}, but only ${count} baselined entr(ies) still carry the seeded default reason ` +
    `(${markSlack(count, mark)} of slack).\n` +
    "The mark is a measurement of remaining unreviewed debt; left high it hands the next " +
    "story a “before” value no clean tree produces, and the drift is discovered only " +
    "when someone reseeds. The mark only shrinks, so tightening is always safe:\n" +
    "  pnpm api:calls:wide:reseed\n"
  );
}

export function renderWriteSummary(
  count: number,
  newly: CallMismatchKey[],
  mark: number,
  markPath: string,
): string {
  const lines = [
    `Wrote ${markPath}: unreviewed high-water mark ${mark} (${count} entr(ies) carry the seeded ` +
      "default reason).",
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
