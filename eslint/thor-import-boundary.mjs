/**
 * ESLint rule: thor-import-boundary
 *
 * `packages/trailties/src/thor/` is the port of the thor gem, nested inside
 * trailties (api-compare's `PACKAGE_DIR_OVERRIDES.thor`). Thor depends on
 * nothing but Ruby's standard library (`vendor/thor/v1.3.2/thor.gemspec`), so
 * its port may reach only what stands in for that: `@blazetrails/ruby-compat`
 * and `@blazetrails/did-you-mean`. A relative import that leaves `thor/` would
 * make Thor depend on railties, the reverse of the gems' real edge.
 */

import path from "path";

const THOR_ROOT = "packages/trailties/src/thor/";
const ALLOWED_PACKAGES = ["@blazetrails/ruby-compat", "@blazetrails/did-you-mean"];

/** `filename`'s path below the thor root, or null when it is not a thor file. */
export function thorRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const at = norm.lastIndexOf(THOR_ROOT);
  return at === -1 ? null : norm.slice(at + THOR_ROOT.length);
}

/** Which boundary `source` crosses when imported from the thor file `rel`. */
export function violation(rel, source) {
  if (source.startsWith(".")) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), source));
    return target === ".." || target.startsWith("../") ? "outside" : null;
  }
  if (!source.startsWith("@blazetrails/")) return null;
  return ALLOWED_PACKAGES.some((pkg) => source === pkg || source.startsWith(pkg + "/"))
    ? null
    : "package";
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "The thor port imports nothing outside thor/ but @blazetrails/ruby-compat and " +
        "@blazetrails/did-you-mean.",
    },
    schema: [],
    messages: {
      outside:
        "'{{source}}' leaves packages/trailties/src/thor/. Thor does not depend on railties; " +
        "railties depends on Thor.",
      package:
        "'{{source}}' is not a Thor dependency. The thor port may import only " +
        "@blazetrails/ruby-compat and @blazetrails/did-you-mean.",
    },
  },

  create(context) {
    const rel = thorRel(context.filename);
    if (rel === null) return {};
    const check = (node) => {
      const source = node.source;
      if (!source || typeof source.value !== "string") return;
      const messageId = violation(rel, source.value);
      if (messageId) context.report({ node: source, messageId, data: { source: source.value } });
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};
