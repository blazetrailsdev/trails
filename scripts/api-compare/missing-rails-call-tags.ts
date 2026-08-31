/**
 * The `@missingRailsCall <ruby_call> — <reason>` JSDoc tag: its parser and the
 * empty-reason contract, in one module so every consumer shares ONE
 * implementation (RFC 0083).
 *
 * Consumers:
 *   - parity:api:build (build.ts) — reconciles tags against the wide artifact;
 *   - parity:api:reasons (lint-missing-rails-call-reasons.ts) — gates the contract;
 *   - the TS extractor (extract-ts-api.ts) — records the tagged calls so
 *     compare.ts's `checkCalls` can suppress them, which is what makes the tag
 *     load-bearing rather than documentation.
 *
 * Hard rules: no node:* imports, no process.* references, async fs.
 */

import { ANY_TAG_LINE } from "../../eslint/jsdoc-tag-line.mjs";

export const TAG = "@missingRailsCall";

/**
 * The wide baseline's seeded `reason` — the RFC 0047 seed prose. An entry
 * carrying it is what the unreviewed high-water mark counts.
 *
 * A tag carrying it is deliberately NOT a justification: it stands in for a
 * reason rather than arguing one, so if it suppressed, the whole baseline would
 * be blessed by prose nobody wrote. It has to be replaced with real per-entry
 * prose before the call leaves the population.
 *
 * `parity:api:build` no longer MINTS tags carrying it (RFC 0083) — it only writes a
 * tag it has curated prose to migrate — but tags predating that policy still
 * carry it in the tree.
 */
export const DEFAULT_REASON =
  "Baseline (RFC 0047): wide call-set flag seeded when the wide ratchet landed; " +
  "bucket (b) equivalent or (c) noise pending per-cluster burndown review.";

/**
 * The narrow baseline's seeded `reason` — the RFC 0044 seed prose, stamped by
 * `reseed()` in call-mismatch-baseline.ts on a newly-flagged call. It
 * lives here, beside {@link DEFAULT_REASON}, so ONE predicate knows both seeds:
 * a tag carrying it stands in for a reason exactly as the wide seed does, and
 * `justifies()` rejecting only the wide one would let a narrow-seeded row
 * suppress its wide flag — blessing a row nobody reviewed.
 */
export const NARROW_DEFAULT_REASON =
  "Baseline (RFC 0044): pre-existing call-set flag inherited when the ratchet " +
  "landed; pending per-cluster burndown review.";

/** One parsed `@missingRailsCall` tag: the Ruby call name plus its raw lines
 *  (kept verbatim for idempotency) and the flattened reason text. */
export interface TagEntry {
  call: string;
  reason: string;
  rawLines: string[];
  /** 1-based line in the declaring file this tag was written on, when
   *  `parseJsdoc` was given an origin — so a consumer can report the tag at a
   *  `file:line` the operator can open (RFC 0106). */
  line?: number;
  /** Index in `parseJsdoc`'s `rest` this tag was lifted from, so `renderJsdoc`
   *  can put it back where it stood even when prose separates it from its
   *  same-family neighbours (RFC 0106). Absent on a newly minted entry. */
  slot?: number;
}

/** Where a JSDoc comment starts, so an empty-reason error can name a
 *  `file:line` the way `noRailsEquivalentReason` does. */
export interface JsdocOrigin {
  fileName: string;
  /** 1-based line of the comment's first line in `fileName`. */
  startLine: number;
}

/** Both regexes are built per TAG so the second member of the family — the
 *  call-ARGUMENT tag `@missingRailsArgs` (RFC 0099), see
 *  missing-rails-args-tags.ts — shares ONE parser with `@missingRailsCall`
 *  rather than growing a near-copy of it. */
const tagLine = (tag: string): RegExp =>
  new RegExp(`^\\s*\\*?\\s*${tag}\\s+(\\S+)(?:\\s+—\\s?(.*))?$`);
/** A line that OPENS the tag, whatever follows it. Anything matching this and
 *  not `tagLine` is malformed — the bare tag, one going straight to the
 *  em-dash, or one naming several comma-separated calls — and is a hard error
 *  rather than prose the parser walks past (RFC 0099). */
