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
 * Only statically-knowable names count: a name that sits in (or runs up to) an
 * interpolation — `CREATE TABLE ${name}`, or the `tmp_` prefix of `CREATE TABLE
 * tmp_${suffix}` — is invisible, like a computed helper name, and SQL built in a
 * variable and executed later (`exec(sql)`) is not seen. Files with
 * a backlog of un-torn-down raw creates are grandfathered via the
 * `rawSql: false` option in eslint.config.mjs, fed by
 * `eslint/require-table-teardown-raw-sql-exclude.json`, and ratcheted to zero.
 *
 * ── Prefix sweeps ──────────────────────────────────────────────────────────
 * A file may tear its tables down by sweeping the catalogue instead of naming
 * them: `SELECT tablename FROM pg_tables WHERE … tablename LIKE 'ex_%'` feeding
 * a per-row `exec(`DROP TABLE "${row.tablename}"`)`. That sweep drops strictly
 * more than any hand-written list, so it counts as teardown for every raw
 * `CREATE TABLE ex_…` in the same file — the list such files used to carry only
 * to satisfy this rule rots silently, holding names nothing creates and missing
 * ones the sweep alone dropped.
 *
 * Both halves must be present: a `LIKE` filter on a catalogue relation whose
 * pattern is a closed single-quoted literal ending in `%`, and a raw `DROP
 * TABLE` whose name position is an interpolation. A dynamic or absent filter
 * satisfies nothing — otherwise the rule would stop catching the bespoke tables
 * that outlive their test, which is why it exists. Matching is by prefix only,
 * so a create outside the swept prefix is still reported.
 *
 * This is deliberately independent of `require-canonical-rebuild`: the two
 * rules answer different questions. A sweep that can select a canonical table
 * still reports `sweepReachesCanonical` there, whatever this rule accepts here.
 *
 * ── Prefer the dropTable list form ─────────────────────────────────────────
 * `dropTable` accepts several table names plus an optional trailing options
 * object in one call (`dropTable("a", "b", { ifExists: true })`), which the
 * adapter splits via `_splitTableNamesAndOptions`. A run of separate adjacent
 * `dropTable` calls — `await conn.dropTable("a"); await conn.dropTable("b");` —
 * is just N lines of teardown boilerplate; the list form is one call. (Note:
 * the base `SchemaStatements.dropTable` and `MigrationContext.dropTable` still
 * loop one `DROP TABLE` per name, so this is shorter code, *not* fewer SQL
 * statements — only the MySQL adapter folds the list into a single statement.)
 * The rule flags (and autofixes) a run
 * of **2+ adjacent** `dropTable` calls in the same statement list when they
 * share a receiver, share their `await` wrapping, and carry a *compatible*
 * options object — either none of them pass options, or they all pass a
 * structurally identical one (`preferTableList`). The autofix merges the run
 * into a single list call, keeping the receiver, `await`, and shared options.
 *
 *   ✗  await conn.dropTable("a", { ifExists: true });
 *      await conn.dropTable("b", { ifExists: true });
 *   ✓  await conn.dropTable("a", "b", { ifExists: true });
 *
 * Only contiguous, compatible calls merge: a non-`dropTable` statement, a
 * different receiver, a differing options object, a differing `await`, or a
 * dynamic/computed table name breaks the run (any contiguous sub-runs on either
 * side are still flagged independently).
 */

/**
 * The called function's name, whether it's a bare call (`createTable(...)`) or
 * a method call (`recv.createTable(...)`). Receiver-agnostic by design — the
 * rule cares about the operation, not what it's invoked on. Returns null for
 * dynamic/computed callees (`recv[fn](...)`).
 */
