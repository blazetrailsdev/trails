/**
 * ESLint rule: perf-tag-placement (RFC 0194)
 *
 * `@perf` receipts a declaration or arm that exists only for a measured hot
 * path, so a reader and a gate can tell it from a deviation forced by a
 * language shortcoming. Its one shape is
 * `@perf <measurement> — PERMANENT|CONVERGEABLE <story-id>`, the measurement a
 * number and unit (`100ns`, `2x`, `30%`). It must document a declaration: a
 * tag left behind when its declaration was deleted is stale. A `CONVERGEABLE`
 * story that is closed is caught by `scripts/stale-story-references.ts`.
 *
 * Hard rules: no node:* imports, no process.* references.
 */
import { lineLeadingTag } from "./jsdoc-tag-line.mjs";

const TAG = "perf";

const SHAPE =
  /^(\d+(?:\.\d+)?(?:ns|us|ms|s|x|%))\s+—\s+(?:PERMANENT|CONVERGEABLE\s+[a-z0-9]+(?:-[a-z0-9]+){2,})\s*(?:\*\/)?\s*$/u;

const DECLARATIONS = new Set([
  "FunctionDeclaration",
  "ClassDeclaration",
  "VariableDeclaration",
  "MethodDefinition",
  "PropertyDefinition",
  "TSAbstractMethodDefinition",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
]);

function documentsDeclaration(sourceCode, comment) {
  const token = sourceCode.getTokenAfter(comment, { includeComments: false });
  if (token === null) return false;
  let node = sourceCode.getNodeByRangeIndex(token.range[0]);
  while (node && !DECLARATIONS.has(node.type) && node.parent?.range[0] === token.range[0]) {
    node = node.parent;
  }
  return node !== null && DECLARATIONS.has(node.type) && node.range[0] === token.range[0];
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `@perf <measurement> — PERMANENT|CONVERGEABLE <story-id>` on a declaration.",
    },
    schema: [],
    messages: {
      malformed:
        "`@perf` takes one shape: `@perf <measurement> — PERMANENT|CONVERGEABLE <story-id>`, the measurement a number and unit (`100ns`, `2x`).",
      orphan: "`@perf` must document a declaration; one with nothing after it is stale.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type !== "Block" || !comment.value.startsWith("*")) continue;
          const tags = comment.value
            .split("\n")
            .map(lineLeadingTag)
            .filter((tag) => tag !== null && tag.name === TAG);
          if (tags.length === 0) continue;
          for (const tag of tags) {
            if (!SHAPE.test(tag.text.trim())) {
              context.report({ loc: comment.loc, messageId: "malformed" });
            }
          }
          if (!documentsDeclaration(sourceCode, comment)) {
            context.report({ loc: comment.loc, messageId: "orphan" });
          }
        }
      },
    };
  },
};

export default rule;
