/**
 * ESLint rule: require-table-teardown
 *
 * Every `createTable("foo", …)` in an activerecord test must be balanced by an
 * explicit `dropTable("foo")` somewhere in the same file. Tests that create a
 * table but never drop it leak that table into the shared per-worker database,
 * where a sibling file's differently-shaped `foo` collides under parallel forks
 * — the exact class of flake catalogued in the project's shared-DB memory notes.
 *
 * `dropAllTables()` is NOT accepted as that teardown — it is itself flagged
 * (`noDropAllTables`). The carpet bomb wipes every table, including ones other
 * code seeded, and obscures which tables a given file actually owns. A file
 * should drop exactly the tables it created, by name.
 *
 *   ✗  beforeAll(async () => { await ctx.createTable("widgets", t => …); });
 *      // …no dropTable("widgets") anywhere in the file
 *
 *   ✓  beforeAll(async () => { await ctx.createTable("widgets", t => …); });
 *      afterAll(async () => { await ctx.dropTable("widgets"); });
 *
 *   ✓  it("…", async () => {
 *        await adapter.createTable("widgets", t => …);
 *        await adapter.dropTable("widgets");
 *      });
 *
 * Matching is **per table name**, and **receiver-agnostic**: the create and the
 * drop may sit on different receivers (`ctx.createTable` paired with
 * `this.dropTable`) and in different hooks (`beforeEach`/`beforeAll`/in-test
 * create paired with `afterEach`/`afterAll`/in-test drop). The rule only checks
 * that for each created table name a matching drop exists in the file — not that
 * the lifecycle is symmetric, since legitimate patterns mix hooks freely.
 *
 * Only **statically-known** table names participate: a plain string literal
 * (`"foo"`) or a template literal with no substitutions (`` `foo` ``). A name
 * built with an interpolation (`` `${schema}.foo` ``) or held in a variable
 * can't be matched statically and is skipped — neither flagged as a create nor
 * counted as cleanup for a literal-named create. `dropTable` accepts several
 * names at once (`dropTable("a", "b")`); every static name it lists counts as
 * dropped. The call is matched by name whether it's bare (`createTable(...)`,
 * e.g. an imported test helper) or invoked on a receiver (`ctx.createTable(...)`,
 * `adapter.`, `this.`, `conn.`, a SchemaMigration, …) — only a dynamic/computed
 * callee (`recv[fn](...)`) is invisible.
 *
 * `createTable("foo", { force: true })` is NOT exempt: `force` drops-then-recreates
 * on the *next* run, but the table still sits in the shared DB after this test
 * finishes, where a concurrent sibling fork can collide with it. The leak the
 * rule guards against is the table outliving the test, which `force` doesn't fix.
 *
 * The `test-helpers/**` infra tests are exempt (configured in eslint.config.mjs)
 * — they exercise createTable/dropTable/dropAllTables as the subject under test.
 *
 * ── Raw-SQL leaks ──────────────────────────────────────────────────────────
 * The schema-statement `createTable`/`dropTable` helpers are not the only way a
 * test seeds a bespoke table: many tests hand a raw `CREATE TABLE …` string to
 * an execution sink (`exec`/`execute`/`executeMutation`/…), bypassing the helper
 * entirely. Those tables leak onto the shared per-worker DB exactly like
 * helper-created ones, and they are the bulk of the ~2,600 distinct tables the
 * `dropAllTables` fan-out re-drops every run (RFC 0028 Path D). When the
 * `rawSql` option is on (the default), the rule scans the **string/template
 * arguments of execution-sink calls** (see `SQL_SINKS`) for `CREATE TABLE` /
 * `DROP TABLE` statements and folds their table names into the same per-name
 * create/drop balance — a raw create may be torn down by a raw drop or by the
 * `dropTable` helper, and vice versa.
 *
 * Scoping to sink *arguments* (rather than every string in the file) is what
 * keeps SQL-*generation* tests — schema-creation / schema-dumper suites that
 * merely `expect(sql).toContain("CREATE TABLE …")` on a rendered string, never
 * executing it — from being mislabelled as leaks. They render DDL as their
 * subject under test, like `test-helpers/**` does for the helpers; the DDL
 * string is an assertion target, not an argument to a sink, so it's ignored.
 *
 * Only statically-knowable names count: a `CREATE TABLE ${name}` whose name
 * sits in an interpolation is invisible, like a computed helper name, and SQL
 * built in a variable and executed later (`exec(sql)`) is not seen. Files with
 * a backlog of un-torn-down raw creates are grandfathered via the
 * `rawSql: false` option in eslint.config.mjs, fed by
 * `eslint/require-table-teardown-raw-sql-exclude.json`, and ratcheted to zero.
 */

/**
 * The called function's name, whether it's a bare call (`createTable(...)`) or
 * a method call (`recv.createTable(...)`). Receiver-agnostic by design — the
 * rule cares about the operation, not what it's invoked on. Returns null for
 * dynamic/computed callees (`recv[fn](...)`).
 */
function calledName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type !== "MemberExpression") return null;
  if (callee.computed || callee.property.type !== "Identifier") return null;
  return callee.property.name;
}

/**
 * The static string value of a node, or null when it isn't statically known.
 * Plain string literals (`"foo"`) and template literals with no substitutions
 * (`` `foo` ``) both qualify; a template with an interpolation (`` `${s}.foo` ``)
 * does not — its table name can't be matched statically, so it's skipped.
 */