export function calledName(callee) {
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
export function staticString(node) {
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
 * A table name: either quoted (`` ` ``, `"`, `'`) or a bare identifier. The
 * quotes are captured separately from the name so a quoted name balances an
 * unquoted helper name (`CREATE TABLE "items"` ↔ `dropTable("items")`).
 *
 * A quoted name runs to its closing quote rather than to the first
 * non-identifier character, so an embedded space stays part of the name
 * (`CREATE TABLE "my table"` is the table `my table`, not `my`). Truncating it
 * used to make a create unmatchable by any drop of the real name — and the
 * phantom short name matchable by a drop that tears down nothing.
 *
 * SQLite and PostgreSQL escape a quote inside an identifier by doubling it, so
 * `\1\1` is consumed as content rather than read as the closing quote:
 * `"my""table"` is one name, `my"table` (undoubled by `capturedName`), not the
 * phantom `my`. `(?!\1)` keeps the `+` bounded — it can never cross an
 * undoubled quote, so a name cannot run past its close or across statements.
 *
 * A name whose opening quote is never closed is skipped rather than truncated,
 * so the create goes unreported. Usually it matches neither branch. The
 * exception is an unclosed name containing a doubled quote
 * (`CREATE TABLE "my""table${x}`): the `+` can backtrack off the `""` unit and
 * let its first quote serve as the close, matching the phantom `"my"`. See
 * `quotedNameTruncated`, which rejects that parse. Either way the input is
 * malformed SQL in a plain string literal, or — in a template — a name whose
 * closing quote lives past an interpolation, so it was already unknowable.
 */
const NAME_SRC = "(?:([\"'`])((?:(?!\\1)[\\s\\S]|\\1\\1)+)\\1|([\\w.]+))";
/**
 * `NAME_SRC` capture indices. Its `\1` backreference pins the fragment to the
 * first capture group, so it must be the only group in any regex built from it.
 */
const [OPEN_QUOTE, QUOTED_NAME, BARE_NAME] = [1, 2, 3];
/** The name `m` captured, with a quoted name's doubled quotes undoubled. */
function capturedName(m) {
  const quote = m[OPEN_QUOTE];
  if (quote === undefined) return m[BARE_NAME];
  return m[QUOTED_NAME].replaceAll(quote + quote, quote);
}

/**
 * Whether `m` closed a quoted name early by backtracking off a doubled quote,
 * leaving a phantom short name. `charAfter` is the character following the
 * match. A real closing quote is never immediately followed by its own quote —
 * that pair would have been consumed as escaped content — so this signature is
 * exactly the truncated parse, and the name is dropped rather than recorded.
 */
function quotedNameTruncated(m, charAfter) {
  return m[OPEN_QUOTE] !== undefined && charAfter === m[OPEN_QUOTE];
}

/**
 * The leading `CREATE [GLOBAL|LOCAL] [TEMP[ORARY]|UNLOGGED] TABLE [IF NOT
 * EXISTS]` clause, up to and including the table name.
 */
const CREATE_TABLE_RE = new RegExp(
  `\\bcreate\\s+(?:(?:global|local)\\s+)?(?:temp(?:orary)?\\s+|unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${NAME_SRC}`,
  "gi",
);
/** The `DROP TABLE [IF EXISTS]` keyword prefix; the name list follows. */
const DROP_TABLE_RE = /\bdrop\s+table\s+(?:if\s+exists\s+)?/gi;
/** A single (optionally quoted) table name at the start of `rest`. */
const NAME_RE = new RegExp(`^\\s*${NAME_SRC}`);

/**
 * Call names that execute a raw SQL string against the database. A `CREATE
 * TABLE` handed to one of these leaks a real table; the same string passed to
 * `expect(...).toContain` does not. Receiver-agnostic, like every other name
 * the rule matches. Extend this set if a new execution sink appears.
 */
export const SQL_SINKS = new Set([
  "exec",
  "execute",
  "executeMutation",
  "internalExecute",
  "execQuery",
  "query",
]);

/**
 * Statically-knowable `CREATE TABLE` names in `text`. When `endIsDynamic` (this
 * is a template quasi immediately followed by an interpolation), a name that
 * runs to the very end of the text is a static *prefix* of a dynamic name
 * (`CREATE TABLE tmp_${suffix}` → `"CREATE TABLE tmp_"`) — it can't be matched,
 * so it's dropped rather than recorded as a phantom table.
 */
function rawCreateNames(text, endIsDynamic) {
  const names = [];
  CREATE_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = CREATE_TABLE_RE.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (endIsDynamic && end === text.length) continue;
    if (quotedNameTruncated(m, text[end])) continue;
    names.push(capturedName(m));
  }
  return names;
}

/**
 * Statically-knowable `DROP TABLE` names in `text`. A single statement may drop
 * several tables (`DROP TABLE a, b`); each comma-separated name counts, stopping
 * at a trailing `CASCADE`/`RESTRICT`, statement terminator, or a non-static
 * (interpolated) name. `endIsDynamic` works exactly as it does for
 * `rawCreateNames`: a name that runs to the very end of a quasi followed by an
 * interpolation (`DROP TABLE posts_${suffix}`) is a static *prefix* of a
 * dynamic name, not a table, and is dropped rather than recorded.
 */
export function rawDropNames(text, endIsDynamic = false) {
  const names = [];
  DROP_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = DROP_TABLE_RE.exec(text)) !== null) {
    let rest = text.slice(m.index + m[0].length);
    let nm;
    while ((nm = NAME_RE.exec(rest)) !== null) {
      // A truncated name would credit a teardown that drops nothing, and the
      // rest of the list can't be trusted either — stop reading.
      if (quotedNameTruncated(nm, rest[nm[0].length])) break;
      const name = capturedName(nm);
      // Only a bare word can be the trailing clause; quoting it makes it a name.
      if (nm[OPEN_QUOTE] === undefined && /^(?:cascade|restrict)$/i.test(name)) break;
      rest = rest.slice(nm[0].length);
      if (!(endIsDynamic && rest.length === 0)) names.push(name);
      rest = rest.replace(/^\s+/, "");
      if (rest[0] !== ",") break;
      rest = rest.slice(1);
    }
  }
  return names;
}

