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
  const lines = comment.split("\n");
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
      open = { call: m[1], reason: (m[2] ?? "").trim(), rawLines: [line] };
      entries.push(open);
      tagLineOf.set(open, index);
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
      ? ` ${origin.fileName}:${origin.startLine + (tagLineOf.get(entry) ?? 0)}`
      : "";
    throw new Error(
      `${TAG} needs a reason:${at} — state why the Rails call ` +
        `\`${entry.call}\` is not made here.`,
    );
  }
  return { rest, entries };
}

/** The Ruby call names one JSDoc comment tags as deliberately not made, sorted
 *  and deduplicated. Throws on a bare or whitespace-only tag (the empty-reason
 *  contract): a call is only suppressed when its deviation is justified in
 *  prose at the call site. A line-leading prose `@tag` inside a reason ends
 *  that reason at `parseJsdoc`'s boundary rule, so it can never mint a
 *  suppression for a call nobody tagged. */
export function suppressedCallsIn(comment: string, origin?: JsdocOrigin): string[] {
  const { entries } = parseJsdoc(comment, origin);
  return [...new Set(entries.filter((e) => e.reason !== "").map((e) => e.call))].sort();
}