function staticString(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/** The created table name (createTable's first arg), or null if not static. */
function createdTableName(call) {
  return staticString(call.arguments[0]);
}

/**
 * Every statically-known table name a dropTable() call removes. dropTable
 * accepts multiple table names (`dropTable("a", "b")`); the trailing options
 * object is an ObjectExpression and yields no string, so it's skipped naturally.
 */
function droppedTableNames(call) {
  return call.arguments.map(staticString).filter((n) => n !== null);
}

/**
 * `CREATE TABLE [IF NOT EXISTS] <name>` and `DROP TABLE [IF EXISTS] <name>`
 * extracted from a raw SQL fragment. The optional opening quote (`` ` ``, `"`,
 * `'`) is matched and stripped via a backreference so a quoted name balances an
 * unquoted helper name (`CREATE TABLE "items"` ↔ `dropTable("items")`). A name
 * that begins with an interpolation has no leading identifier here and simply
 * doesn't match — statically unknowable, so skipped like a computed helper name.
 */
const CREATE_TABLE_RE =
  /\bcreate\s+(?:temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?(`|"|')?([\w.]+)\1?/gi;
const DROP_TABLE_RE = /\bdrop\s+table\s+(?:if\s+exists\s+)?(`|"|')?([\w.]+)\1?/gi;

/**
 * Call names that execute a raw SQL string against the database. A `CREATE
 * TABLE` handed to one of these leaks a real table; the same string passed to
 * `expect(...).toContain` does not. Receiver-agnostic, like every other name
 * the rule matches. Extend this set if a new execution sink appears.
 */
const SQL_SINKS = new Set([
  "exec",
  "execute",
  "executeMutation",
  "internalExecute",
  "execQuery",
  "query",
]);

function rawSqlTableNames(text, re) {
  const names = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) names.push(m[2]);
  return names;
}

/** The static SQL texts an argument carries (per quasi for templates). */
function staticSqlTexts(node) {
  if (node.type === "Literal") {
    return typeof node.value === "string" ? [node.value] : [];
  }
  if (node.type === "TemplateLiteral") {
    // Each quasi is static text between interpolations; an interpolated table
    // name lands at a quasi boundary and simply doesn't match the regex.
    return node.quasis.map((q) => q.value.cooked).filter((t) => t);
  }
  return [];
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        'Require each createTable("name") in an activerecord test to be torn down by an explicit dropTable("name") in the same file, and forbid the carpet-bomb dropAllTables().',
    },
    schema: [
      {
        type: "object",
        properties: {
          // Also balance raw `CREATE TABLE`/`DROP TABLE` SQL strings (default).
          // Set false to grandfather a file with a raw-create backlog.
          rawSql: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingTeardown:
        'Table `{{table}}` is created with createTable() but never torn down. Add a matching `dropTable("{{table}}")` (in afterEach/afterAll or the test body). Leaked tables collide with sibling files under parallel forks. If this is intentional, add `// eslint-disable-next-line blazetrails/require-table-teardown`.',
      noDropAllTables:
        'Avoid `dropAllTables()` — drop the specific tables this file created with `dropTable("…")` instead. The carpet-bomb teardown also wipes tables other code seeded, and hides which tables a test actually owns. If this is genuinely necessary, add `// eslint-disable-next-line blazetrails/require-table-teardown`.',
    },
  },

  create(context) {
    // Raw-SQL scanning is on by default; `rawSql: false` grandfathers a file
    // with an un-torn-down raw-create backlog (it still gets the helper check).
    const checkRawSql = context.options[0]?.rawSql !== false;

    // table name → first create node seen (for the report location).
    const created = new Map();
    const dropped = new Set();

    // Scan an execution sink's string/template arguments for raw CREATE/DROP
    // TABLE statements, folding their names into the same create/drop balance.
    function recordSinkSql(call) {
      for (const arg of call.arguments) {
        for (const text of staticSqlTexts(arg)) {
          for (const table of rawSqlTableNames(text, CREATE_TABLE_RE)) {
            if (!created.has(table)) created.set(table, arg);
          }
          for (const table of rawSqlTableNames(text, DROP_TABLE_RE)) {
            dropped.add(table);
          }
        }
      }
    }

    return {
      CallExpression(node) {
        // All operations are matched identically whether invoked bare
        // (`createTable(...)`) or on a receiver (`ctx.createTable(...)`).
        const name = calledName(node.callee);
        if (name === "dropAllTables") {
          // The carpet bomb is itself a violation — require explicit drops.
          context.report({ node, messageId: "noDropAllTables" });
        } else if (name === "createTable") {
          const table = createdTableName(node);
          if (table !== null && !created.has(table)) created.set(table, node);
        } else if (name === "dropTable") {
          for (const table of droppedTableNames(node)) dropped.add(table);
        } else if (checkRawSql && name !== null && SQL_SINKS.has(name)) {
          recordSinkSql(node);
        }
      },

      // Deferred so creates and drops in any order across the file are matched.
      "Program:exit"() {
        for (const [name, node] of created) {
          if (dropped.has(name)) continue;
          context.report({
            node,
            messageId: "missingTeardown",
            data: { table: name },
          });
        }
      },
    };
  },
};

export default rule;
