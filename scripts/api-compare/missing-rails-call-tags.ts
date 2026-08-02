/**
 * The `@missingRailsCall <ruby_call> — <reason>` JSDoc tag: its parser and the
 * empty-reason contract, in one module so every consumer shares ONE
 * implementation (RFC 0083).
 *
 * Consumers:
 *   - api:build (build.ts) — reconciles tags against the wide artifact;
 *   - api:reasons (lint-missing-rails-call-reasons.ts) — gates the contract;
 *   - the TS extractor (extract-ts-api.ts) — records the tagged calls so
 *     compare.ts's `checkCalls` can suppress them, which is what makes the tag
 *     load-bearing rather than documentation.
 *
 * Hard rules: no node:* imports, no process.* references, async fs.
 */

export const TAG = "@missingRailsCall";

/**
 * The reason `api:build` stamps on a tag it mints with nothing curated to
 * migrate — the RFC 0047 seed prose, shared with the wide baseline's
 * `DEFAULT_REASON` (an entry carrying it is what the unreviewed high-water
 * mark counts).
 *
 * A tag carrying it is deliberately NOT a justification: `api:build` mints one
 * per still-missing call, so if the placeholder suppressed, a single
 * `api:build --package <pkg>` run would move the whole baseline into inert
 * tags and zero the wide gate. It has to be replaced with real per-entry prose
 * before the call leaves the population.
 */
export const DEFAULT_REASON =
  "Baseline (RFC 0047): wide call-set flag seeded when the wide ratchet landed; " +
  "bucket (b) equivalent or (c) noise pending per-cluster burndown review.";

/** One parsed `@missingRailsCall` tag: the Ruby call name plus its raw lines
 *  (kept verbatim for idempotency) and the flattened reason text. */
export interface TagEntry {
  call: string;
  reason: string;
  rawLines: string[];
}

/** Where a JSDoc comment starts, so an empty-reason error can name a
 *  `file:line` the way `noRailsEquivalentReason` does. */
export interface JsdocOrigin {
  fileName: string;
  /** 1-based line of the comment's first line in `fileName`. */
  startLine: number;
}

const TAG_LINE = /^\s*\*?\s*@missingRailsCall\s+(\S+)(?:\s+—\s?(.*))?$/;
// A line opening a NEW JSDoc tag: at most one space after the `*`. Curated
// reasons can contain Ruby ivar names (`@primary_key`), and the wrapper's
// hang indent (`*   `) can place one at line start — deeper-indented `@`
// lines are continuations, not tag boundaries (found by the activerecord-wide
// run: core.ts initInternals).
const ANY_TAG_LINE = /^\s*\*?\s?@\S/;
// A whole JSDoc comment on one line. `TAG_LINE` is end-anchored, so a
// hand-written `/** @missingRailsCall first — reason */` matched nothing and
// the tag was a silent no-op in all three consumers at once (RFC 0083).
const ONE_LINE_COMMENT = /^(\s*)\/\*\*(.*)\*\/\s*$/;

/** Split a one-line JSDoc comment carrying at least one tag into the tag-free
 *  comment (which stays in `rest`, where `renderJsdoc`'s own one-line
 *  normalization re-indents it into block form) and one synthetic line per tag.
 *  Returns null for any other line. */
function expandOneLineComment(line: string): { rest: string; tags: string[] } | null {
  const m = line.match(ONE_LINE_COMMENT);
  if (!m) return null;
  const [, indent, inner] = m;
  if (!inner.includes(TAG)) return null;
  const chunks = inner.split(TAG);
  const prose = chunks[0].replace(/^\s*\*?\s*/, "").trim();
  return {
    rest: `${indent}/**${prose === "" ? " " : ` ${prose} `}*/`,
    tags: chunks.slice(1).map((chunk) => ` * ${TAG} ${chunk.trim()}`),
  };
}

