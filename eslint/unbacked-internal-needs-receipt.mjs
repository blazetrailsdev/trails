/**
 * ESLint rule: unbacked-internal-needs-receipt
 *
 * The reverse of `rails-private-jsdoc`. That rule REQUIRES `@internal` where the
 * Rails counterpart is private on every host in the Ruby file; nothing checked
 * the other direction, so an `@internal` on a public member with no Rails-private
 * counterpart silently removed it from the measured surface (the extractor set
 * `internal: true`, and `extra-surface.ts` drops every internal member).
 *
 * RFC 0121 settles it: `@internal` keeps its TypeDoc meaning, and where the
 * member has no Rails-private counterpart it must ALSO carry
 * `@noRailsEquivalent <reason>`. That tag wins in the extractor
 * (`internalJsDocTagApplies`), so the member re-enters the measured surface and
 * is scored `Allowed` — PERMANENT or CONVERGEABLE — instead of vanishing.
 *
 * This rule flags a public declaration carrying `@internal` whose (file, name) is
 * absent from `eslint/rails-private-methods.json` (built by
 * `pnpm rails-privates:manifest`) and which carries no `@noRailsEquivalent`. It
 * is not autofixable: the remedy is a reviewed reason, or deleting a tag that was
 * never earned.
 *
 * ENROLLMENT is per package, in the `files` list of the rule's block in
 * eslint.config.mjs and eslint/rails-private-jsdoc.config.mjs. That set is
 * ONLY-GROW: a package joins once its `@internal` tags are burnt down, and no
 * package is ever removed to get a red run green.
 */
import { attachedJsDoc, loadManifest, relFromRepoRoot } from "./rails-private-jsdoc.mjs";

/**
 * A whole file with no Rails counterpart carries ONE `@noRailsEquivalent` in a
 * JSDoc block above the imports, and it covers every otherwise-extra name in
 * the file (`fileLevelNoRailsEquivalentReason` in extract-ts-api.ts). Read it
 * the same way the extractor does — only when the first statement is an import,
 * since a block above a declaration is that declaration's own doc block.
 */
function hasFileLevelReceipt(sourceCode) {
  const first = sourceCode.ast.body[0];
  if (!first || first.type !== "ImportDeclaration") return false;
  return sourceCode
    .getCommentsBefore(first)
    .some(
      (c) =>
        c.type === "Block" && c.value.startsWith("*") && c.value.includes("@noRailsEquivalent"),
    );
}

function check(context, node, name) {
  if (!name) return;
  // `_`-prefixed names are dropped from the measured surface by name alone
  // (`walkTsFileSurface` in extra-surface.ts), before `internal` is even read.
  // An `@internal` there hides nothing, and a `@noRailsEquivalent` written on
  // one would score STALE, so neither remedy in the message applies.
  if (name.startsWith("_")) return;
  const target = node.parent && node.parent.type === "ExportNamedDeclaration" ? node.parent : node;
  const filename = context.filename ?? context.getFilename?.();
  if (!filename) return;

  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const comment = attachedJsDoc(target, sourceCode);
  if (comment === null || !comment.value.includes("@internal")) return;
  if (comment.value.includes("@noRailsEquivalent")) return;
  if (hasFileLevelReceipt(sourceCode)) return;

  const fileNames = loadManifest().files?.[relFromRepoRoot(filename)];
  if (fileNames && fileNames.includes(name)) return;

  context.report({ node: target, messageId: "unbackedInternal", data: { name } });
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `@noRailsEquivalent` alongside `@internal` where no Rails-private counterpart exists.",
    },
    schema: [],
    messages: {
      unbackedInternal:
        "`{{name}}` is tagged `@internal` but has no Rails-private counterpart in this file, so the tag drops it from the measured surface with no receipt. Add a `@noRailsEquivalent <PERMANENT|CONVERGEABLE ...>` tag beside it, or remove the `@internal` tag.",
    },
  },
  create(context) {
    return {
      "Program > ExportNamedDeclaration > FunctionDeclaration"(node) {
        check(context, node, node.id?.name);
      },
      // Deliberately NOT matching a NON-exported `Program > FunctionDeclaration`,
      // which `rails-private-jsdoc` does match: `extractFileLocalHelpers` marks
      // every file-local helper `internal` from its lack of an export, so the
      // JSDoc tag decides nothing there and no receipt could apply.
      "ClassBody > MethodDefinition"(node) {
        if (node.key?.type !== "Identifier") return;
        if (node.accessibility === "private" || node.accessibility === "protected") return;
        check(context, node, node.key.name);
      },
      "ClassBody > PropertyDefinition"(node) {
        if (node.key?.type !== "Identifier") return;
        if (node.accessibility === "private" || node.accessibility === "protected") return;
        check(context, node, node.key.name);
      },
      // Deliberately NOT matching interface members, which `rails-private-jsdoc`
      // DOES match. The forward direction has to reach them because TypeDoc
      // documents a polymorphic-dispatch contract independently of its
      // implementation. The reverse direction has nothing to protect: a novel
      // `interface` declaration is exempt by kind in `parity:api:extra` — "its
      // MEMBERS are exempt with it" — so an `@internal` there hides no measured
      // surface, and a `@noRailsEquivalent` written on one would score STALE.
    };
  },
};

export default rule;
