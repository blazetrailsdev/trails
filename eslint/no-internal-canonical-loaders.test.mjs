import { RuleTester } from "eslint";
import rule from "./no-internal-canonical-loaders.mjs";

const FILENAME = "packages/activerecord/src/dirty.test.ts";
const OWN_TEST = "packages/activerecord/src/support/canonical-schema.test.ts";
const OWN_REBUILD_TEST = "packages/activerecord/src/support/canonical-table-rebuild.test.ts";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-internal-canonical-loaders", rule, {
  valid: [
    // The sanctioned surface — fixtures({}) — is never flagged.
    {
      filename: FILENAME,
      code: 'import { fixtures } from "./test-fixtures.js";',
    },
    // rebuildCanonicalTables is the documented anti-contamination shield — allowed.
    {
      filename: FILENAME,
      code: 'import { rebuildCanonicalTables } from "./support/canonical-table-rebuild.js";',
    },
    // The loaders' own unit test may import them directly — via the real
    // same-directory specifier it actually uses.
    {
      filename: OWN_TEST,
      code: 'import { loadCanonicalSchema } from "./canonical-schema.js";',
    },
    // Same for the drop/rebuild half's own unit test, which owns
    // ensureCanonicalTables since the split.
    {
      filename: OWN_REBUILD_TEST,
      code: 'import { ensureCanonicalTables } from "./canonical-table-rebuild.js";',
    },
    // load-schema-helper's own unit test may import loadSchema directly.
    {
      filename: "packages/activerecord/src/support/load-schema-helper.test.ts",
      code: 'import { loadSchema } from "./load-schema-helper.js";',
    },
    // A banned symbol imported from an unrelated module is not the loader.
    {
      filename: FILENAME,
      code: 'import { loadCanonicalSchema } from "./some-other-module.js";',
    },
  ],
  invalid: [
    {
      filename: FILENAME,
      code: 'import { ensureCanonicalTables } from "./support/canonical-table-rebuild.js";',
      errors: [{ messageId: "banned", data: { name: "ensureCanonicalTables" } }],
    },
    {
      filename: FILENAME,
      code: 'import { loadCanonicalSchema } from "./support/canonical-schema.js";',
      errors: [{ messageId: "banned", data: { name: "loadCanonicalSchema" } }],
    },
    // `loadSchema` wraps `loadCanonicalSchema`, so the Rails-named entry point
    // is banned in test files too.
    {
      filename: FILENAME,
      code: 'import { loadSchema } from "./support/load-schema-helper.js";',
      errors: [{ messageId: "banned", data: { name: "loadSchema" } }],
    },
    // Deeper relative path (adapters/mysql2/*.test.ts reaching up two levels).
    {
      filename: "packages/activerecord/src/adapters/mysql2/mysql2-adapter.test.ts",
      code: 'import { ensureCanonicalTables } from "../../support/canonical-table-rebuild.js";',
      errors: [{ messageId: "banned", data: { name: "ensureCanonicalTables" } }],
    },
    // Same-directory sibling test inside test-helpers/ (not the allowlisted own
    // test) — the most likely place to reach for the loaders via
    // `./canonical-schema.js`. Must still be caught.
    {
      filename: "packages/activerecord/src/support/schema-file-generator.test.ts",
      code: 'import { loadCanonicalSchema } from "./canonical-schema.js";',
      errors: [{ messageId: "banned", data: { name: "loadCanonicalSchema" } }],
    },
    // Both banned symbols in one import → one report each.
    {
      filename: FILENAME,
      code: 'import { ensureCanonicalTables, loadCanonicalSchema } from "./support/canonical-table-rebuild.js";',
      errors: [
        { messageId: "banned", data: { name: "ensureCanonicalTables" } },
        { messageId: "banned", data: { name: "loadCanonicalSchema" } },
      ],
    },
  ],
});
