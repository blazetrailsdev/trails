/**
 * ESLint rule: no-freeform-comments
 *
 * trails is a line-by-line port of Rails. A comment that restates what the TS
 * says, or that narrates a decision the Rails source already settles, is drift:
 * it competes with the Ruby for authority and it rots independently of both
 * sides. The comments worth having are the ones that point at Rails, the ones
 * the port's own conventions live in (JSDoc), and the ones a tool reads.
 *
 * So this rule deletes free-form comments and KEEPS three kinds:
 *
 *   1. JSDoc block comments (`/** ... *\/`). Every port convention lives here —
 *      `Mirrors:`, `@internal`, `@noRailsEquivalent`, `@missingRailsCall` — and
 *      `parity:api` / the ESLint manifests read them.
 *   2. Rails references — a `.rb` path or citation, a `Mirrors:` line, a Rails
 *      constant path. This is the fidelity anchor CLAUDE.md asks for.
 *   3. Tool directives — `eslint-*`, `@ts-*`, `prettier-ignore`, coverage
 *      pragmas, and this repo's own `boundary:` / `@boundary-file:` (read by
 *      `no-native-date`). Deleting these changes what the toolchain does.
 *
 * There is no opt-out marker. The rule shipped with a `keep:` escape hatch and
 * the sweep across arel and activemodel used it zero times, so it was removed:
 * a comment earns one of the three forms above or it goes.
 *
 * Rails' OWN comments are NOT kept, and that is deliberate. The Ruby is
 * vendored at `vendor/rails/` and every ported file carries a `Mirrors:` line
 * pointing at it, so a reader who wants Rails' annotation on a line reads it
 * at the source. Copying it into trails duplicates it into a second place that
 * rots on its own the moment Rails edits it — the same failure this rule
 * exists to prevent. Reference the Ruby; do not restate it.
 *
 * KNOWN LIMITATION: keep-rule 1 is unconditional, so reformatting a doomed
 * `//` comment as `/** ... *\/` bypasses the fix. That is deliberate and not
 * closable statically — JSDoc on a declaration is exactly where this repo puts
 * `Mirrors:`, `@internal` and `@noRailsEquivalent`, and no static check can
 * separate a real contract note from narration wearing the same syntax. The
 * check is review, not lint: a JSDoc block that documents nothing about the
 * declaration it sits on is the same drift this rule deletes, and should be
 * deleted in review.
 *
 * Requiring a tag or a Rails reference on every JSDoc block was measured and
 * rejected: it flags 94 pre-existing blocks in these two packages that are
 * ordinary API documentation ("Set the FROM table.", "Add GROUP BY."), which
 * is JSDoc doing its job. Tracked as
 * 0023-surfaced-deviations/close-jsdoc-bypass-in-no-freeform-comments.
 *
 * The fix is destructive by design: the point is to run it, then read the diff
 * and rescue whatever turns out to be load-bearing. Run it with
 * `--rule '{"blazetrails/no-freeform-comments":["warn",{"report":true}]}'` to
 * audit without deleting.
 */

/**
 * Directives the toolchain reads. Deleting one silently changes behaviour.
 *
 * `boundary:` / `@boundary-file:` are this repo's own directives, read by
 * `eslint/no-native-date.mjs` — they are the documented exemption for an
 * intentional JS `Date`, so deleting one reds that rule rather than merely
 * losing a note. They are matched anywhere in the comment, not just at the
 * start, because `no-native-date` accepts them mid-line
 * (`} /* boundary: *\/ else if (x instanceof Date)`).
 */
