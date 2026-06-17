import { RuleTester } from "eslint";
import rule from "./require-table-teardown.mjs";

// Point the rule at a non-existent exclude baseline so the committed list
// never grandfathers these synthetic fixtures.
process.env.REQUIRE_TABLE_TEARDOWN_EXCLUDE_PATH = "/nonexistent-exclude.json";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("require-table-teardown", rule, {
  valid: [
    // Create + drop in the same test body.
    'await adapter.createTable("widgets", () => {});\nawait adapter.dropTable("widgets");',
    // Create in beforeAll, drop in afterAll — different hooks, same name.
    'beforeAll(async () => { await ctx.createTable("widgets", () => {}); });\n' +
      'afterAll(async () => { await ctx.dropTable("widgets"); });',
    // Receiver-agnostic: create on ctx, drop on this.
    'await ctx.createTable("widgets", () => {});\nawait this.dropTable("widgets");',
    // Computed-name create is skipped (can't match statically) — no report.
    "await ctx.createTable(tableName, () => {});",
    // Multiple tables, each with its own drop.
    'await ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
      'await ctx.dropTable("a");\nawait ctx.dropTable("b");',
    // dropTable with options (ifExists) still matches by name.
    'await ctx.createTable("widgets", () => {});\nawait ctx.dropTable("widgets", { ifExists: true });',
    // No createTable at all.
    'await ctx.dropTable("widgets");',
    // dropTable removing several tables in one call satisfies each.
    'await ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
      'await ctx.dropTable("a", "b");',
    // No-substitution template literal names match (template↔template and template↔string).
    "await ctx.createTable(`widgets`, () => {});\nawait ctx.dropTable(`widgets`);",
    'await ctx.createTable(`widgets`, () => {});\nawait ctx.dropTable("widgets");',
    // force:true does not exempt, but a real drop satisfies it.
    'await ctx.createTable("widgets", { force: true }, () => {});\nawait ctx.dropTable("widgets");',
    // Interpolated create name is skipped entirely (not statically knowable).
    "await ctx.createTable(`${schema}.widgets`, () => {});",
    // Bare (non-method) create + drop — receiver-agnostic for bare calls too.
    'await createTable("widgets", () => {});\nawait dropTable("widgets");',
    // Loop teardown over a file-local const array of literal names.
    'const TABLES = ["a", "b"];\nawait ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
      "for (const t of TABLES) await ctx.dropTable(t, { ifExists: true });",
    // Loop teardown over an inline array literal.
    'await ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
      'for (const t of ["a", "b"]) await ctx.dropTable(t);',
    // forEach teardown over a const array.
    'const TABLES = ["a", "b"];\nawait ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
      "TABLES.forEach((t) => ctx.dropTable(t));",
    // map teardown over an inline array literal.
    'await ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
      'await Promise.all(["a", "b"].map((t) => ctx.dropTable(t)));',
    // Const array declared after the loop still resolves (deferred at exit).
    'await ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
      "for (const t of TABLES) await ctx.dropTable(t);\n" +
      'const TABLES = ["a", "b"];',
  ],
  invalid: [
    // Created, never dropped.
    {
      code: 'beforeAll(async () => { await ctx.createTable("widgets", () => {}); });',
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
    },
    // One of two tables is dropped; the other is flagged.
    {
      code:
        'await ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
        'await ctx.dropTable("a");',
      errors: [{ messageId: "missingTeardown", data: { table: "b" } }],
    },
    // Drop name does not match create name.
    {
      code: 'await ctx.createTable("widgets", () => {});\nawait ctx.dropTable("gadgets");',
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
    },
    // Drop uses a dynamic name (loop variable) — does not satisfy a literal create.
    {
      code:
        'await conn.createTable("select", { force: true }, () => {});\n' +
        "for (const t of TABLES) await conn.dropTable(t);",
      errors: [{ messageId: "missingTeardown", data: { table: "select" } }],
    },
    // force:true alone is not teardown — the table still leaks after the test.
    {
      code: 'await ctx.createTable("widgets", { force: true }, () => {});',
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
    },
    // Multi-arg dropTable that omits one created table flags the omitted one.
    {
      code:
        'await ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
        'await ctx.dropTable("a", "c");',
      errors: [{ messageId: "missingTeardown", data: { table: "b" } }],
    },
    // Interpolated drop name cannot satisfy a static create name.
    {
      code: 'await ctx.createTable("widgets", () => {});\nawait ctx.dropTable(`${schema}.widgets`);',
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
    },
    // Bare (non-method) create with no drop is flagged like a method create.
    {
      code: 'await createTable("widgets", () => {});',
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
    },
    // Loop teardown over a const array that omits a created table flags it.
    {
      code:
        'const TABLES = ["a"];\nawait ctx.createTable("a", () => {});\nawait ctx.createTable("b", () => {});\n' +
        "for (const t of TABLES) await ctx.dropTable(t);",
      errors: [{ messageId: "missingTeardown", data: { table: "b" } }],
    },
    // Loop over an unresolvable iterable (imported/runtime const) drops nothing.
    {
      code:
        'import { TABLES } from "./tables.js";\nawait ctx.createTable("a", () => {});\n' +
        "for (const t of TABLES) await ctx.dropTable(t);",
      errors: [{ messageId: "missingTeardown", data: { table: "a" } }],
    },
    // dropAllTables is itself forbidden — bare form.
    {
      code: "afterAll(() => dropAllTables(adapter));",
      errors: [{ messageId: "noDropAllTables" }],
    },
    // dropAllTables is itself forbidden — method form.
    {
      code: "afterAll(() => Base.adapter.dropAllTables());",
      errors: [{ messageId: "noDropAllTables" }],
    },
    // dropAllTables no longer satisfies a create: both the carpet bomb AND the
    // unmatched create are reported.
    {
      code:
        'await ctx.createTable("widgets", () => {});\n' +
        "afterAll(async () => { await dropAllTables(adapter); });",
      errors: [
        { messageId: "missingTeardown", data: { table: "widgets" } },
        { messageId: "noDropAllTables" },
      ],
    },
  ],
});
