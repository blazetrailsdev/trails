/**
 * Which JSDoc lines OPEN a tag, in one module so the two readers of
 * `@noRailsEquivalent` cannot disagree (RFC 0129).
 *
 * `scripts/api-compare/extract-ts-api.ts` credits a receipt only on a line that
 * opens it, by {@link ANY_TAG_LINE}; `blazetrails/ruby-compat-needs-mri-citation`
 * used to regex the whole comment text, so it accepted a tag written on a
 * hang-indented continuation line and reported nothing while the extractor
 * dropped the receipt. On PR #7266 that silently dropped all ten
 * `packages/ruby-compat/src/comparable.ts` receipts and moved
 * `parity:api:extra:gate` from `ruby-compat novel 4` to `novel 14` on a run
 * whose `pnpm lint` was green.
 *
 * The extractor is the reader that decides the measured surface, so the lint
 * rule adopts ITS rule rather than the reverse: widening `ANY_TAG_LINE` would
 * mint tags from wrapped prose, which is exactly what its one-space bound
 * exists to stop (a curated reason can name a Ruby ivar, `@primary_key`).
 *
 * Hard rules: no node:* imports, no process.* references.
 */

/**
 * A line opening a NEW JSDoc tag: at most one space after the `*`. Deeper-
 * indented `@` lines are continuations, not tag boundaries.
 */
export const ANY_TAG_LINE = /^\s*\*?\s?@\S/;

const TAG_NAME = /^\s*\*?\s?@(\S+)\s*/;

/**
 * The prose following each line-leading `@<tag>` in `text` — a comment body as
 * ESLint's `comment.value` gives it, or the raw block.
 */
export function lineLeadingTagReasons(text, tag) {
  const out = [];
  for (const raw of text.split("\n")) {
    const opened = lineLeadingTag(raw);
    if (opened === null || opened.name !== tag) continue;
    out.push(opened.text.replace(/\*\/\s*$/, "").trim());
  }
  return out;
}

/**
 * The tag a single line OPENS and the text following it, or `null` when the
 * line opens none — the one parse every reader of a JSDoc tag shares. The
 * `/**` opener of a one-line comment is rewritten to the `*` frame
 * {@link ANY_TAG_LINE} expects, exactly as `isLineLeading` normalizes it.
 */
export function lineLeadingTag(rawLine) {
  const line = rawLine.replace(/^(\s*)\/\*\*/, "$1*");
  if (!ANY_TAG_LINE.test(line)) return null;
  const m = TAG_NAME.exec(line);
  return m === null ? null : { name: m[1], text: line.slice(m[0].length) };
}