/**
 * A catalogue relation a sweep can read its victims out of. Same set the
 * `require-canonical-rebuild` rule recognises.
 */
const CATALOGUE_SOURCE =
  /\b(?:pg_tables|pg_class|sqlite_master|sqlite_schema|pragma_table_list|information_schema\.tables)\b|\bshow\s+tables\b/i;

/**
 * The statically-readable prefixes of `LIKE '<prefix>%'` filters in a catalogue
 * query. A filter whose pattern isn't a closed single-quoted literal ending in
 * `%` — an interpolated or otherwise dynamic pattern — yields nothing, which is
 * the point: an unreadable filter must satisfy no create, or the rule stops
 * catching bespoke tables that outlive their test.
 */
const LIKE_PREFIX_RE = /\blike\s+'([^'%]+)%'/gi;
export function sweepPrefixes(text) {
  if (!CATALOGUE_SOURCE.test(text)) return [];
  const prefixes = [];
  LIKE_PREFIX_RE.lastIndex = 0;
  let m;
  while ((m = LIKE_PREFIX_RE.exec(text)) !== null) prefixes.push(m[1]);
  return prefixes;
}

/**
 * Whether `text` ends in a `DROP TABLE` whose table name is the interpolation
 * that follows it (`DROP TABLE IF EXISTS "${t.tablename}"`) — the drop half of
 * a sweep, which names no table itself. Only meaningful when `endIsDynamic`.
 */
