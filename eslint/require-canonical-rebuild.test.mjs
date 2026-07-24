import { RuleTester } from "eslint";
import rule from "./require-canonical-rebuild.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

// A stand-in for the TEST_SCHEMA keys eslint.config.mjs feeds the rule.
const options = [{ canonicalTables: ["subscribers", "people", "posts", "widgets"] }];

tester.run("require-canonical-rebuild", rule, {
  valid: [
    // Raw drop of a canonical table, restored by name.
    {
      code:
        'await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");\n' +
        'await rebuildCanonicalTables(adapter, ["subscribers"]);',
      options,
    },
    // dropTable helper on a canonical table, restored by name.
    {
      code: 'await ctx.dropTable("posts");\nawait rebuildCanonicalTables(ctx, ["posts"]);',
      options,
    },
    // The rebuild may sit in a later hook — matching is file-wide, not ordered.
    {
      code:
        'it("…", async () => { await ctx.dropTable("posts"); });\n' +
        'beforeEach(async () => { await rebuildCanonicalTables(ctx, ["posts"]); });',
      options,
    },
    // One rebuild call restores several dropped tables.
    {
      code:
        'await ctx.dropTable("posts", "people");\n' +
        'await rebuildCanonicalTables(ctx, ["people", "posts"]);',
      options,
    },
    // loadCanonicalSchema restores everything, so no per-name rebuild is needed.
    {
      code: 'await ctx.dropTable("posts");\nawait loadCanonicalSchema(ctx);',
      options,
    },
    // A non-literal name list is an unknowable set — treated as a full restore
    // rather than guessed at (the reserved-word/abstract-mysql-adapter shape).
    {
      code: "await ctx.dropTable(`people`);\nawait rebuildCanonicalTables(ctx, CANONICAL_TABLES);",
      options,
    },
    // The mysql2-adapter.test.ts pattern: interpolated drop names are not
    // statically knowable, so nothing is recorded (and it rebuilds anyway).
    {
      code:
        'for (const t of ["people", "subscribers"]) {\n' +
        "  await adapter.executeMutation(`DROP TABLE IF EXISTS \\`${t}\\``);\n" +
        "}\n" +
        'await rebuildCanonicalTables(adapter, ["people", "subscribers"]);',
      options,
    },
    // A bespoke (non-canonical) table may be dropped freely — that balance is
    // require-table-teardown's job, not this rule's.
    {
      code: 'await ctx.dropTable("ex_long");\nawait ctx.dropTable("foos");',
      options,
    },
    // A DDL string that is an assertion target, not a sink argument, is ignored.
    {
      code: 'expect(sql).toContain("DROP TABLE subscribers");',
      options,
    },
    // No canonical table list configured — the rule is inert.
    { code: 'await ctx.dropTable("posts");', options: [{}] },
  ],

  invalid: [
    // The pre-#5256 mysql2-adapter.trails.test.ts shape: a canonical table
    // hand-rolled and dropped again in a `finally`, leaving it missing.
    {
      code:
        'await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");\n' +
        'await adapter.executeMutation("CREATE TABLE `subscribers` (`nick` VARCHAR(255))");\n' +
        "try {\n" +
        '  await adapter.execQuery("SELECT * FROM subscribers WHERE 1=0");\n' +
        "} finally {\n" +
        '  await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");\n' +
        "}",
      options,
      errors: [{ messageId: "missingRebuild", data: { table: "subscribers" } }],
    },
    // The dropTable helper leaves the same drift as raw SQL.
    {
      code: 'await ctx.dropTable("posts");',
      options,
      errors: [{ messageId: "missingRebuild", data: { table: "posts" } }],
    },
    // Each unrestored canonical table is reported once; the restored one isn't.
    {
      code:
        'await ctx.dropTable("posts", "people", "widgets");\n' +
        'await rebuildCanonicalTables(ctx, ["people"]);',
      options,
      errors: [
        { messageId: "missingRebuild", data: { table: "posts" } },
        { messageId: "missingRebuild", data: { table: "widgets" } },
      ],
    },
    // A rebuild of a *different* table does not cover this one.
    {
      code:
        'await adapter.execute("DROP TABLE subscribers");\n' +
        'await rebuildCanonicalTables(adapter, ["people"]);',
      options,
      errors: [{ messageId: "missingRebuild", data: { table: "subscribers" } }],
    },
    // A multi-name raw drop reports each canonical name it lists.
    {
      code: 'await adapter.execute("DROP TABLE posts, people CASCADE");',
      options,
      errors: [
        { messageId: "missingRebuild", data: { table: "posts" } },
        { messageId: "missingRebuild", data: { table: "people" } },
      ],
    },
    // Repeated drops of the same table report once, at the first drop.
    {
      code: 'await ctx.dropTable("posts");\nawait ctx.dropTable("posts");',
      options,
      errors: [{ messageId: "missingRebuild", data: { table: "posts" }, line: 1 }],
    },
  ],
});