const tagLineStart = (tag: string): RegExp => new RegExp(`^\\s*\\*?\\s*${tag}\\b`);
// A line opening a NEW JSDoc tag: at most one space after the `*`. Curated
// reasons can contain Ruby ivar names (`@primary_key`), and the wrapper's
// hang indent (`*   `) can place one at line start — deeper-indented `@`
// lines are continuations, not tag boundaries (found by the activerecord-wide
// run: core.ts initInternals). Re-exported from the shared module so the
// `@noRailsEquivalent` readers cannot drift apart (RFC 0129).
export { ANY_TAG_LINE };
const ONE_LINE_COMMENT = /^(\s*)\/\*\*(.*)\*\/\s*$/;

/** One line of a comment as the parser sees it, carrying the line of the
 *  SOURCE comment it came from (so an offending tag is reported at the line it
 *  was written on) and whether the parser synthesized it. */
interface CommentLine {
  text: string;
  sourceIndex: number;
  /** True for a tag lifted out of a one-line comment. Such an entry keeps no
   *  verbatim `rawLines`, so `renderEntry` re-wraps it — which is what turns a
   *  hand-written one-liner into the block form `parity:api:build` emits — and it
   *  takes no continuation lines, since a one-line comment's reason ends with
   *  its line and whatever follows the comment is code. */
  synthetic: boolean;
}

/** Split a comment into the lines the tag parser walks, lifting the tags out of
 *  a one-line `/** ... *\/` comment.
 *
 *  `tagLine` is anchored at end of line, so before RFC 0083 a hand-written
 *  `/** @missingRailsCall first — reason *\/` matched nothing: the trailing
 *  `*\/` is part of the line. The tag was then a silent no-op in all three
 *  consumers at once. The tag-free remainder stays a one-line comment, which
 *  `renderJsdoc` already normalizes to block form under the right indent. */
function toCommentLines(comment: string, tag: string): CommentLine[] {
  const lines: CommentLine[] = [];
  for (const [sourceIndex, text] of comment.split("\n").entries()) {
    const match = text.match(ONE_LINE_COMMENT);
    if (!match?.[2].includes(tag)) {
      lines.push({ text, sourceIndex, synthetic: false });
      continue;
    }
    const [, indent, inner] = match;
    const [prose, ...tags] = inner.split(tag);
    const stripped = prose.replace(/^\s*\*?\s*/, "").trim();
    lines.push({
      text: `${indent}/**${stripped === "" ? "" : ` ${stripped}`} */`,
      sourceIndex,
      synthetic: false,
    });
    for (const entry of tags) {
      lines.push({ text: ` * ${tag} ${entry.trim()}`, sourceIndex, synthetic: true });
    }
  }
  return lines;
}

/** Parse a JSDoc comment's text (including delimiters) into its non-tag lines
 *  and its `@missingRailsCall` entries. Continuation lines (not starting a new
 *  `@` tag) attach to the preceding entry.
 *
 *  A tag line that opens the tag and does not parse is a hard error too,
 *  distinguished from the empty-reason one by "needs a call": the bare tag, one
 *  going straight to the em-dash, and — the shape RFC 0099 closed — one naming
 *  several comma-separated calls, which `tagLine` cannot match past the first
 *  token. Each matched no other rule here and so was read as prose: no
 *  suppression, no stale-tag report, no empty-reason error, and invisible to
 *  the permanence gate. That was the last way to write a tag the parser ignores
 *  without complaint, the same quiet-direction hazard as the one-line form one
 *  level up.
 *
 *  An empty reason is a hard error, matching `@noRailsEquivalent` (RFC 0080):
 *  every tag in the tree is written with a reason — the generator only emits a
 *  tag when it has a curated baseline row's prose to carry — so a bare tag is
 *  necessarily hand-authored, and backfilling it with a placeholder would turn
 *  an unjustified allowlist entry into a silently blessed one. The family's
 *  empty-reason contract is stated in
 *  docs/infrastructure/api-build-stub-generation-plan.md. */
