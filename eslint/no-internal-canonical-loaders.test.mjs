import { RuleTester } from "eslint";
import rule from "./no-internal-canonical-loaders.mjs";

const FILENAME = "packages/activerecord/src/dirty.test.ts";
const OWN_TEST = "packages/activerecord/src/test-helpers/canonical-schema.test.ts";

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
      code: 'import { fixtures } from "./test-helpers/fixtures.js";',
    },
    // rebuildCanonicalTables is the documented anti-contamination shield — allowed.
    {
      filename: FILENAME,
      code: 'import { rebuildCanonicalTables } from "./test-helpers/canonical-schema.js";',
    },
    // The loaders' own unit test may import them to test them directly.
    {
      filename: OWN_TEST,
      code: 'import { ensureCanonicalTables, loadCanonicalSchema } from "./canonical-schema.js";',
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
      code: 'import { ensureCanonicalTables } from "./test-helpers/canonical-schema.js";',
      errors: [{ messageId: "banned", data: { name: "ensureCanonicalTables" } }],
    },
    {
      filename: FILENAME,
      code: 'import { loadCanonicalSchema } from "./test-helpers/canonical-schema.js";',
      errors: [{ messageId: "banned", data: { name: "loadCanonicalSchema" } }],
    },
    // Deeper relative path (adapters/mysql2/*.test.ts reaching up two levels).
    {
      filename: "packages/activerecord/src/adapters/mysql2/mysql2-adapter.test.ts",
      code: 'import { ensureCanonicalTables } from "../../test-helpers/canonical-schema.js";',
      errors: [{ messageId: "banned", data: { name: "ensureCanonicalTables" } }],
    },
    // Both banned symbols in one import → one report each.
    {
      filename: FILENAME,
      code: 'import { ensureCanonicalTables, loadCanonicalSchema } from "./test-helpers/canonical-schema.js";',
      errors: [
        { messageId: "banned", data: { name: "ensureCanonicalTables" } },
        { messageId: "banned", data: { name: "loadCanonicalSchema" } },
      ],
    },
  ],
});