/** Parse a JSDoc comment's text (including delimiters) into its non-tag lines
 *  and its `@missingRailsCall` entries. Continuation lines (not starting a new
 *  `@` tag) attach to the preceding entry.
 *
 *  An empty reason is a hard error, matching `@noRailsEquivalent` (RFC 0080):
 *  every tag in the tree is written with a reason — the generator always emits
 *  the curated baseline row's prose or a placeholder — so a bare tag is
 *  necessarily hand-authored, and backfilling it with a placeholder would turn
 *  an unjustified allowlist entry into a silently blessed one. The family's
 *  empty-reason contract is stated in
 *  docs/infrastructure/api-build-stub-generation-plan.md. */
export function parseJsdoc(
  comment: string,
  origin?: JsdocOrigin,
): { rest: string[]; entries: TagEntry[] } {
  const lines: string[] = [];
  // Expanded lines can outnumber the source lines, so an offending tag still
  // reports the file:line it was WRITTEN on, not its position after expansion.
  const sourceLineOf: number[] = [];
  // A synthetic tag line carries no verbatim `rawLines`: `renderEntry` re-wraps
  // it, which is what turns a hand-written one-liner into block form.
  const synthetic = new Set<number>();
  for (const [index, line] of comment.split("\n").entries()) {
    const expanded = expandOneLineComment(line);
    for (const out of expanded ? [expanded.rest, ...expanded.tags] : [line]) {
      if (expanded && out !== expanded.rest) synthetic.add(lines.length);
      lines.push(out);
      sourceLineOf.push(index);
    }
  }
  const rest: string[] = [];
  const entries: TagEntry[] = [];
  const tagLineOf = new Map<TagEntry, number>();
  let open: TagEntry | null = null;
  for (const [index, line] of lines.entries()) {
    const m = line.match(TAG_LINE);
    if (m) {
      // Trimmed at capture: `TAG_LINE` absorbs only one space after the
      // em-dash, so trailing whitespace would otherwise read as a non-empty
      // reason and slide past the empty-reason gate below. `rawLines` keeps
      // the line verbatim, so idempotency is unaffected.
      const isSynthetic = synthetic.has(index);
      open = { call: m[1], reason: (m[2] ?? "").trim(), rawLines: isSynthetic ? [] : [line] };
      entries.push(open);
      tagLineOf.set(open, index);
      // A one-line comment's reason ends with its line; leaving the entry open
      // would swallow whatever follows the comment as a continuation.
      if (isSynthetic) open = null;
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
    const at = origin
      ? ` ${origin.fileName}:${origin.startLine + (sourceLineOf[tagLineOf.get(entry) ?? 0] ?? 0)}`
      : "";
    throw new Error(
      `${TAG} needs a reason:${at} — state why the Rails call ` +
        `\`${entry.call}\` is not made here.`,
    );
  }
  return { rest, entries };
}

/** True when a tag's reason argues the deviation, rather than standing in for
 *  one: real per-entry prose, not the {@link DEFAULT_REASON} seed. The single
 *  predicate behind both halves of the contract — a tag suppresses its flag if
 *  and only if its baseline row may be dropped. */
export function justifies(reason: string): boolean {
  return reason !== "" && reason !== DEFAULT_REASON;
}

/** The Ruby call names one JSDoc comment JUSTIFIES as deliberately not made,
 *  sorted and deduplicated. Throws on a bare or whitespace-only tag (the
 *  empty-reason contract), and skips a tag still carrying
 *  {@link DEFAULT_REASON}: a call only leaves the population when its deviation
 *  is argued in prose at the call site. A line-leading prose `@tag` inside a
 *  reason ends that reason at `parseJsdoc`'s boundary rule, so it can never
 *  mint a suppression for a call nobody tagged. */
export function suppressedCallsIn(comment: string, origin?: JsdocOrigin): string[] {
  const { entries } = parseJsdoc(comment, origin);
  const justified = entries.filter((e) => justifies(e.reason));
  return [...new Set(justified.map((e) => e.call))].sort();
}
