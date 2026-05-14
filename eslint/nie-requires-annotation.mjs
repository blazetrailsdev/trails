/**
 * ESLint rule: nie-requires-annotation
 *
 * Every `throw new NotImplementedError(...)` must carry an `@nie` annotation
 * comment on the immediately preceding line, specifying the disposition under
 * the `NotImplementedError` elimination initiative
 * (docs/activerecord-100-clusters.md).
 *
 * Allowed dispositions:
 *   port-real | keep-as-strategy-hook | remove-from-class |
 *   empty-default | delete-stub | TODO
 *
 * Format:
 *   // @nie disposition=<one-of-above> [rails=path[:line]] [cluster=<slug>]
 */

const ALLOWED = new Set([
  "port-real",
  "keep-as-strategy-hook",
  "remove-from-class",
  "empty-default",
  "delete-stub",
  "TODO",
]);

const ANNOTATION_RE = /@nie\s+disposition=([\w-]+)/;

function isNotImplementedThrow(node) {
  if (node.type !== "ThrowStatement") return false;
  const arg = node.argument;
  if (!arg || arg.type !== "NewExpression") return false;
  const callee = arg.callee;
  if (!callee) return false;
  if (callee.type === "Identifier" && callee.name === "NotImplementedError") return true;
  if (
    callee.type === "MemberExpression" &&
    callee.property &&
    callee.property.type === "Identifier" &&
    callee.property.name === "NotImplementedError"
  ) {
    return true;
  }
  return false;
}

function precedingAnnotation(node, sourceCode) {
  const comments = sourceCode.getCommentsBefore(node);
  if (!comments.length) return null;
  const last = comments[comments.length - 1];
  if (!last.loc || !node.loc) return null;
  if (last.loc.end.line !== node.loc.start.line - 1) return null;
  return last;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `@nie` disposition annotation on every `throw new NotImplementedError(...)`.",
    },
    fixable: "code",
    schema: [],
    messages: {
      missing:
        "`throw new NotImplementedError` requires a preceding `// @nie disposition=…` annotation. See docs/activerecord-100-clusters.md.",
      invalid:
        "Invalid `@nie disposition=` value `{{value}}`. Allowed: port-real, keep-as-strategy-hook, remove-from-class, empty-default, delete-stub, TODO.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      ThrowStatement(node) {
        if (!isNotImplementedThrow(node)) return;
        const comment = precedingAnnotation(node, sourceCode);
        const match = comment && comment.value.match(ANNOTATION_RE);
        if (!match) {
          context.report({
            node,
            messageId: "missing",
            fix(fixer) {
              const lineText = sourceCode.lines[node.loc.start.line - 1] ?? "";
              const indent = (lineText.match(/^(\s*)/) || ["", ""])[1];
              return fixer.insertTextBeforeRange(node.range, `// @nie disposition=TODO\n${indent}`);
            },
          });
          return;
        }
        if (!ALLOWED.has(match[1])) {
          context.report({ node: comment, messageId: "invalid", data: { value: match[1] } });
        }
      },
    };
  },
};

export default rule;
