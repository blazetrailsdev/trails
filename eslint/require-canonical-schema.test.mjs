import { RuleTester } from "eslint";
import rule from "./require-canonical-schema.mjs";

// Point the rule at a non-existent exclude baseline so the committed list
// never grandfathers these synthetic fixtures.
process.env.REQUIRE_CANONICAL_SCHEMA_EXCLUDE_PATH = "/nonexistent-exclude.json";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const IMPORT = 'import { TEST_SCHEMA } from "../test-helpers/test-schema.js";\n';
const ALIAS_IMPORT = 'import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";\n';

tester.run("require-canonical-schema", rule, {
  valid: [
    // Whole canonical schema passed by name.
    IMPORT + "await defineSchema(TEST_SCHEMA);",
    // Adapter overload: schema is arg 1.
    IMPORT + "await defineSchema(adapter, TEST_SCHEMA);",
    // Per-table canonical references.
    IMPORT + "await defineSchema({ posts: TEST_SCHEMA.posts, authors: TEST_SCHEMA.authors });",
    // Computed member access into the canonical schema.
    IMPORT + 'await defineSchema({ posts: TEST_SCHEMA["posts"] });',
    // Spread of the whole canonical schema, plus canonical extras.
    IMPORT + "await defineSchema({ ...TEST_SCHEMA, extra: TEST_SCHEMA.extra });",
    // Aliased canonical import.
    ALIAS_IMPORT + "await defineSchema({ posts: canonicalSchema.posts });",
    // Trailing opts object is stripped, schema is still canonical.
    IMPORT + "await defineSchema(TEST_SCHEMA, { dropExisting: true });",
    IMPORT + "await defineSchema(adapter, TEST_SCHEMA, { dropExisting: true });",
    // Module-scope const resolving to all-canonical tables.
    IMPORT + "const SCHEMA = { posts: TEST_SCHEMA.posts };\nawait defineSchema(SCHEMA);",
    // Unresolvable identifier (e.g. an imported *_SCHEMA const) is left alone.
    'import { HM_SCHEMA } from "./fixtures.js";\nawait defineSchema(HM_SCHEMA);',
    // Empty schema has no tables to flag.
    "await defineSchema({});",
    // Not defineSchema.
    "await somethingElse({ posts: { title: 'string' } });",
  ],
  invalid: [
    // Inline table in a direct call.
    {
      code: IMPORT + 'await defineSchema({ posts: { title: "string" } });',
      errors: [{ messageId: "inlineTable", data: { table: "posts" } }],
    },
    // Adapter overload: inline table in arg 1.
    {
      code: IMPORT + 'await defineSchema(adapter, { posts: { title: "string" } });',
      errors: [{ messageId: "inlineTable" }],
    },
    // Mixed schema (where.test.ts shape): only the inline table is flagged.
    {
      code:
        IMPORT +
        "const SCHEMA = { categories: TEST_SCHEMA.categories, comments: { post_id: \"integer\" } };\n" +
        "await defineSchema(SCHEMA);",
      errors: [{ messageId: "inlineTable", data: { table: "comments" } }],
    },
    // A local `const TEST_SCHEMA` is NOT canonical — its inline tables are flagged.
    {
      code: 'const TEST_SCHEMA = { posts: { title: "string" } };\nawait defineSchema(TEST_SCHEMA);',
      errors: [{ messageId: "inlineTable", data: { table: "posts" } }],
    },
    // Spread of a non-canonical object.
    {
      code: IMPORT + "const base = {};\nawait defineSchema({ ...base, posts: TEST_SCHEMA.posts });",
      errors: [{ messageId: "inlineSpread" }],
    },
    // Quoted table key.
    {
      code: IMPORT + 'await defineSchema({ "1_need_quoting": { name: "string" } });',
      errors: [{ messageId: "inlineTable", data: { table: "1_need_quoting" } }],
    },
    // Multiple inline tables → one report each; canonical ones skipped.
    {
      code:
        IMPORT +
        'await defineSchema({ posts: TEST_SCHEMA.posts, a: { x: "string" }, b: { y: "integer" } });',
      errors: [
        { messageId: "inlineTable", data: { table: "a" } },
        { messageId: "inlineTable", data: { table: "b" } },
      ],
    },
  ],
});
