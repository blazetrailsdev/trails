import { RuleTester } from "eslint";
import rule from "./require-table-teardown.mjs";

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
    // Raw SQL create balanced by a raw SQL drop (quoted name ↔ quoted name).
    'await adapter.exec(`CREATE TABLE "widgets" (id int)`);\nawait adapter.exec(`DROP TABLE "widgets"`);',
    // Raw SQL create balanced by the dropTable helper (cross-mechanism).
    'await adapter.exec("CREATE TABLE widgets (id int)");\nawait ctx.dropTable("widgets");',
    // Helper create balanced by a raw SQL drop (other direction).
    'await ctx.createTable("widgets", () => {});\nawait adapter.exec("DROP TABLE widgets");',
    // IF NOT EXISTS / IF EXISTS and trailing clauses don't defeat matching.
    'await c.exec("CREATE TABLE IF NOT EXISTS tmp_x (id int)");\nawait c.exec("DROP TABLE IF EXISTS tmp_x CASCADE");',
    // Interpolated raw-SQL table name is unknowable — neither create nor drop.
    "await adapter.exec(`CREATE TABLE ${name} (id int)`);",
    // Static prefix flush against an interpolation is a dynamic-name prefix,
    // not a real table — not flagged (no phantom `tmp_`).
    "await adapter.exec(`CREATE TABLE tmp_${suffix} (id int)`);",
    // CREATE TEMP TABLE (SQLite shorthand) is matched and balanced.
    'await adapter.exec("CREATE TEMP TABLE scratch (id int)");\nawait adapter.exec("DROP TABLE scratch");',
    // A single raw DROP TABLE balances several created tables.
    'await adapter.exec("CREATE TABLE a (id int)");\nawait adapter.exec("CREATE TABLE b (id int)");\n' +
      'await adapter.exec("DROP TABLE a, b");',
    // A CREATE TABLE string NOT handed to a sink (asserted on, as a schema
    // dumper / SchemaCreation test does) is not a leak and is not flagged.
    'expect(sql).toContain("CREATE TABLE widgets");',
    'expect(creation.accept(table)).toBe(`CREATE TABLE "widgets" (id int)`);',
    // rawSql:false grandfathers a file's raw-create backlog (helper check stays).
    {
      code: 'await adapter.exec("CREATE TABLE widgets (id int)");',
      options: [{ rawSql: false }],
    },
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
    // Raw SQL create with no matching drop is flagged like a helper create.
    {
      code: 'await adapter.exec(`CREATE TABLE "widgets" (id int)`);',
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
    },
    // Raw create dropped under a different name is still flagged.
    {
      code: 'await adapter.exec("CREATE TABLE widgets (id int)");\nawait adapter.exec("DROP TABLE gadgets");',
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
    },
    // Multi-table DROP balances only the names it lists — the omitted one flags.
    {
      code:
        'await adapter.exec("CREATE TABLE a (id int)");\nawait adapter.exec("CREATE TABLE b (id int)");\n' +
        'await adapter.exec("CREATE TABLE c (id int)");\nawait adapter.exec("DROP TABLE a, b");',
      errors: [{ messageId: "missingTeardown", data: { table: "c" } }],
    },
    // CREATE TEMP TABLE with no drop is flagged like a plain CREATE TABLE.
    {
      code: 'await adapter.exec("CREATE TEMP TABLE scratch (id int)");',
      errors: [{ messageId: "missingTeardown", data: { table: "scratch" } }],
    },
    // With rawSql:false the raw create is ignored, but a helper create still flags.
    {
      code:
        'await adapter.exec("CREATE TABLE leaked (id int)");\n' +
        'await ctx.createTable("widgets", () => {});',
      options: [{ rawSql: false }],
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
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
