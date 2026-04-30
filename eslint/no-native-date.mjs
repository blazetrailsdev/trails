/**
 * ESLint rule: no-native-date
 *
 * Disallows JavaScript `Date` *value* usage in domain code. Use `Temporal`
 * types (Instant / PlainDate / PlainDateTime / PlainTime / ZonedDateTime)
 * instead.
 *
 * Honors two escape-hatch markers:
 *   - File-level: a JSDoc block containing `@boundary-file:` in the file
 *     *header* (before any non-comment token) — entire file is exempt.
 *   - Line-level: a `boundary:` keyword in a comment that is either
 *       (a) on the same line as the offending construct,
 *       (b) attached as a leading comment to the enclosing top-level
 *           statement, or
 *       (c) inside the enclosing statement, before the offending node
 *           (handles multi-line expressions and `} /[*] boundary [*]/ else if {`
 *           chains).
 *
 * Detected constructs:
 *   - `new Date(...)`
 *   - `x instanceof Date`
 *
 * Out of scope (return `number` or live in type position only):
 *   - `Date.now()` / `Date.parse(...)` / `Date.UTC(...)` — produce numbers,
 *     not propagating Date values.
 *   - `: Date` type references — constrain flow, don't create Date instances.
 *
 * The rule treats any reference to `Date` as the global only when it doesn't
 * resolve to a local binding (e.g. an `import { Date } from ...` or a class
 * named `Date` in scope), so files that locally rebind the name (such as
 * `activerecord/src/type.ts` importing the AR `Type::Date` class) are
 * naturally exempt.
 */

function hasFileBoundaryDirective(sourceCode) {
  // `@boundary-file:` only counts when it appears in a *JSDoc* block comment
  // in the file header — i.e. before any non-comment token AND the comment
  // body starts with `*` (the JSDoc shape). Honoring an arbitrary block
  // comment would let any `/* @boundary-file: */` slip through.
  const firstToken = sourceCode.getFirstToken(sourceCode.ast);
  const headerEnd = firstToken ? firstToken.range[0] : sourceCode.text.length;
  for (const comment of sourceCode.getAllComments()) {
    if (comment.range[0] >= headerEnd) break;
    if (
      comment.type === "Block" &&
      comment.value.startsWith("*") &&
      comment.value.includes("@boundary-file:")
    ) {
      return true;
    }
  }
  return false;
}

function hasBoundaryComment(allComments, sourceCode, node, dateRef) {
  // 1. Same-line trailing comment — anchored on the `Date` token itself
  //    (not the enclosing expression's start line) so multi-line `instanceof`
  //    / `new` expressions can carry the marker on the `Date` line.
  //    For `globalThis.Date` / `window.Date` we anchor on the property
  //    identifier so the marker on the `.Date` line is recognised even when
  //    the namespace token sits on a different line.
  const dateAnchor =
    dateRef && dateRef.type === "MemberExpression" ? dateRef.property : (dateRef ?? node);
  const dateLine = dateAnchor.loc.start.line;
  for (const comment of allComments) {
    if (comment.loc.start.line === dateLine && /\bboundary:/i.test(comment.value)) {
      return true;
    }
  }
  // Walk up to the enclosing top-level statement (parent is BlockStatement
  // or Program).
  let stmt = node;
  while (
    stmt &&
    stmt.parent &&
    stmt.parent.type !== "BlockStatement" &&
    stmt.parent.type !== "Program"
  ) {
    stmt = stmt.parent;
  }
  if (!stmt) return false;
  // 2. Comments attached as leading the enclosing statement.
  for (const comment of sourceCode.getCommentsBefore(stmt)) {
    if (/\bboundary:/i.test(comment.value)) return true;
  }
  // 3. Comments inside the enclosing statement before the offending node
  //    (covers multi-line expressions like `} /* boundary: */ else if (x instanceof Date)`).
  for (const comment of allComments) {
    if (
      comment.range[0] >= stmt.range[0] &&
      comment.range[1] <= node.range[0] &&
      /\bboundary:/i.test(comment.value)
    ) {
      return true;
    }
  }
  return false;
}

function isLocallyBoundDate(context, node) {
  // ESLint scope analysis — if `Date` resolves to a local variable, it's not
  // the JS global, so skip.
  const sourceCode = context.sourceCode || context.getSourceCode();
  let scope = sourceCode.getScope(node);
  while (scope) {
    const variable = scope.variables.find((v) => v.name === "Date");
    if (variable && variable.defs.length > 0) return true;
    scope = scope.upper;
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow JavaScript `Date` in domain code; prefer Temporal types. Use `// boundary:` or `@boundary-file:` for documented exemptions.",
    },
    schema: [],
    messages: {
      noNew:
        "Use `Temporal.Instant.fromEpochMilliseconds(...)` or another Temporal constructor instead of `new Date(...)`. Annotate with `// boundary:` if the JS `Date` is intentional.",
      noInstanceof:
        "Use `Temporal` type checks (e.g. `x instanceof Temporal.Instant`) instead of `instanceof Date`. Annotate with `// boundary:` if the JS `Date` is intentional.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    if (hasFileBoundaryDirective(sourceCode)) return {};

    // Cache the file's comment list once — getAllComments is otherwise
    // O(comments) per reported node.
    const allComments = sourceCode.getAllComments();

    function report(node, messageId, dateRef, data) {
      if (hasBoundaryComment(allComments, sourceCode, node, dateRef)) return;
      context.report({ node, messageId, data });
    }

    // Match `Date` (Identifier resolving to global) OR `globalThis.Date` /
    // `window.Date` / `self.Date` / `global.Date` (MemberExpression on a
    // global object).
    function isGlobalDateRef(refNode) {
      if (refNode.type === "Identifier" && refNode.name === "Date") {
        return !isLocallyBoundDate(context, refNode);
      }
      if (
        refNode.type === "MemberExpression" &&
        !refNode.computed &&
        refNode.property.type === "Identifier" &&
        refNode.property.name === "Date" &&
        refNode.object.type === "Identifier" &&
        /^(globalThis|window|self|global)$/.test(refNode.object.name)
      ) {
        return true;
      }
      return false;
    }

    return {
      NewExpression(node) {
        if (isGlobalDateRef(node.callee)) {
          report(node, "noNew", node.callee);
        }
      },
      BinaryExpression(node) {
        if (node.operator === "instanceof" && isGlobalDateRef(node.right)) {
          report(node, "noInstanceof", node.right);
        }
      },
    };
  },
};

export default rule;
