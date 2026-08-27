/**
 * ESLint rule: no-freeform-comments
 *
 * Policy, 2026-08-27 (maintainer): trails carries no English-language
 * comments. trails is a line-by-line port and the Ruby is vendored at
 * `vendor/rails/`; a sentence here is a second description of something Rails
 * already documents, in a place that rots independently of both sides.
 *
 * So this rule deletes comments and KEEPS exactly two kinds:
 *
 *   1. The repo's own JSDoc flags — `@internal`, `@noRailsEquivalent`,
 *      `@missingRailsCall`, `@missingRailsArgs` — together with the reason
 *      argument each requires. `parity:api:extra` and
 *      `lint-missing-rails-call-reasons` read those reasons and they are
 *      reviewed, so they are arguments, not prose.
 *   2. Tool directives — `eslint-*`, `@ts-*`, `prettier-ignore`, coverage
 *      pragmas, and this repo's own `boundary:` / `@boundary-file:` (read by
 *      `no-native-date`) and `@nie disposition=` (read by
 *      `nie-requires-annotation`). Deleting one changes what the toolchain
 *      does.
 *
 * Everything else goes, with no opt-out marker: `//` narration, prose
 * paragraphs, descriptive JSDoc summaries (`/** Add GROUP BY. *\/`), and
 * `@param` / `@returns` / `@example`, which carry English by construction.
 * TypeDoc loses those summaries; that is accepted — the signature carries it.
 *
 * Rails citations are NOT kept either. A `Mirrors:` line, a `.rb:LINE`
 * reference and a Ruby constant path were all kept until 2026-08-27, on the
 * theory that a pointer is not a sentence. The pointer rots the same way — a
 * line number is wrong the moment Rails edits the file above it — and in
 * practice the citation was the hook the prose hung off. The Ruby is vendored;
 * `pnpm rails:find <query>` maps a name to its `file:line` on demand.
 *
 * The fix is destructive by design: run it, then read the diff and rescue
 * whatever turns out to be load-bearing. Run it with
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
 *
 * `@nie disposition=` is likewise read by `eslint/nie-requires-annotation.mjs`,
 * which REQUIRES it on every `throw new NotImplementedError(...)` — deleting
 * one reds that rule.
 */
