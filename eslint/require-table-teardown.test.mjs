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
    // Multiple tables, each with its own (non-adjacent) drop.
    'await ctx.createTable("a", () => {});\nawait ctx.dropTable("a");\n' +
      'await ctx.createTable("b", () => {});\nawait ctx.dropTable("b");',
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
    // A quoted name with an embedded space is one name on both sides — the
    // identifier pattern must not stop at the space (`"my table"` → `my`),
    // which would leave the create unmatchable by any drop of the real table.
    'await adapter.exec(`CREATE TABLE "my table" (id int)`);\nawait adapter.exec(`DROP TABLE "my table"`);',
    "await adapter.exec('CREATE TABLE `my table` (id int)');\nawait adapter.exec('DROP TABLE `my table`');",
    // A quoted raw create balanced by the helper form — the cross-form
    // equivalence the separate quote capture exists for, in both directions.
    'await adapter.exec(`CREATE TABLE "my table" (id int)`);\nawait ctx.dropTable("my table");',
    'await ctx.createTable("my table", () => {});\nawait adapter.exec(`DROP TABLE "my table"`);',
    // A doubled quote escapes a quote inside the identifier: one name,
    // `my"table` — not the phantom `my` a truncating parse would record.
    'await adapter.exec(`CREATE TABLE "my""table" (id int)`);\nawait ctx.dropTable(\'my"table\');',
    // The doubled-quote branch must not overreach: a later `""` elsewhere in
    // the statement is not part of the name, which closes at its own quote.
    'await adapter.exec(`CREATE TABLE "t" (c TEXT DEFAULT "")`);\nawait adapter.exec(`DROP TABLE "t"`);',
    // An escaped quote as the *last* content character puts a real closing
    // quote right after a doubled pair — the boundary `quotedNameTruncated`
    // must not fire on, since `charAfter` is the space, not a quote.
    'await adapter.exec(`CREATE TABLE "my""" (id int)`);\nawait ctx.dropTable(\'my"\');',
    // An unclosed name containing a doubled quote must not be truncated into a
    // phantom `my` create by backtracking off the `""` — it is unknowable.
    'await adapter.exec(`CREATE TABLE "my""table${x} (id int)`);',
    // Quoting turns a would-be trailing clause into a table name, so the drop
    // list keeps reading past it.
    'await adapter.exec(`CREATE TABLE "cascade" (id int)`);\nawait adapter.exec(`CREATE TABLE b (id int)`);\n' +
      'await adapter.exec(`DROP TABLE "cascade", b`);',
    // A spaced quoted name in a multi-table drop list.
    'await adapter.exec(`CREATE TABLE "my table" (id int)`);\nawait adapter.exec(`CREATE TABLE b (id int)`);\n' +
      'await adapter.exec(`DROP TABLE "my table", b`);',
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
    // ── preferTableList: NOT mergeable ──────────────────────────────────────
    // A single dropTable is already the list form.
    'await ctx.dropTable("a", "b");',
    // Adjacent drops on different receivers don't merge.
    'await ctx.dropTable("a");\nawait other.dropTable("b");',
    // Adjacent drops with differing options objects don't merge.
    'await ctx.dropTable("a", { ifExists: true });\nawait ctx.dropTable("b");',
    'await ctx.dropTable("a", { ifExists: true });\nawait ctx.dropTable("b", { force: true });',
    // Non-adjacent drops (unrelated statement between) don't merge.
    'await ctx.dropTable("a");\ndoSomething();\nawait ctx.dropTable("b");',
    // A dynamic-name drop can't be merged with its neighbour.
    'await ctx.dropTable(name);\nawait ctx.dropTable("b");',
    // A catalogue prefix sweep is teardown for every create under its prefix.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      'await adapter.exec("CREATE TABLE ex_json (id int)");\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ex_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);\n' +
      "}",
    // `_` is a LIKE wildcard, so `ex_%` selects `exAfoo` as surely as `ex_foo`.
    'await adapter.exec(`CREATE TABLE "exAfoo" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // An ESCAPE clause makes `!_` a literal underscore, which `ex_foo` matches.
    'await adapter.exec(`CREATE TABLE "ex_foo" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex!_%' ESCAPE '!'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // ILIKE is case-insensitive, so `ex_%` selects `EX_FOO` too.
    'await adapter.exec(`CREATE TABLE "EX_FOO" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ILIKE 'ex_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // The ESCAPE clause is honoured on ILIKE as well: `!_` is a literal `_`.
    'await adapter.exec(`CREATE TABLE "EX_FOO" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ILIKE 'ex!_%' ESCAPE '!'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // SIMILAR TO keeps `%` and `_` as LIKE wildcards, so `ex_%` sweeps `exAfoo`.
    'await adapter.exec(`CREATE TABLE "exAfoo" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename SIMILAR TO 'ex_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // An escaped SIMILAR TO metacharacter is the literal it says it is.
    'await adapter.exec(`CREATE TABLE "ex*foo" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename SIMILAR TO 'ex!*%' ESCAPE '!'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // An alternation is translated: both branches are prefixes the sweep drops.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      'await adapter.exec(`CREATE TABLE "tmp_int" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename SIMILAR TO '(ex|tmp)_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // `ex*` is `e` followed by any run of `x`, so `ex*foo` is a name it selects.
    'await adapter.exec(`CREATE TABLE "ex*foo" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename SIMILAR TO 'ex*%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // The ESCAPE clause still applies inside a translated pattern: `!(` is a
    // literal paren, so only the second `(` opens a group.
    'await adapter.exec(`CREATE TABLE "ex(tmp" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename SIMILAR TO 'ex!((ex|tmp)%' ESCAPE '!'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // A bracket expression and a bounded repeat are spelled alike in JS.
    'await adapter.exec(`CREATE TABLE "ex12_int" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename SIMILAR TO 'ex[0-9]{2}_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // An anchored `~` pattern is a prefix filter.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // `~*` is the case-insensitive spelling, so `^ex_` selects `EX_FOO` too.
    'await adapter.exec(`CREATE TABLE "EX_FOO" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ~* '^ex_'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // A trailing `.*` constrains nothing, so `^ex_.*` is the same prefix.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_.*'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // POSIX alternation past the anchor is translated, not refused.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^(ex|tmp)_'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // A bracket expression and a `+` quantifier past the anchor are translated.
    'await adapter.exec(`CREATE TABLE "ex_12" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_[0-9]+'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // PostgreSQL's regex engine is ARE, so the class shorthands mean exactly
    // what they mean in JS and are translated rather than refused.
    'await adapter.exec(`CREATE TABLE "ex_12" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\d+'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    'await adapter.exec(`CREATE TABLE "ex_foo" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\w+'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    'await adapter.exec(`CREATE TABLE "ex_foo" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\S'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // A static schema qualifier still leaves the interpolation in the name slot.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS public."${t.tablename}" CASCADE`);\n' +
      "}",
    // A schema-qualified sweep drop still ends in the swept row name, so it arms.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${schema}"."${t.tablename}" CASCADE`);\n' +
      "}",
    // The helper spelling of the drop half: dropTable() on a swept row name is
    // a sweep on the same footing as the raw one, so it satisfies the creates
    // under the filter's prefix.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      'await adapter.exec("CREATE TABLE ex_json (id int)");\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      "  await adapter.dropTable(t.tablename);\n" +
      "}",
    // The filter hoisted to a const is the same sweep as the inline spelling.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      "const SWEEP_SQL = `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`;\n" +
      "const rows = await adapter.execute(SWEEP_SQL);\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // ...and so is one assigned to a `let` after its declaration: which write
    // reaches the sink is not decidable here, so every one it can hold counts.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      "let sql;\n" +
      "sql = `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`;\n" +
      "const rows = await adapter.execute(sql);\n" +
      "for (const t of rows) {\n" +
      '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
      "}",
    // The DROP half hoisted to a variable is the same sweep as the inline
    // spelling: the resolved template is read one quasi at a time, so the
    // interpolated name still reads as dynamic.
    'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
      "const rows = await adapter.execute(\n" +
      "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
      ");\n" +
      "for (const t of rows) {\n" +
      '  const dropSql = `DROP TABLE IF EXISTS "${t.tablename}"`;\n' +
      "  await adapter.exec(dropSql);\n" +
      "}",
    // A raw create and drop hoisted into variables balance each other exactly
    // as the inline spelling does.
    'const createSql = `CREATE TABLE "widgets" (id int)`;\n' +
      "await adapter.exec(createSql);\n" +
      'const dropSql = "DROP TABLE widgets";\n' +
      "await adapter.exec(dropSql);",
  ],
  invalid: [
    // Dropping the truncated prefix of a spaced quoted name is not a teardown
    // of the real table — the create is still reported by its full name.
    {
      code:
        'await adapter.exec(`CREATE TABLE "my table" (id int)`);\n' +
        'await adapter.exec(`DROP TABLE "my"`);',
      errors: [{ messageId: "missingTeardown", data: { table: "my table" } }],
    },
    // A truncated drop is not credited as the teardown of the phantom name it
    // would otherwise spell — `my` is still reported.
    {
      code:
        'await adapter.exec("CREATE TABLE my (id int)");\n' +
        'await adapter.exec(`DROP TABLE "my""table${x}`);',
      errors: [{ messageId: "missingTeardown", data: { table: "my" } }],
    },
    // Dropping the prefix before an escaped (doubled) quote is not a teardown
    // of the real table either.
    {
      code:
        'await adapter.exec(`CREATE TABLE "my""table" (id int)`);\n' +
        'await adapter.exec(`DROP TABLE "my"`);',
      errors: [{ messageId: "missingTeardown", data: { table: 'my"table' } }],
    },
    // Symmetrically, a DROP name flush against an interpolation is a prefix,
    // not a table: the phantom `tmp_` must not be credited as the teardown of
    // the real `tmp_a`.
    {
      code:
        'await c.exec("CREATE TABLE tmp_a (id int)");\n' +
        "await c.exec(`DROP TABLE tmp_${suffix}`);",
      errors: [{ messageId: "missingTeardown", data: { table: "tmp_a" } }],
    },
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
    // ── preferTableList: mergeable runs (autofixed) ─────────────────────────
    // Adjacent no-options run merges into one list call.
    {
      code: 'await conn.dropTable("a");\nawait conn.dropTable("b");',
      errors: [{ messageId: "preferTableList" }],
      output: 'await conn.dropTable("a", "b");',
    },
    // Adjacent shared `{ ifExists: true }` run merges, options kept once.
    {
      code:
        'await conn.dropTable("uber_barcodes", { ifExists: true });\n' +
        'await conn.dropTable("barcodes_reverse", { ifExists: true });\n' +
        'await conn.dropTable("travels", { ifExists: true });',
      errors: [{ messageId: "preferTableList" }],
      output:
        'await conn.dropTable("uber_barcodes", "barcodes_reverse", "travels", { ifExists: true });',
    },
    // The `(Base.connection as any).dropTable(...)` receiver form merges, cast kept.
    {
      code:
        'await (Base.connection as any).dropTable("a");\n' +
        'await (Base.connection as any).dropTable("b");',
      errors: [{ messageId: "preferTableList" }],
      output: 'await (Base.connection as any).dropTable("a", "b");',
    },
    // A run interrupted by an unrelated statement flags only the contiguous
    // sub-runs (here: the two-call run after the interruption).
    {
      code:
        'await conn.dropTable("a");\ndoSomething();\n' +
        'await conn.dropTable("b");\nawait conn.dropTable("c");',
      errors: [{ messageId: "preferTableList" }],
      output: 'await conn.dropTable("a");\ndoSomething();\n' + 'await conn.dropTable("b", "c");',
    },
    // Two contiguous sub-runs separated by an interruption are each flagged.
    {
      code:
        'await conn.dropTable("a");\nawait conn.dropTable("b");\ndoSomething();\n' +
        'await conn.dropTable("c");\nawait conn.dropTable("d");',
      errors: [{ messageId: "preferTableList" }, { messageId: "preferTableList" }],
      output:
        'await conn.dropTable("a", "b");\ndoSomething();\n' + 'await conn.dropTable("c", "d");',
    },
    // Non-awaited adjacent drops merge too (await wrapping consistent).
    {
      code: 'ctx.dropTable("a");\nctx.dropTable("b");',
      errors: [{ messageId: "preferTableList" }],
      output: 'ctx.dropTable("a", "b");',
    },
    // A sweep covers only its own prefix: a create outside it still reports.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        'await adapter.exec("CREATE TABLE scratch_pad (id int)");\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "scratch_pad" } }],
    },
    // A dynamic filter is not statically readable, so it satisfies nothing.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE '${prefix}%'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // A filter with no dynamically-named drop is not a sweep: nothing tears the
    // selected tables down, so the create still reports.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
        ");",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // A LIKE filter that reads no catalogue selects no tables to drop.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(`SELECT name FROM widgets WHERE name LIKE 'ex_%'`);\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.name}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // A schema-qualified drop whose dynamic part is only the qualifier names its
    // table statically, so it is not a sweep drop and arms no prefix.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_leak" (id int)`);\n' +
        "await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
        ");\n" +
        'await adapter.exec(`DROP TABLE IF EXISTS "${schema}"."fixed"`);',
      errors: [{ messageId: "missingTeardown", data: { table: "ex_leak" } }],
    },
    // A fixed-name dropTable() arms no sweep, however many catalogue filters the
    // file carries — otherwise the rule stops catching the bespoke tables that
    // outlive their test. The named table is torn down; the other is reported.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        'await adapter.exec(`CREATE TABLE "ex_leak" (id int)`);\n' +
        "await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
        ");\n" +
        'await adapter.dropTable("ex_int");',
      errors: [{ messageId: "missingTeardown", data: { table: "ex_leak" } }],
    },
    // A fixed name held in a variable is not sweep-bound either: the dropTable()
    // argument has to trace back to a row set, not merely be non-literal.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
        ");\n" +
        'const name = "ex_int";\n' +
        "await adapter.dropTable(name);",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // A for-of over a hand-written array is not a sweep: it drops exactly the
    // names it lists, so crediting it with the filter's whole prefix would
    // suppress the leak of every other table under that prefix.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        'await adapter.exec(`CREATE TABLE "ex_leak" (id int)`);\n' +
        "await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
        ");\n" +
        'for (const t of ["ex_int"]) {\n' +
        "  await adapter.dropTable(t);\n" +
        "}",
      errors: [
        { messageId: "missingTeardown", data: { table: "ex_int" } },
        { messageId: "missingTeardown", data: { table: "ex_leak" } },
      ],
    },
    // An escaped `%` is a literal, not a prefix wildcard: `ex\%` names one table.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex\\\\%'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // Under `ESCAPE '!'` the `!_` is a literal underscore, so the filter does not
    // select `ex!A` — reading it with the backslash default would credit a leak.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex!A" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex!_%' ESCAPE '!'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex!A" } }],
    },
    // A multi-character escape literal is not a readable single character
    // either: the closing quote must follow the first character, so the whole
    // filter is unreadable. `ex_foo` is the discriminating name — a parse that
    // truncated `\'!!\'` to `!` would compile `^ex_` and credit it.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_foo" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex!_%' ESCAPE '!!'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_foo" } }],
    },
    // An ESCAPE clause that is not a readable single character makes the whole
    // filter unreadable, so it credits nothing.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%' ESCAPE '${e}'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // NOT LIKE is an exclusion filter: it spares `ex_%` rather than sweeping it.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename NOT LIKE 'ex_%'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // LIKE stays case-sensitive: only ILIKE's matcher carries the `i` flag.
    {
      code:
        'await adapter.exec(`CREATE TABLE "EX_FOO" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex!_%' ESCAPE '!'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "EX_FOO" } }],
    },
    // NOT ILIKE is an exclusion filter too, and yields no prefix either.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename NOT ILIKE 'ex_%'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // A hoisted filter whose pattern is interpolated is not a knowable prefix:
    // reading the template's quasis as one joined string would make `LIKE
    // 'ex${suffix}%'` look like the static prefix `ex `, crediting a create the
    // query need not select.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex leak" (id int)`);\n' +
        "const sql = `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex${suffix}%'`;\n" +
        "const rows = await adapter.execute(sql);\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex leak" } }],
    },
    // A filter string that never reaches an execution sink sweeps nothing — an
    // expected-SQL assertion must not credit the file's creates.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const SWEEP_SQL = `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`;\n" +
        "expect(builder.toSql()).toBe(SWEEP_SQL);\n" +
        "const rows = await adapter.execute(`SELECT tablename FROM pg_tables`);\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // NOT SIMILAR TO is an exclusion filter and yields no prefix either.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename NOT SIMILAR TO 'ex_%'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // SIMILAR TO matches the whole name, so the `%` belongs to the last branch
    // alone: `ex|tmp%` selects exactly `ex`, never the prefix `ex`.
    {
      code:
        'await adapter.exec(`CREATE TABLE "exfoo" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename SIMILAR TO 'ex|tmp%'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "exfoo" } }],
    },
    // A quantifier with nothing to quantify is malformed, not translatable.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename SIMILAR TO '*ex_%'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // An unanchored `~` pattern matches mid-name, so it is not a prefix filter.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ 'ex_'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // An unterminated bracket expression is malformed, so it credits nothing.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_[0-9'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // A POSIX class element has no JS spelling, so it is refused, not guessed.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_[[:alpha:]]'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // A backslash inside a bracket expression is an escape to PostgreSQL's ARE
    // engine and a literal to bare POSIX, so the filter is refused: reading
    // `[\d]` as a literal backslash-or-`d` would credit `exd`, which
    // `~ '^ex[\d]'` does not select.
    {
      code:
        'await adapter.exec(`CREATE TABLE "exd" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex[\\\\d]'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "exd" } }],
    },
    // A back reference means something else once the `^(?:…)` wrapper adds a
    // group, so it stays refused although JS spells it identically.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_ex_1" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^(ex)_\\\\1'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_ex_1" } }],
    },
    // `\A` is an ARE-only constraint with no JS equivalent.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^\\\\Aex_'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // `\Z` likewise.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\Z'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // `\y`, `\Y`, `\m` and `\M` are ARE word-boundary constraints JS cannot
    // spell — `\Y` is the negated one, "not beginning or end of a word".
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^\\\\yex_'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\Y'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^\\\\mex_'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\M'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // `\b` is a word boundary in JS but PostgreSQL also spells backspace with
    // it, so it stays refused rather than translated on a resemblance.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^\\\\bex_'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // A translated shorthand credits only the names its filter selects:
    // `^ex_\d+` does not select `ex_foo`.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_foo" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\d+'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_foo" } }],
    },
    // `\D`, `\W` and `\s` are wider in JS than ARE's locale-dependent POSIX
    // classes, so translating them could credit a name the filter does not
    // select; they are refused rather than accepted on the resemblance.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_foo" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\D'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_foo" } }],
    },
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_-1" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\W'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_-1" } }],
    },
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_ 1" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_\\\\s'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_ 1" } }],
    },
    // An `$` past the leading anchor constrains a position this reading models
    // as open-ended, so the filter is refused rather than read as a prefix.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_$'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // `!~` is the negated operator: an exclusion filter yields no prefix.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename !~ '^ex_'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // `!~*` is negated too, case-insensitivity notwithstanding.
    {
      code:
        'await adapter.exec(`CREATE TABLE "EX_FOO" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename !~* '^ex_'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "EX_FOO" } }],
    },
    // A bare anchor selects every name and is no prefix, so it credits nothing.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // `~~` is the LIKE operator, not the regex one, and is not read as a regex.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~~ '^ex_'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // `~` stays case-sensitive: only `~*` carries the `i` flag.
    {
      code:
        'await adapter.exec(`CREATE TABLE "EX_FOO" (id int)`);\n' +
        "const rows = await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename ~ '^ex_'`,\n" +
        ");\n" +
        "for (const t of rows) {\n" +
        '  await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}"`);\n' +
        "}",
      errors: [{ messageId: "missingTeardown", data: { table: "EX_FOO" } }],
    },
    // A raw create hoisted to a variable and then executed leaks exactly like
    // the inline spelling, so it is reported when nothing drops it.
    {
      code: 'const createSql = `CREATE TABLE "widgets" (id int)`;\nawait adapter.exec(createSql);',
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
    },
    // A hoisted drop whose name is flush against a substitution names no
    // knowable table and is not the drop half of a sweep either, so the file's
    // prefixed create is still reported.
    {
      code:
        'await adapter.exec(`CREATE TABLE "ex_int" (id int)`);\n' +
        "await adapter.execute(\n" +
        "  `SELECT tablename FROM pg_tables WHERE tablename LIKE 'ex_%'`,\n" +
        ");\n" +
        "const dropSql = `DROP TABLE tmp_${suffix}`;\n" +
        "await adapter.exec(dropSql);",
      errors: [{ messageId: "missingTeardown", data: { table: "ex_int" } }],
    },
    // A hoisted DDL string that never reaches a sink arms nothing: the drop it
    // spells is never executed, so the create it would balance still reports.
    {
      code:
        'await adapter.exec(`CREATE TABLE "widgets" (id int)`);\n' +
        'const dropSql = "DROP TABLE widgets";\n' +
        "expect(dropSql).toBe(rendered);",
      errors: [{ messageId: "missingTeardown", data: { table: "widgets" } }],
    },
  ],
});