const DIRECTIVE_RE =
  /^\s*(?:eslint-(?:disable|enable)(?:-next-line|-line)?\b|eslint\s|globals?\s|exported\b|@ts-(?:expect-error|ignore|nocheck)\b|prettier-ignore\b|(?:v8|c8|istanbul|node:coverage)\s+ignore\b|@vitest-environment\b|#!)|\bboundary:|@boundary-file:/iu;

/**
 * A reference to the Rails source. Deliberately generous: a false KEEP costs
 * one line of audit, a false DELETE costs a fidelity anchor.
 *
 * - `query_methods.rb`, `relation/query_methods.rb:1604`
 * - `Mirrors:` / `Mirrors Rails:` — the repo's citation convention
 * - `ActiveRecord::Relation`, `Arel::Nodes::Grouping` — Ruby constant paths
 * - a bare `rails/` path
 *
 * This keeps pointers TO the Ruby, which is the whole substitute for copying
 * the Ruby's own comments across.
 */
const RAILS_REF_RE =
  /(?:\b[\w/]+\.rb\b|\bMirrors\b|\b(?:Active(?:Record|Model|Support|Storage|Job)|Arel|Abstract\w*)::|(?:^|\s)rails\/|\bRails\b|\bRuby\b|\bMRI\b)/u;

/**
 * A contiguous run of `//` comments is one human comment that happens to wrap.
 * Judging each physical line separately splits a Rails citation from the
 * sentence it anchors and deletes half of it, so line comments are grouped
 * into blocks first and kept or deleted whole.
 */
function groupLineComments(comments, sourceCode) {
  const groups = [];
  let current = null;
  for (const comment of comments) {
    if (comment.type !== "Line") {
      if (current) {
        groups.push(current);
        current = null;
      }
      groups.push([comment]);
      continue;
    }
    const contiguous =
      current &&
      comment.loc.start.line === current[current.length - 1].loc.end.line + 1 &&
      onlyCommentOnItsLine(comment, sourceCode) &&
      onlyCommentOnItsLine(current[current.length - 1], sourceCode);
    if (contiguous) current.push(comment);
    else {
      if (current) groups.push(current);
      current = [comment];
    }
  }
  if (current) groups.push(current);
  return groups;
}

/** True when nothing but whitespace precedes the comment on its own line. */
function onlyCommentOnItsLine(comment, sourceCode) {
  const line = sourceCode.lines[comment.loc.start.line - 1] ?? "";
  return line.slice(0, comment.loc.start.column).trim() === "";
}

/** JSDoc: a block comment opening `/**`, which is where the port conventions live. */
function isJsDoc(comment) {
  return comment.type === "Block" && comment.value.startsWith("*");
}

function isKept(group) {
  return group.some((comment) => {
    const text = comment.value;
    if (isJsDoc(comment)) return true;
    if (DIRECTIVE_RE.test(text)) return true;
    return RAILS_REF_RE.test(text);
  });
}

/**
 * The range to remove: the comment span, plus the whitespace back to the start
 * of its line and the trailing newline, so deleting a standalone comment does
 * not leave a blank line behind. A trailing comment (code on the same line)
 * keeps its line and loses only the comment and the space before it.
 */
function removalRange(group, sourceCode) {
  const first = group[0];
  const last = group[group.length - 1];
  const text = sourceCode.getText();
  let start = first.range[0];
  let end = last.range[1];
  const standalone = onlyCommentOnItsLine(first, sourceCode);
  while (start > 0 && (text[start - 1] === " " || text[start - 1] === "\t")) start--;
  if (standalone) {
    if (text[end] === "\r") end++;
    if (text[end] === "\n") end++;
  }
  return [start, end];
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Delete free-form comments; keep JSDoc, Rails references, tool directives, and explicitly marked comments.",
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          // Report without offering a fix — the audit mode.
          report: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      freeform:
        "Free-form comment. trails is a line-by-line Rails port: cite the Rails file, promote it to JSDoc, or delete it.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const reportOnly = context.options[0]?.report === true;
    return {
      Program() {
        for (const group of groupLineComments(sourceCode.getAllComments(), sourceCode)) {
          if (isKept(group)) continue;
          const range = removalRange(group, sourceCode);
          context.report({
            loc: { start: group[0].loc.start, end: group[group.length - 1].loc.end },
            messageId: "freeform",
            fix: reportOnly ? undefined : (fixer) => fixer.removeRange(range),
          });
        }
      },
    };
  },
};

export default rule;
export { RAILS_REF_RE, DIRECTIVE_RE };
