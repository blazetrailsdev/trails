import { RuleTester } from "eslint";
import rule from "./require-canonical-rebuild.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const options = [{ canonicalTables: ["subscribers", "people", "posts", "widgets"] }];

tester.run("require-canonical-rebuild", rule, {
  valid: [
    {
      code:
        'await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");\n' +
        'await rebuildCanonicalTables(adapter, ["subscribers"]);',
      options,
    },

    {
      code: 'await ctx.dropTable("posts");\nawait rebuildCanonicalTables(ctx, ["posts"]);',
      options,
    },

    {
      code:
        'it("…", async () => { await ctx.dropTable("posts"); });\n' +
        'beforeEach(async () => { await rebuildCanonicalTables(ctx, ["posts"]); });',
      options,
    },

    {
      code:
        'await ctx.dropTable("posts", "people");\n' +
        'await rebuildCanonicalTables(ctx, ["people", "posts"]);',
      options,
    },

    {
      code: 'await ctx.dropTable("posts");\nawait loadCanonicalSchema(ctx);',
      options,
    },

    {
      code: "await ctx.dropTable(`people`);\nawait rebuildCanonicalTables(ctx, CANONICAL_TABLES);",
      options,
    },

    {
      code:
        'for (const t of ["people", "subscribers"]) {\n' +
        "  await adapter.executeMutation(`DROP TABLE IF EXISTS \\`${t}\\``);\n" +
        "}\n" +
        'await rebuildCanonicalTables(adapter, ["people", "subscribers"]);',
      options,
    },

    {
      code: "await adapter.execute(`DROP TABLE posts${suffix}`);",
      options,
    },

    {
      code: 'await ctx.dropTable("ex_long");\nawait ctx.dropTable("foos");',
      options,
    },

    {
      code:
        "const tables = await adapter.execute(`SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`);\n" +
        'for (const t of tables) { await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`); }',
      options,
    },

    {
      code:
        "const tables = await adapter.execute(`SELECT tablename FROM pg_tables WHERE tablename IN ('subscribers')`);\n" +
        'for (const t of tables) { await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`); }\n' +
        'await rebuildCanonicalTables(adapter, ["subscribers"]);',
      options,
    },

    {
      code: 'expect(sql).toContain("DROP TABLE subscribers");',
      options,
    },

    { code: 'await ctx.dropTable("posts");', options: [{}] },
  ],

  invalid: [
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

    {
      code: 'await ctx.dropTable("posts");',
      options,
      errors: [{ messageId: "missingRebuild", data: { table: "posts" } }],
    },

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

    {
      code:
        'await adapter.execute("DROP TABLE subscribers");\n' +
        'await rebuildCanonicalTables(adapter, ["people"]);',
      options,
      errors: [{ messageId: "missingRebuild", data: { table: "subscribers" } }],
    },

    {
      code: 'await adapter.execute("DROP TABLE posts, people CASCADE");',
      options,
      errors: [
        { messageId: "missingRebuild", data: { table: "posts" } },
        { messageId: "missingRebuild", data: { table: "people" } },
      ],
    },

    {
      code:
        "const tables = await adapter.execute(`SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%' OR tablename IN ('subscribers')`);\n" +
        'for (const t of tables) { await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`); }',
      options,
      errors: [{ messageId: "sweepReachesCanonical", data: { table: "subscribers" } }],
    },

    {
      code: 'await ctx.dropTable("posts");\nawait ctx.dropTable("posts");',
      options,
      errors: [{ messageId: "missingRebuild", data: { table: "posts" }, line: 1 }],
    },
  ],
});