const DIRECTIVE_RE =
  /^[\s*]*(?:eslint-(?:disable|enable)(?:-next-line|-line)?\b|eslint\s|globals?\s|exported\b|@ts-(?:expect-error|ignore|nocheck)\b|prettier-ignore\b|(?:v8|c8|istanbul|node:coverage)\s+ignore\b|@vitest-environment\b|#!)|\bboundary:|@boundary-file:|@nie\s+disposition=/iu;

/**
 * The repo's own JSDoc flags, the only tags that survive. Each is read by a
 * tool — `parity:api:extra` scores `@noRailsEquivalent`,
 * `lint-missing-rails-call-reasons` scores `@missingRailsCall` /
 * `@missingRailsArgs`, and `@internal` decides whether a member is measured at
 * all — so the tag AND the reason argument it requires are machine input.
 *
 * `@empty` marks an intentionally-empty block. ESLint's `no-empty` ignores a
 * block that contains a comment, which is how an empty branch used to be
 * legal — the English sentence in it was load-bearing. `@empty` is that
 * comment with the English taken out: the port mirrors Rails' empty arms, and
 * `/** @empty *\/` keeps them legal without narrating them.
 *
 * `@param` / `@returns` / `@example` are deliberately absent: nothing reads
 * them and they are English by construction.
 */
const KEPT_TAG_RE = /@(internal|noRailsEquivalent|missingRailsCall|missingRailsArgs|empty)\b/u;

/**
 * The permanence token `parity:api:extra` and `lint-missing-rails-call-reasons`
 * switch on. It is the only argument a tag keeps; the English reason after it
 * is prose.
 */
const PERMANENCE_RE = /^\s*(PERMANENT|CONVERGEABLE)\b/u;

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

/**
 * The machine-read content of one comment, as the lines that survive.
 *
 * A tag document carries simple data or nothing: `@internal` is the whole tag,
 * `@noRailsEquivalent` and `@missingRailsCall` / `@missingRailsArgs` keep only
 * the permanence token the extractors switch on, and a directive line is
 * key=value input kept verbatim. The English reason that used to follow a tag
 * is prose in a tag's clothing and goes with the rest.
 */
function hasDirective(comment) {
  return comment.value.split("\n").some((line) => DIRECTIVE_RE.test(line));
}

function keptLines(comment) {
  const kept = [];
  for (const line of comment.value.split("\n")) {
    if (DIRECTIVE_RE.test(line)) {
      kept.push(line);
      continue;
    }
    const tag = KEPT_TAG_RE.exec(line);
    if (!tag) continue;
    const indent = /^[\s*]*/u.exec(line)[0];
    const name = tag[1];
    const permanence = PERMANENCE_RE.exec(line.slice(tag.index + tag[0].length));
    kept.push(`${indent}@${name}${permanence ? ` ${permanence[1]}` : ""}`);
  }
  return kept;
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

/**
 * The comment rewritten down to `kept`, or `null` when nothing survives. A
 * single kept line collapses to a one-line block; several keep the block form.
 */
function renderComment(comment, kept) {
  if (kept.length === 0) return null;
  if (comment.type === "Line") return `//${kept[0].replace(/^[\s*]*/u, " ")}`;
  const indent = " ".repeat(comment.loc.start.column);
  const open = isJsDoc(comment) ? "/**" : "/*";
  const bodies = kept.map((line) => line.replace(/^[\s*]*/u, ""));
  if (bodies.length === 1) return `${open} ${bodies[0]} */`;
  return [open, ...bodies.map((b) => `${indent} * ${b}`), `${indent} */`].join("\n");
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Delete English-language comments; keep only the repo's JSDoc flags and tool directives.",
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
      prose:
        "English-language comment. trails carries none: only the repo's JSDoc flags with their permanence token, and tool directives.",
      freeform:
        "English-language comment. trails carries none: only the repo's JSDoc flags with their permanence token, and tool directives.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const reportOnly = context.options[0]?.report === true;
    return {
      "Program:exit"(program) {
        if (program.body.length === 0) return;
        for (const group of groupLineComments(sourceCode.getAllComments(), sourceCode)) {
          // A directive comment is machine input: rewriting it is how the
          // first fix pass turned `/* eslint-disable */` into `/** ... */`,
          // which the second pass no longer recognised and deleted.
          if (group.some(hasDirective)) continue;
          const rewrites = group.map((comment) => [comment, keptLines(comment)]);
          const anyKept = rewrites.some(([, kept]) => kept.length > 0);
          const changed = rewrites.some(
            ([comment, kept]) => kept.join("\n") !== comment.value.replace(/^\*/u, ""),
          );
          if (anyKept && !changed) continue;

          if (!anyKept) {
            const range = removalRange(group, sourceCode);
            context.report({
              loc: { start: group[0].loc.start, end: group[group.length - 1].loc.end },
              messageId: group.some(isJsDoc) ? "prose" : "freeform",
              fix: reportOnly ? undefined : (fixer) => fixer.removeRange(range),
            });
            continue;
          }

          for (const [comment, kept] of rewrites) {
            const replacement = renderComment(comment, kept);
            if (replacement === sourceCode.getText(comment)) continue;
            context.report({
              loc: comment.loc,
              messageId: "prose",
              fix: reportOnly
                ? undefined
                : (fixer) =>
                    replacement === null
                      ? fixer.removeRange(removalRange([comment], sourceCode))
                      : fixer.replaceText(comment, replacement),
            });
          }
        }
      },
    };
  },
};

export default rule;
export { KEPT_TAG_RE, DIRECTIVE_RE };