export function parseJsdoc(
  comment: string,
  origin?: JsdocOrigin,
  tag: string = TAG,
): { rest: string[]; entries: TagEntry[]; slot?: number } {
  const rest: string[] = [];
  const entries: TagEntry[] = [];
  // Index in `rest` where this family's tags began — see `renderJsdoc`'s `at`.
  let slot: number | undefined;
  const tagLineOf = new Map<TagEntry, number>();
  let open: TagEntry | null = null;
  const at = (sourceIndex: number): string =>
    origin ? ` ${origin.fileName}:${origin.startLine + sourceIndex}` : "";
  for (const { text: line, sourceIndex, synthetic } of toCommentLines(comment, tag)) {
    const m = line.match(tagLine(tag));
    if (!m && tagLineStart(tag).test(line)) {
      throw new Error(
        `${tag} needs a call:${at(sourceIndex)} — name ONE Rails call that is ` +
          `not made here, as \`${tag} <ruby_call> — <reason>\`. Several calls take ` +
          `one tag each; a comma-separated list matches nothing and would suppress nothing.`,
      );
    }
    if (m) {
      // Trimmed at capture: `tagLine` absorbs only one space after the
      // em-dash, so trailing whitespace would otherwise read as a non-empty
      // reason and slide past the empty-reason gate below. `rawLines` keeps
      // the line verbatim, so idempotency is unaffected.
      slot ??= rest.length;
      open = {
        call: m[1],
        reason: (m[2] ?? "").trim(),
        rawLines: synthetic ? [] : [line],
        slot: rest.length,
        line: origin ? origin.startLine + sourceIndex : undefined,
      };
      entries.push(open);
      tagLineOf.set(open, sourceIndex);
      if (synthetic) open = null;
      continue;
    }
    const closes = line.trim() === "*/" || line.trim().endsWith("*/");
    if (open && !ANY_TAG_LINE.test(line) && !closes && line.trim() !== "*") {
      open.rawLines.push(line);
      open.reason = (open.reason + " " + line.replace(/^\s*\*\s?/, "").trim()).trim();
      continue;
    }
    open = null;
    rest.push(line);
  }
  for (const entry of entries) {
    if (entry.reason !== "") continue;
    throw new Error(
      `${tag} needs a reason:${at(tagLineOf.get(entry) ?? 0)} — state why the Rails call ` +
        `\`${entry.call}\` is not made here.`,
    );
  }
  return { rest, entries, slot };
}

/** True when a tag's reason argues the deviation, rather than standing in for
 *  one: real per-entry prose, not the {@link DEFAULT_REASON} nor the
 *  {@link NARROW_DEFAULT_REASON} seed. The single predicate behind both halves
 *  of the contract — a tag suppresses its flag if and only if its baseline row
 *  may be dropped — and it knows BOTH baselines' seeds, since a tag's prose is
 *  migrated out of the narrow baseline as readily as the wide one. */
export function justifies(reason: string): boolean {
  return reason !== "" && reason !== DEFAULT_REASON && reason !== NARROW_DEFAULT_REASON;
}

/** The Ruby call names one JSDoc comment JUSTIFIES as deliberately not made,
 *  sorted and deduplicated. Throws on a bare or whitespace-only tag (the
 *  empty-reason contract) and on a reason making no permanence claim — the same
 *  discipline `@missingRailsArgs` (RFC 0099) and `@noRailsEquivalent` (RFC 0080)
 *  carry, so the report can tell permanent debt from burndown work rather than
 *  filing every receipt as `unclassified`. It skips a tag still carrying
 *  {@link DEFAULT_REASON}: a call only leaves the population when its deviation
 *  is argued in prose at the call site. A line-leading prose `@tag` inside a
 *  reason ends that reason at `parseJsdoc`'s boundary rule, so it can never
 *  mint a suppression for a call nobody tagged. */
export function suppressedCallsIn(comment: string, origin?: JsdocOrigin): string[] {
  const { entries } = parseJsdoc(comment, origin);
  for (const entry of entries) {
    // A seeded reason stands in for a justification rather than making one, so
    // it is already unjustified below; asking it for a permanence claim would
    // only turn a known-unreviewed tag into a hard error.
    if (!justifies(entry.reason)) continue;
    if (classifyReason(entry.reason) !== "unclassified") continue;
    throw new Error(
      `${TAG} needs a permanence claim${origin ? ` in ${origin.fileName}` : ""} — open the ` +
        `reason for \`${entry.call}\` with PERMANENT (a language- or runtime-level fact no ` +
        `port can remove) or CONVERGEABLE (work not done yet; name its story).`,
    );
  }
  const justified = entries.filter((e) => justifies(e.reason));
  return [...new Set(justified.map((e) => e.call))].sort();
}