export function hasDynamicDropName(text, endIsDynamic) {
  if (!endIsDynamic) return false;
  DROP_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = DROP_TABLE_RE.exec(text)) !== null) {
    // The name position must reach the interpolation with nothing but optional
    // whitespace and an opening quote in between.
    if (/^\s*["'`]?$/.test(text.slice(m.index + m[0].length))) return true;
  }
  return false;
}

/**
 * Inspect a statement for a mergeable `dropTable` call. Tolerates `await`
 * wrapping (`await x.dropTable(...)`). Returns the call's merge attributes, or
 * null when the statement is not a `dropTable` ExpressionStatement, or
 * `{ dynamic: true }` when it is a `dropTable` call that can't participate in a
 * merge (a dynamic/computed table-name argument) — both break a run, but a
 * dynamic drop is never itself the start of a new mergeable run.
 */
function analyzeDropCall(stmt, sourceCode) {
  if (stmt.type !== "ExpressionStatement") return null;
  let expr = stmt.expression;
  let awaited = false;
  if (expr.type === "AwaitExpression") {
    awaited = true;
    expr = expr.argument;
  }
  if (!expr || expr.type !== "CallExpression") return null;
  const callee = expr.callee;
  if (calledName(callee) !== "dropTable") return null;

  const receiverText =
    callee.type === "Identifier" ? "<<bare>>" : sourceCode.getText(callee.object);

  const args = expr.arguments;
  let optionsNode = null;
  let nameNodes = args;
  if (args.length > 0 && args[args.length - 1].type === "ObjectExpression") {
    optionsNode = args[args.length - 1];
    nameNodes = args.slice(0, -1);
  }
  // A run only merges static names; a dynamic/computed name can't be carried.
  if (nameNodes.length === 0 || nameNodes.some((n) => staticString(n) === null)) {
    return { dynamic: true };
  }
  const optionsSig = optionsNode ? sourceCode.getText(optionsNode).replace(/\s+/g, "") : "<<none>>";
  return { stmt, awaited, receiverText, calleeNode: callee, nameNodes, optionsNode, optionsSig };
}

const rule = {
  meta: {
    type: "problem",
    fixable: "code",
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
      preferTableList:
        'Merge adjacent dropTable() calls into a single dropTable("a", "b") list call — shorter teardown code, one call instead of N.',
    },
  },

  create(context) {
    // Raw-SQL scanning is on by default; `rawSql: false` grandfathers a file
    // with an un-torn-down raw-create backlog (it still gets the helper check).
    const checkRawSql = context.options[0]?.rawSql !== false;

    const sourceCode = context.sourceCode ?? context.getSourceCode();

    // table name → first create node seen (for the report location).
    const created = new Map();
    const dropped = new Set();
    // Prefix sweeps: a catalogue query filtered on `LIKE '<prefix>%'` feeding a
    // dynamically-named raw DROP TABLE tears down every table with that prefix,
    // strictly more than a hand-maintained name list can. Both halves must be
    // present — a filter with no sweep drop, or a sweep drop with no readable
    // filter, satisfies nothing.
    const sweptPrefixes = [];
    let sawSweepDrop = false;

    // Flag (and autofix) a run of 2+ adjacent, mergeable dropTable calls in a
    // single statement list: same receiver, same await wrapping, compatible
    // options. An incompatible-but-valid drop starts a fresh run; a non-drop or
    // dynamic-name drop breaks the run entirely.
    function checkStatements(statements) {
      let i = 0;
      while (i < statements.length) {
        const first = analyzeDropCall(statements[i], sourceCode);
        if (!first || first.dynamic) {
          i++;
          continue;
        }
        let j = i + 1;
        const run = [first];
        while (j < statements.length) {
          const next = analyzeDropCall(statements[j], sourceCode);
          if (!next || next.dynamic) break;
          if (
            next.receiverText !== first.receiverText ||
            next.optionsSig !== first.optionsSig ||
            next.awaited !== first.awaited
          ) {
            break;
          }
          run.push(next);
          j++;
        }
        if (run.length >= 2) reportRun(run, first);
        i = j;
      }
    }

    function reportRun(run, first) {
      context.report({
        node: run[0].stmt,
        messageId: "preferTableList",
        fix(fixer) {
          // Render from the full callee node so a parenthesized/cast receiver
          // (`(Base.connection as any).dropTable`) is preserved verbatim.
          const calleeText = sourceCode.getText(first.calleeNode);
          const names = run.flatMap((r) => r.nameNodes.map((n) => sourceCode.getText(n)));
          const optionsText = first.optionsNode ? `, ${sourceCode.getText(first.optionsNode)}` : "";
          const merged = `${first.awaited ? "await " : ""}${calleeText}(${names.join(
            ", ",
          )}${optionsText});`;
          const last = run[run.length - 1].stmt;
          return fixer.replaceTextRange([run[0].stmt.range[0], last.range[1]], merged);
        },
      });
    }

    // Scan an execution sink's string/template arguments for raw CREATE/DROP
    // TABLE statements, folding their names into the same create/drop balance.
    function recordText(text, node, endIsDynamic) {
      for (const table of rawCreateNames(text, endIsDynamic)) {
        if (!created.has(table)) created.set(table, node);
      }
      for (const table of rawDropNames(text, endIsDynamic)) dropped.add(table);
      sweptPrefixes.push(...sweepPrefixes(text));
      if (hasDynamicDropName(text, endIsDynamic)) sawSweepDrop = true;
    }

    function recordSinkSql(call) {
      for (const arg of call.arguments) {
        if (arg.type === "Literal") {
          if (typeof arg.value === "string") recordText(arg.value, arg, false);
        } else if (arg.type === "TemplateLiteral") {
          // Each quasi is static text between interpolations; a quasi that is
          // followed by an interpolation has a dynamic end (see rawCreateNames).
          const last = arg.quasis.length - 1;
          arg.quasis.forEach((q, i) => {
            if (q.value.cooked) recordText(q.value.cooked, arg, i < last);
          });
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

      BlockStatement(node) {
        checkStatements(node.body);
      },
      StaticBlock(node) {
        checkStatements(node.body);
      },
      SwitchCase(node) {
        checkStatements(node.consequent);
      },
      Program(node) {
        checkStatements(node.body);
      },

      // Deferred so creates and drops in any order across the file are matched.
      "Program:exit"() {
        const prefixes = sawSweepDrop ? sweptPrefixes : [];
        for (const [name, node] of created) {
          if (dropped.has(name)) continue;
          if (prefixes.some((p) => name.startsWith(p))) continue;
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
