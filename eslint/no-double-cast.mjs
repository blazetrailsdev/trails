/**
 * ESLint rule: no-double-cast
 *
 * Reports `x as unknown as T`: a cast through `unknown` that discards every
 * check the compiler had on `x`. Held at `warn` in the type-polish packages'
 * `lib/` (RFC 0242) and counted per file against `origin/main` by
 * `pnpm parity:lint:counts` (scripts/parity/eslint-count.ts), so a file's
 * count may only shrink.
 */

function isUnknownCast(node) {
  return (
    (node.type === "TSAsExpression" || node.type === "TSTypeAssertion") &&
    node.typeAnnotation.type === "TSUnknownKeyword"
  );
}

export default {
  meta: {
    type: "problem",
    docs: { description: "Disallow `x as unknown as T` double casts" },
    schema: [],
    messages: {
      doubleCast:
        "`as unknown as` discards the type of the cast value. Type it so one cast, or none, suffices.",
    },
  },
  create(context) {
    function check(node) {
      if (node.typeAnnotation.type === "TSUnknownKeyword") return;
      if (isUnknownCast(node.expression)) context.report({ node, messageId: "doubleCast" });
    }
    return { TSAsExpression: check, TSTypeAssertion: check };
  },
};