/** The same suppressions as {@link suppressedCallsIn}, each mapped to the
 *  REASON that justified it, so a consumer can group the receipts by the
 *  permanence claim {@link classifyReason} reads off that reason (RFC 0099).
 *  Two tags for one call on one comment keep the first reason, matching the
 *  dedup {@link suppressedCallsIn} already does. */
export function suppressedCallReasonsIn(
  comment: string,
  origin?: JsdocOrigin,
  tag: string = TAG,
): Record<string, string> {
  const { entries } = parseJsdoc(comment, origin, tag);
  const reasons: Record<string, string> = {};
  for (const entry of entries) {
    if (!justifies(entry.reason)) continue;
    reasons[entry.call] ??= entry.reason;
  }
  return reasons;
}

/**
 * The permanence claim a tag's reason makes about itself.
 *
 * `permanent` — a language-level or runtime-level fact no port can remove.
 * `convergeable` — unfinished porting, a fixable collision, a comparator gap:
 * the tag is a placeholder for work, and the reason should name its story.
 * `unclassified` — the reason makes no claim either way.
 */
export type Permanence = "permanent" | "convergeable" | "unclassified";

const PERMANENCE_TOKENS: Record<string, Permanence> = {
  PERMANENT: "permanent",
  CONVERGEABLE: "convergeable",
};

/**
 * Read the leading classification token off a tag's reason.
 *
 * The tag audit (RFC 0080) found 42 of 79 `@noRailsEquivalent` tags describing
 * convergeable surface: each reason was factually accurate about its mechanism
 * and merely drew "therefore permanent" from it, so nothing in the report could
 * tell the two populations apart. Requiring the claim to be stated as a token
 * makes an unstated one countable — a tag that says neither word is
 * `unclassified` rather than assumed permanent.
 *
 * The token must be the reason's first word (uppercase, on a word boundary, so
 * prose like "PERMANENTLY" does not qualify); any punctuation may follow it.
 *
 * It lives here rather than in extra-surface.ts (which re-exports it) because
 * the same discipline now governs `@missingRailsArgs` (RFC 0099), and one
 * classifier keeps the two families honest to the same rule.
 */
export function classifyReason(reason: string): Permanence {
  const first = /^\s*([A-Z]+)\b/.exec(reason);
  if (!first) return "unclassified";
  return PERMANENCE_TOKENS[first[1]] ?? "unclassified";
}

/**
 * Prose that hands the deviation to a future owner: an RFC, a story, a
 * follow-up, a burndown wave. A reason resting on such a phrase is describing
 * work someone will do, which is `CONVERGEABLE` — and, per RFC 0106's rule, a
 * deviation whose work is still owned belongs in `call-mismatches-exclude/` as
 * a row rather than at the call site as a receipt, because the row is the thing
 * tracking it.
 *
 * Deliberately NOT a bare `RFC ####` / `story <slug>` match. Most reasons cite
 * an RFC as the AUDIT that verified them ("Per-site verified (RFC 0106 wave
 * 4b)"), and one cites the story whose rename CAUSED a name-collision false
 * positive — neither is a convergence owner, and matching them would drown the
 * signal in the provenance every reviewed reason carries.
 */
const CONVERGENCE_OWNER =
  /\b(?:tracked (?:by|with|as)|convergence tracked|pending (?:per-cluster|burndown|review)|TODO|follow-?up|will be (?:converged|ported))\b/i;

/**
 * A tag whose reason claims `PERMANENT` while its prose hands the deviation to
 * a future owner — the failure the RFC 0080 audit found in 42 of 79
 * `@noRailsEquivalent` tags, where each reason was factually accurate about its
 * mechanism and merely drew "therefore permanent" from it. {@link classifyReason}
 * cannot see it: an unstated claim is countable, a WRONG one is not.
 *
 * Reported, never gated: the phrase list is a review prompt, so a false
 * positive must cost a reviewer a glance rather than a red build.
 */
export function claimsPermanenceButNamesOwner(reason: string): boolean {
  return classifyReason(reason) === "permanent" && CONVERGENCE_OWNER.test(reason);
}
