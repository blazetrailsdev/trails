/**
 * ESLint rule: no-internal-canonical-loaders
 *
 * The sanctioned public surface for wiring the canonical AR test schema +
 * fixtures into a `*.test.ts` file is the `fixtures({ ... })` helper — one call
 * that wires the handler, transactional fixtures, and the canonical schema.
 *
 * The lower-level canonical loaders in
 * `packages/activerecord/src/support/canonical-schema.ts`
 * (`loadCanonicalSchema`) and
 * `packages/activerecord/src/support/canonical-table-rebuild.ts`
 * (`ensureCanonicalTables`) are internal plumbing that
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
 * Allowlist: the loaders' own unit tests (`canonical-schema.test.ts`,
 * `canonical-table-rebuild.test.ts`) import them to test them directly.
 * Non-`*.test.ts` internal helpers are already out of scope because this rule
 * is wired to test files only.
 */

import path from "path";
import { canonicalLoaderModules, canonicalLoaderSelfTests } from "./test-infra-scope.mjs";

/**
 * Repo-relative path under one of the enforced roots; null if outside them.
 * `scripts/` counts as well as `packages/`: the rule is wired to both, so a
 * self-test living outside `packages/` still has to key its allowlist entry the
 * same way.
 */
export function repoRel(filename) {
  const norm = filename.replace(/\\/g, "/");
  const m = norm.match(/(?:^|\/)((?:packages|scripts)\/.+)$/);
  return m ? m[1] : null;
}

// Symbols that must not be imported directly into a test file. `loadSchema`
// (support/load-schema-helper.ts, the port of `LoadSchemaHelper#load_schema`)
// wraps `loadCanonicalSchema`, so banning only the wrapped symbol would leave
// the same schema-wiring backdoor open under a different name.
export const BANNED = new Set(["ensureCanonicalTables", "loadCanonicalSchema", "loadSchema"]);

// Test files permitted to import the banned loaders (they test them directly).
export const ALLOW = new Set(canonicalLoaderSelfTests);

/**
 * True when `source` resolves to one of the canonical-schema test helper
 * modules. Matched on the basename regardless of directory depth, so a
 * same-directory import from inside `support/` (`./canonical-schema.js`) is
 * caught and not just the `../../support/canonical-schema.js` form; the
 * basenames are unique in the repo, so basename matching is safe.
 *
 * An ESLint rule runs synchronously with no filesystem access, so the module
 * list cannot be derived from where the BANNED symbols actually live; it is
 * pinned instead by the guard test in this rule's `*.test.mjs`, which reads the
 * real `support/` tree and fails when a module exports a BANNED symbol and is
 * not listed in `canonicalLoaderModules`. Without that guard a file move — the
 * way `ensureCanonicalTables` moved into `canonical-table-rebuild.ts` — reopens
 * the ban silently: a banned symbol imported from an unlisted module is simply
 * not reported.
 */
export function isCanonicalSchemaModule(source) {
  return canonicalLoaderModuleSet.has(moduleBasename(source));
}

const canonicalLoaderModuleSet = new Set(canonicalLoaderModules);

/** `"../support/canonical-schema.js"` → `"canonical-schema"`. */
export function moduleBasename(source) {
  return source
    .split("/")
    .pop()
    .replace(/\.[cm]?js$/, "");
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
        "`{{name}}` is internal canonical-schema plumbing — do not import it into a test file. Wire the canonical schema + fixtures through the `fixtures({ ... })` helper instead. (Only the loaders' own unit tests — `canonical-schema.test.ts`, `canonical-table-rebuild.test.ts` — may import it, to test it directly.)",
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
