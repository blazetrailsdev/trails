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
 * The manifest is gitignored and built from rails-api.json, so this rule only
 * goes live in the `rails-comparison` CI job; it no-ops wherever the manifest
 * is absent (see `manifestAvailable`).
 *
 * ENROLLMENT is per package, in the `files` list of the rule's block in
 * eslint.config.mjs and eslint/rails-private-jsdoc.config.mjs. That set is
 * ONLY-GROW: a package joins once its `@internal` tags are burnt down, and no
 * package is ever removed to get a red run green.
 */
import {
  attachedJsDoc,
  isInstanceMember,
  loadManifest,
  manifestAvailable,
  relFromRepoRoot,
} from "./rails-private-jsdoc.mjs";

/**
 * A whole file with no Rails counterpart carries ONE `@noRailsEquivalent` in a
 * JSDoc block at the top, and it covers every otherwise-extra name in the file
 * (`fileLevelNoRailsEquivalentReason` in extract-ts-api.ts). Read it the same
 * way the extractor does — from a block above the imports, or from a DETACHED
 * block (one a blank line separates from what follows). A block written
 * directly above a declaration is that declaration's own doc block and is NOT
 * file-level, which is the invariant the blank line preserves.
 */
function hasFileLevelReceipt(sourceCode) {
  const first = sourceCode.ast.body[0];
  if (!first) return false;
  const comments = sourceCode
    .getCommentsBefore(first)
    .filter((c) => c.type === "Block" && c.value.startsWith("*"));
  if (comments.length === 0) return false;
  if (first.type === "ImportDeclaration") {
    return comments.some((c) => c.value.includes("@noRailsEquivalent"));
  }
  const followedBy = [...comments.slice(1), first];
  for (let i = comments.length - 1; i >= 0; i--) {
    // A blank line between the block and what follows means TypeScript binds it
    // to nothing, so reading it as file-level widens no declaration's doc.
    if (followedBy[i].loc.start.line - comments[i].loc.end.line < 2) continue;
    return comments[i].value.includes("@noRailsEquivalent");
  }
  return false;
}

function check(context, node, name) {
  if (!name) return;
  // No manifest means no information, and this rule's polarity turns that into
  // "every `@internal` is unbacked" — the opposite of `rails-private-jsdoc`,
  // which requires the tag NOWHERE under the same condition. The standalone
  // Lint job builds the manifest with `--allow-missing` (no Ruby there), so it
  // is genuinely absent and this rule must fail open, exactly as
  // `rails-file-structure-method-order` no-ops there. It goes live in the
  // `rails-comparison` job, which extracts rails-api.json first.
  if (!manifestAvailable()) return;
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

  // Backed either file-wide or on the instance half alone: a name private on the
  // instance half and public on the `ClassMethods` half of one Concern folds out
  // of the file-wide union (`attribute`, attributes.rb:59 vs :161), and the
  // `@internal` the forward rule requires there is backed by `instanceFiles`.
  const manifest = loadManifest();
  const rel = relFromRepoRoot(filename);
  if (manifest.files?.[rel]?.includes(name)) return;
  if (isInstanceMember(node) && manifest.instanceFiles?.[rel]?.includes(name)) return;

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
