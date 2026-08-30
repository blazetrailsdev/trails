/**
 * ESLint rule: ruby-compat-needs-mri-citation
 *
 * `@blazetrails/ruby-compat` is the one package `parity:api` can never enroll.
 * MRI's surface is C, so `scripts/api-compare/extract-ruby-api.rb` extracts
 * nothing from it — the finding that put `compareApi: false` on the `date`
 * entry in `vendor/sources.ts`. RFC 0089 read that as "this package has no
 * anchor"; with `vendor/ruby/` in the tree it has one, and it is a CITATION
 * rather than an extraction — checkable, which is what separates it from a
 * JSDoc habit. So every exported declaration under `packages/ruby-compat/src/`
 * carries BOTH halves of the package contract (see the README):
 *
 *   - a `vendor/ruby/<file>:<line>` citation, RESOLVED against the pinned tree
 *     rather than pattern-matched: the file has to exist at the pinned SHA and
 *     the line has to be within it; and
 *   - a `@noRailsEquivalent PERMANENT` receipt, which re-enters the member into
 *     the measured surface (RFC 0121) and is `PERMANENT` because there is no
 *     Rails method for a Ruby primitive to converge onto.
 *
 * WHEN `vendor/ruby/` IS ABSENT the rule SKIPS, reporting nothing: the vendor
 * tree is fetched rather than committed, so a contributor who has not run
 * `pnpm vendor:fetch` would otherwise be blocked by a citation they wrote
 * correctly. The `rails-comparison` CI job fetches it and is the enforcing run
 * (eslint/rails-private-jsdoc.config.mjs); a local green proves nothing here.
 *
 * Precedent for a manifest-backed JSDoc requirement is
 * `blazetrails/rails-private-jsdoc`.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** `vendor/ruby/<path>:<line>`, anywhere in the doc block. */
const CITATION = /vendor\/ruby\/([A-Za-z0-9_./+-]+):(\d+)/g;

function repoRoot() {
  let dir = __dirname;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  return path.resolve(__dirname, "..");
}

/**
 * Test seam: `settings.rubyCompatVendorRoot` points the resolver at a fixture
 * tree, or at `null` for the "vendor tree absent" state. It lives in the config
 * rather than in module state because a RuleTester case runs long after the
 * test file's own body has finished.
 */
function vendorRoot(context) {
  const override = context.settings?.rubyCompatVendorRoot;
  if (override !== undefined) return override;
  const root = path.join(repoRoot(), "vendor", "ruby");
  return fs.existsSync(root) ? root : null;
}

const lineCounts = new Map();

/** Line count of `<vendorRoot>/<rel>`, or `null` when the pin has no such file. */
function lineCountOf(root, rel) {
  const key = `${root} ${rel}`;
  if (lineCounts.has(key)) return lineCounts.get(key);
  const full = path.join(root, rel);
  let count = null;
  // A citation is untrusted text: `..` in it must not read outside the pin.
  if (path.relative(root, full).startsWith("..")) {
    count = null;
  } else if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    const text = fs.readFileSync(full, "utf8");
    count = text.length === 0 ? 0 : text.replace(/\n$/, "").split("\n").length;
  }
  lineCounts.set(key, count);
  return count;
}

function docBlockFor(node, sourceCode) {
  const comments = sourceCode.getCommentsBefore(node);
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.type === "Block" && c.value.startsWith("*")) return c;
  }
  return null;
}

/** Read the way `fileLevelNoRailsEquivalentReason` in extract-ts-api.ts reads a
 *  file-level receipt: a block above the imports, or one a blank line separates
 *  from what follows. */
function fileLevelBlock(sourceCode) {
  const first = sourceCode.ast.body[0];
  if (!first) return null;
  const comments = sourceCode
    .getCommentsBefore(first)
    .filter((c) => c.type === "Block" && c.value.startsWith("*"));
  if (comments.length === 0) return null;
  if (first.type === "ImportDeclaration") return comments[0];
  const followedBy = [...comments.slice(1), first];
  for (let i = comments.length - 1; i >= 0; i--) {
    if (followedBy[i].loc.start.line - comments[i].loc.end.line < 2) continue;
    return comments[i];
  }
  return null;
}

function check(context, node, name) {
  if (!name) return;
  const root = vendorRoot(context);
  if (root === null) return;

  const sourceCode = context.sourceCode ?? context.getSourceCode();
  const target = node.parent && node.parent.type === "ExportNamedDeclaration" ? node.parent : node;
  const blocks = [docBlockFor(target, sourceCode), fileLevelBlock(sourceCode)].filter(Boolean);
  const text = blocks.map((c) => c.value).join("\n");

  if (!/@noRailsEquivalent\s+PERMANENT\b/.test(text)) {
    context.report({ node: target, messageId: "missingReceipt", data: { name } });
    return;
  }

  const citations = [...text.matchAll(CITATION)];
  if (citations.length === 0) {
    context.report({ node: target, messageId: "missingCitation", data: { name } });
    return;
  }
  for (const [, rel, lineText] of citations) {
    const lines = lineCountOf(root, rel);
    if (lines === null) {
      context.report({ node: target, messageId: "unknownFile", data: { name, rel } });
      return;
    }
    const line = Number(lineText);
    if (line < 1 || line > lines) {
      context.report({
        node: target,
        messageId: "lineOutOfRange",
        data: { name, rel, line: String(line), lines: String(lines) },
      });
      return;
    }
  }
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a resolvable `vendor/ruby/<file>:<line>` citation and a `@noRailsEquivalent PERMANENT` receipt on every ruby-compat export.",
    },
    schema: [],
    messages: {
      missingReceipt:
        "`{{name}}` is exported from ruby-compat without a `@noRailsEquivalent PERMANENT` receipt. Every name in this package is extra surface by construction and none of them can converge onto a Rails method.",
      missingCitation:
        "`{{name}}` is exported from ruby-compat without a `vendor/ruby/<file>:<line>` citation. Name the MRI source this mirrors — the citation is this package's fidelity anchor, in place of the `parity:api` comparison it can never have.",
      unknownFile:
        "`{{name}}` cites `vendor/ruby/{{rel}}`, which the pinned ruby/ruby checkout does not contain.",
      lineOutOfRange:
        "`{{name}}` cites `vendor/ruby/{{rel}}:{{line}}`, but that file has {{lines}} lines at the pinned SHA.",
    },
  },
  create(context) {
    return {
      "Program > ExportNamedDeclaration > FunctionDeclaration"(node) {
        check(context, node, node.id?.name);
      },
      "Program > ExportNamedDeclaration > ClassDeclaration"(node) {
        check(context, node, node.id?.name);
      },
      "Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator"(node) {
        check(context, node.parent, node.id?.name);
      },
      "Program > ExportNamedDeclaration > TSTypeAliasDeclaration"(node) {
        check(context, node, node.id?.name);
      },
      // Interfaces are exempt by KIND in `parity:api:extra`, so a receipt on
      // one would be a tag the extractor scores STALE.
    };
  },
};

export default rule;
