/**
 * ESLint rule: no-internal-canonical-loaders
 *
 * The sanctioned public surface for wiring the canonical AR test schema +
 * fixtures into a `*.test.ts` file is the `fixtures({ ... })` helper — one call
 * that wires the handler, transactional fixtures, and the canonical schema.
 *
 * The lower-level canonical loaders in
 * `packages/activerecord/src/support/canonical-schema.ts` —
 * `ensureCanonicalTables` and `loadCanonicalSchema` — are internal plumbing that
 * `fixtures()` and a couple of internal setup paths (the boot/template global
 * setup, the adapter-suite setup, `encryption/test-helpers.ts`) call. They are
 * NOT for direct use in test files; reaching for them re-invents schema wiring
 * that `fixtures({})` already owns. This rule fails any `*.test.ts` that imports
 * them directly.
 *
 * `rebuildCanonicalTables` is intentionally NOT banned: it is the documented
 * anti-contamination shield that test files legitimately call in a `beforeAll`
 * to restore a canonical table a sibling file left in a reduced shape on the
 * shared per-worker DB (see its JSDoc). It has no `fixtures({})` equivalent.
 *
 * Allowlist: the loaders' own unit test (`canonical-schema.test.ts`) imports
 * them to test them directly. Non-`*.test.ts` internal helpers are already out
 * of scope because this rule is wired to test files only.
 */

import path from "path";

/** Repo-relative path under packages/; null if outside the repo tree. */
export function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(/(?:^|\/)(packages\/.+)$/);
  return m ? m[1] : null;
}

// Symbols that must not be imported directly into a test file.
export const BANNED = new Set(["ensureCanonicalTables", "loadCanonicalSchema"]);

// Test files permitted to import the banned loaders (they test them directly).
export const ALLOW = new Set(["packages/activerecord/src/support/canonical-schema.test.ts"]);

/** True when `source` resolves to the canonical-schema test helper module. */
function isCanonicalSchemaModule(source) {
  // Match on the module basename regardless of directory depth so a
  // same-directory import from inside support/ (`./canonical-schema.js`)
  // is caught, not just the `../../support/canonical-schema.js` form. The
  // repo has a single canonical-schema module, so basename matching is safe.
  return /(?:^|\/)canonical-schema(?:\.js)?$/.test(source);
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid importing internal canonical-schema loaders (ensureCanonicalTables, loadCanonicalSchema) into a *.test.ts file; wire the canonical schema + fixtures through `fixtures({ ... })` instead.",
    },
    schema: [],
    messages: {
      banned:
        "`{{name}}` is internal canonical-schema plumbing — do not import it into a test file. Wire the canonical schema + fixtures through the `fixtures({ ... })` helper instead. (Only `canonical-schema.test.ts` may import it, to test it directly.)",
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    const rel = repoRel(filename) ?? path.basename(filename);
    if (ALLOW.has(rel)) return {};

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string") return;
        if (!isCanonicalSchemaModule(node.source.value)) return;
        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier") continue;
          const name = spec.imported.name;
          if (BANNED.has(name)) {
            context.report({ node: spec, messageId: "banned", data: { name } });
          }
        }
      },
    };
  },
};

export default rule;
