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
 * arguments of execution-sink calls** (see `SQL_SINKS` in
 * `eslint/sql-call-shapes.mjs`) for `CREATE TABLE` /
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
 * tmp_${suffix}` — is invisible, like a computed helper name. SQL built in a
 * variable and executed later (`exec(sql)`), or built by `+` concatenation, IS
 * seen: both resolve through `eslint/sql-texts.mjs`. Files with
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
 * pattern is a closed single-quoted literal ending in `%`, and a drop that
 * names no table itself. The drop is recognised in either spelling, on the same
 * footing: a raw `DROP TABLE` whose name position is an interpolation *that is
 * the table name*, or a `dropTable()` helper call whose argument traces back to
 * a sink-derived row binding (`for (const t of rows) await
 * adapter.dropTable(t.tablename)`). The helper form is the one CLAUDE.md steers
 * tests toward, so recognising only the raw one left a file written the
 * recommended way reporting every create it does tear down. The binding
 * resolver is shared with `require-canonical-rebuild` — see
 * `eslint/sweep-binding.mjs` — so the two rules cannot disagree about what a
 * swept name is. `dropTable("ex_foo")` is a fixed name and arms nothing, for
 * the same reason a statically-named raw drop does not, and neither does a
 * fixed name held in a variable. Nor does a name bound by a for-of over a
 * hand-written array (`for (const t of ["ex_int"]) dropTable(t)`): the resolver
 * is asked here for its strict mode, in which a loop binding counts only when
 * the loop iterates sink-derived rows. `require-canonical-rebuild` accepts any
 * loop binding, and the difference is not an inconsistency but the two rules'
 * opposite polarity — arming ADDS reports there and SUPPRESSES them here, so
 * the loose reading is a tolerable over-report there and a leaked table here. A
 * static qualifier ahead of it does not disqualify the drop (`DROP TABLE
 * public."${row.tablename}"` is a sweep, the shape `require-canonical-rebuild`
 * recognises too), but in `DROP TABLE "${schema}"."fixed"` the dynamic part is only the qualifier and
 * the table is named statically, so that drop is not a sweep and does not arm
 * one — otherwise the file would stop reporting its own leaks; a qualified
 * `DROP TABLE "${schema}"."${row.tablename}"` does arm, since the chain ends
 * dynamically. A dynamic or absent filter satisfies nothing — otherwise the
 * rule would stop catching the bespoke tables that outlive their test, which is
 * why it exists. Matching is by the filter pattern only, so a create outside it
 * is still reported. The pattern is read as LIKE syntax rather than a literal
 * string — `_` is a single-character wildcard, so `LIKE 'ex_%'` credits `exAfoo`
 * as well as `ex_foo`, and a backslash escapes it (`\_`) or the trailing `%`
 * (`LIKE 'ex\%'`, one literal name, which sweeps nothing). `NOT LIKE` yields no
 * prefix — an exclusion filter selects the complement of its pattern, so
 * reading it as a prefix would satisfy exactly the creates the sweep spares.
 *
 * The two halves are paired file-wide, not per string: the filter and the drop
 * are normally written against different variables in different calls, and
 * matching them up would trade a tolerable over-report for real misses. So a
 * catalogue `LIKE` filter anywhere in the file, plus any dynamically-named raw
 * drop anywhere in it, arms every prefix the file mentions. KNOWN GAPS, all in
 * the under-accepting direction (a real sweep goes unrecognised and its creates
 * are reported, which is noise rather than a leak): SQL appended piecewise
 * (`sql += " WHERE …"`), since a
 * compound assignment's write is only its right-hand side and stitching the
 * pieces back together needs an order the scope graph does not give; a
 * catalogue relation `CATALOGUE_SOURCE` does not list;
 * an unanchored regex (`~` / `~*`) filter, which matches mid-name and is no
 * prefix at all; and, in either regex spelling, a construct whose JS meaning
 * differs from its POSIX one and so is refused rather than mistranslated — a
 * POSIX class or collating element (`[[:alpha:]]`), a back reference (`\1`), an
 * ARE-only escape (`\A`, `\Z`, `\y`, `\Y`, `\m`, `\M`, and `\b`, which PostgreSQL
 * also spells backspace with inside brackets), a shorthand JS reads more widely
 * than ARE does (`\D`, `\W`, `\s`), an `^` or
 * `$` past the leading
 * anchor, and a pattern that does not compile at all. A backslash inside a
 * bracket expression is read only in the `~` / `~*` spelling, where the engine
 * is known to be ARE and a bracketed `ARE_SHORTHANDS` member (`[\d]`) means what
 * the same shorthand means in a JS character class; a bracketed POSIX character
 * class translates through the subset spellings in `POSIX_CLASS_SOURCES`
 * (`[[:digit:]]`). Both refuse under a negating `^`, where the complement of a
 * subset would be wider (`[^\d]`, `[^[:digit:]]`); anything else bracketed
 * (`[\W]`, `[\b]`, `[\1]`, `[\\]`, a shorthand as a range endpoint) and every
 * backslash inside a `SIMILAR TO` bracket expression — whose interaction with
 * that grammar's `ESCAPE` character is unsettled — still refuses. Everything
 * else in the
 * two regex grammars — alternation, grouping, `* + ?`, `{n,m}` bounds, bracket
 * expressions, `.`, and the ARE class shorthands whose JS set is no wider
 * (`\d`, `\w`, `\S` — see `ARE_SHORTHANDS`) — is
 * translated (`posixRegexpSource`, `similarPrefixMatcher`). The
 * filter spellings read are `LIKE`, `ILIKE`, `SIMILAR TO` and `~` / `~*`; their
 * negations are deliberately read as nothing (see `LIKE_PREFIX_RE`).
 *
 * The identifier in that list is the shared resolver (`eslint/sql-texts.mjs`),
 * so a filter hoisted to a `const SWEEP_SQL` — or assigned to a `let` after its
 * declaration — arms the same prefixes as the inline spelling, and the two rules
 * cannot disagree about which writes a hoisted query can carry. A string that
 * never reaches a sink still arms nothing, so an expected-SQL assertion over
 * rendered DDL stays quiet. A resolved template is read one quasi at a time,
 * never joined: a joined `LIKE 'ex${suffix}%'` would read as the static prefix
 * `ex `, arming a prefix the query does not select and suppressing the leak of
 * a table like `ex leak`. Reading each quasi alone leaves `LIKE 'ex`
 * unterminated, so an interpolated pattern credits nothing — the same answer
 * the inline-template path gives, and the right one, since `_` and `%` are
 * wildcards whose meaning depends on text the lint pass cannot see. The whole
 * reading is applied to a resolved string, not just the filter: the resolver
 * hands back each string's quasi array (`createSqlTextGroups`), so every quasi
 * gets the successor texts `recordText` needs, and a hoisted `DROP TABLE
 * "${row.tablename}"` arms the sweep while a hoisted `DROP TABLE tmp_${suffix}`
 * — a name flush against a substitution — still names nothing. A `+`
 * concatenation resolves through the same path with its non-string operands
 * read as substitutions, so `'DROP TABLE "' + row.tablename + '"'` arms and
 * `"… LIKE 'ex" + suffix + "%'"` credits nothing, matching what the equivalent
 * template spellings answer. A CALL of a local helper resolves to every
 * expression that helper can return, so a sweep whose SELECT or DROP half is
 * hoisted into `const sweepSql = () => …` reads as if it were written inline;
 * several returns fan out, and so do several functions the callee binding can
 * hold (a helper assigned to a `let` is read alongside one declared or
 * initialized, on the same every-write contract a hoisted SQL string takes);
 * arguments are not bound to parameters — a parameter
 * resolves to no strings and so reads as a substitution, its value being the
 * caller's to vary, which is why a pattern interpolated through one credits
 * nothing and a name flush against one names no knowable table — and a callee
 * that is not a resolvable local function — an import, a global, a method call —
 * stays a dead end and arms nothing.
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

import { calledName, staticString, SQL_SINKS } from "./sql-call-shapes.mjs";
import { createSweepBinding } from "./sweep-binding.mjs";
import { createSqlTextGroups } from "./sql-texts.mjs";

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
 * Matchers for the statically-readable `LIKE '<pattern>%'` filters in a
 * catalogue query — one anchored RegExp per filter, each testing whether a
 * table name is one the sweep selects. A filter whose pattern isn't a closed
 * single-quoted literal ending in an unescaped `%` — an interpolated or
 * otherwise dynamic pattern — yields nothing, which is the point: an unreadable
 * filter must satisfy no create, or the rule stops catching bespoke tables that
 * outlive their test.
 *
 * The pattern is LIKE syntax, not a literal string. `_` matches any single
 * character (Rails escapes it alongside `%` in `sanitize_sql_like`,
 * activerecord/lib/active_record/sanitization.rb), so `LIKE 'ex_%'` selects
 * `exAfoo` as surely as `ex_foo`, and reading it as the literal prefix `ex_`
 * would leave those creates reported although the sweep does drop them.
 *
 * An escape character makes the next character literal, and which character
 * escapes is part of the filter: Arel carries it on the LIKE node and emits the
 * `ESCAPE` clause (arel/visitors/postgresql.rb), so `LIKE 'ex!_%' ESCAPE '!'`
 * selects literal-underscore names and must NOT be read with the backslash
 * default, which would compile `^ex!.` and credit `ex!A` — a leak. A statically
 * readable clause is honoured; one that is dynamic, empty, or not a single
 * character makes the whole filter unreadable, so it credits nothing. Absent a
 * clause the escape is backslash, PostgreSQL's default and the one
 * `sanitize_sql_like` emits.
 *
 * PostgreSQL's `ILIKE` is the case-insensitive spelling of the same filter —
 * Arel emits both from `visit_Arel_Nodes_Matches` (arel/visitors/postgresql.rb),
 * `ESCAPE` clause included — so it is read the same way, but its matcher carries
 * the `i` flag: `ILIKE 'ex_%'` really does select `EX_FOO`, and compiling it
 * case-sensitively would leave that create reported although the sweep drops it.
 *
 * `NOT LIKE` and `NOT ILIKE` are excluded, and it is not a nicety: an exclusion
 * filter selects the complement of its pattern, so reading `NOT LIKE 'ex_%'` as
 * a prefix would make a sweep satisfy exactly the creates it deliberately
 * spares. The empty
 * pattern is likewise impossible to match (`[^'%]+`), so a bare `LIKE '%'`
 * selecting everything never becomes a prefix that satisfies everything.
 */
const LIKE_PREFIX_RE = /(?<!\bnot\s+)\b(?<i>i?)like\s+'(?<pattern>[^'%]+)%'/gi;
/**
 * `SIMILAR TO` is the same catalogue filter in SQL-standard regex spelling: `%`
 * and `_` stay LIKE wildcards and the `ESCAPE` clause still applies — but it
 * ALSO gives regex meaning to `| * + ? ( ) [ ] { }`, which LIKE does not, so it
 * gets its own compiler (`similarPrefixMatcher`) rather than the LIKE one.
 * Escaping a metacharacter (`ex\*_%` under the default escape) makes it the
 * literal it says it is. `NOT SIMILAR TO` is an exclusion filter and yields no
 * prefix, exactly as `NOT LIKE` does.
 */
const SIMILAR_PREFIX_RE = /(?<!\bnot\s+)\bsimilar\s+to\s+'(?<pattern>[^'%]+)%'/gi;
/**
 * PostgreSQL's regex match operators, which Arel emits from
 * `visit_Arel_Nodes_Regexp` (arel/visitors/postgresql.rb). `~*` is the
 * case-insensitive spelling, so its matcher carries the `i` flag as `ILIKE`
 * does; the negated `!~` / `!~*` are excluded by the lookbehind, since an
 * exclusion filter would otherwise satisfy exactly the creates it spares.
 *
 * A regex filter is a prefix filter ONLY when the pattern is anchored: `~ 'ex_'`
 * matches mid-name (`fooex1bar`) and selects far more than the prefix, but
 * crediting it as a prefix would be under-crediting, not a leak — the risk runs
 * the other way, so the `^` is required and an unanchored pattern yields no
 * matcher. Past the anchor the pattern is translated by `posixRegexpSource`,
 * never handed to `new RegExp` as-is: POSIX ERE is not JS regex syntax, so every
 * construct is either translated explicitly or refuses the whole filter.
 */
const REGEXP_PREFIX_RE = /(?<![!~])(?<op>~\*?)\s*'(?<pattern>[^']*)'/g;
/** A trailing `ESCAPE '<char>'` clause, and the leading keyword on its own. */
const ESCAPE_CLAUSE_RE = /^\s*escape\s+'([^'])'/i;
const ESCAPE_KEYWORD_RE = /^\s*escape\b/i;
export function sweepPrefixMatchers(text) {
  if (!CATALOGUE_SOURCE.test(text)) return [];
  const matchers = [];
  for (const [re, compile] of [
    [LIKE_PREFIX_RE, likePrefixMatcher],
    [SIMILAR_PREFIX_RE, similarPrefixMatcher],
  ]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const tail = text.slice(m.index + m[0].length);
      const clause = ESCAPE_CLAUSE_RE.exec(tail);
      if (clause === null && ESCAPE_KEYWORD_RE.test(tail)) continue;
      const { i, pattern } = m.groups;
      const matcher = compile(pattern, clause === null ? "\\" : clause[1], Boolean(i));
      if (matcher !== null) matchers.push(matcher);
    }
  }
  REGEXP_PREFIX_RE.lastIndex = 0;
  let m;
  while ((m = REGEXP_PREFIX_RE.exec(text)) !== null) {
    const matcher = regexpPrefixMatcher(m.groups.pattern, m.groups.op === "~*");
    if (matcher !== null) matchers.push(matcher);
  }
  return matchers;
}

/** The characters that must be backslash-escaped to stay literal in a JS regex. */
const JS_METACHAR_RE = /[.*+?^${}()|[\]\\]/g;
/** A bounded repeat, `{n}` / `{n,}` / `{n,m}` — the one spelling JS reads alike. */
const BOUND_RE = /^\{\d+(?:,\d*)?\}/;

/**
 * A JS character class equivalent to the POSIX bracket expression starting at
 * `pattern[start]`, plus the index just past its `]`, or null when the
 * expression is unterminated or uses syntax whose JS meaning differs.
 *
 * The two halves overlap almost exactly — a leading `^` negates, `a-z` is a
 * range, a `]` in first position is a literal — but two do not. A POSIX
 * character class translates only through `POSIX_CLASS_SOURCES`, whose ASCII
 * spellings are subsets of what a non-C locale selects; a collating element or
 * equivalence class (`[[.x.]]`, `[[=a=]]`) has no JS spelling at all and
 * refuses. Because those spellings are subsets, a *negated* bracket expression
 * refuses them — and a bracketed `ARE_SHORTHANDS` member with them, that shorthand
 * being one of those classes: the complement of a subset is a superset, which
 * would credit a name the filter does not select. And a backslash
 * means different things in the two grammars. Bare POSIX brackets read it as an
 * ordinary literal, but PostgreSQL's engine is ARE, which reads it as an escape
 * inside brackets too (`[\d]` is the digits, not a backslash and a `d`), so
 * emitting it doubled would credit `exd` for `~ '^ex[\d]'` — a name the filter
 * does not select.
 *
 * `escapeChar` is the character that introduces an escape here, so the caller
 * that knows the engine decides which reading applies. The `~` / `~*` path
 * passes the backslash ARE spells its escapes with, where a bracketed
 * `ARE_SHORTHANDS` member means exactly what the same shorthand means in a JS
 * character class, so `[\d]` translates unless the expression is negated. Every
 * other escape inside brackets
 * refuses — the complements (`[\W]`), `\b` (backspace here, not a word
 * boundary), a back reference (`[\1]`), and a bare `[\\]`, whose ARE meaning is
 * a literal backslash but whose bare-POSIX one is two of them. A shorthand used
 * as a range endpoint (`[a-\d]`, `[\d-z]`) is refused too: ARE rejects it
 * outright, while JS's Annex B grammar quietly reads the `-` as a literal and
 * would credit a name containing one.
 *
 * The `SIMILAR TO` path passes its own `ESCAPE` character, which PostgreSQL
 * applies inside bracket expressions as well — settled against a live server
 * (17.7), since the grammar in the docs does not say either way:
 * `'ex_5' SIMILAR TO 'ex_[\d]%'` is TRUE under the default backslash escape and
 * `'ex_d'` is not, so the escape+letter pair reaches the underlying ARE as the
 * class shorthand; `'ex_5' SIMILAR TO 'ex_[#d]%' ESCAPE '#'` is TRUE the same
 * way. It follows that a backslash which is NOT the escape character is a plain
 * literal there: `'ex_5' SIMILAR TO 'ex_[\d]%' ESCAPE '#'` is FALSE while
 * `'ex_d'` and `'ex_\'` are both TRUE, so the class is the two literals
 * `{\, d}` — which JS spells exactly as `[\\d]`. Doubling it translates the
 * narrow reading; emitting it bare would give JS the wider `\d`, which is why
 * only the bare emission was ever unsafe.
 *
 * The same doubling settles a literal backslash used as a range endpoint,
 * because ranges compare code points in both grammars: `[\-a]` and JS `[\\-a]`
 * are the same U+005C–U+0061 span. A range that runs the other way (`[a-\]`)
 * needs no decision here: `compileMatcher` catches the descending-range
 * SyntaxError and credits nothing, which is the safe answer whichever way
 * PostgreSQL reads it.
 *
 * An escape character with structural meaning inside a bracket expression
 * (`[`, `]`, `^`, `-`) refuses the expression outright: `ESCAPE '^'` makes
 * `[^d]` the digits rather than a negated class, and the members are parsed
 * before the escape could be honoured.
 */
const BRACKET_STRUCTURAL = new Set(["[", "]", "^", "-"]);

function bracketSource(pattern, start, escapeChar) {
  if (BRACKET_STRUCTURAL.has(escapeChar)) return null;
  let source = "[";
  let i = start + 1;
  // A `POSIX_CLASS_SOURCES` spelling — and equally an `ARE_SHORTHANDS` member,
  // which IS one of those classes — is safe in a plain class and unsafe in a
  // negated one: it is an ASCII subset of what a non-C locale selects, and the
  // complement of a subset is a *superset*, which would credit a name the filter
  // does not select. So both refuse under `^`.
  let negated = false;
  if (pattern[i] === "^") {
    source += "^";
    negated = true;
    i++;
  }
  if (pattern[i] === "]") {
    source += "\\]";
    i++;
  }
  // Where the members start, so a `-` in first position is read as the literal
  // it is in both grammars rather than as the open end of a range.
  const bodyStart = source.length;
  for (; i < pattern.length && pattern[i] !== "]"; i++) {
    const ch = pattern[i];
    if (ch === "[" && ":.=".includes(pattern[i + 1] ?? "")) {
      // A collating element (`[.ch.]`) or equivalence class (`[=a=]`) has no JS
      // spelling at all, so only a character class can translate.
      if (pattern[i + 1] !== ":") return null;
      const end = pattern.indexOf(":]", i + 2);
      if (end === -1) return null;
      const classSource = POSIX_CLASS_SOURCES.get(pattern.slice(i + 2, end));
      // A negated class refuses (see `negated`); so does a name not on the list
      // (`[[:punct:]]`, a locale-extending complement, a typo) and a class used as
      // a range endpoint, which ARE rejects outright while JS's Annex B grammar
      // would quietly read the `-` as a literal.
      if (classSource === undefined || negated) return null;
      if (source.endsWith("-") && source.length - 1 > bodyStart) return null;
      if (pattern[end + 2] === "-" && (pattern[end + 3] ?? "]") !== "]") return null;
      source += classSource;
      i = end + 1;
      continue;
    }
    if (ch === "\\" && ch !== escapeChar) {
      source += "\\\\";
      continue;
    }
    if (ch === escapeChar) {
      const next = pattern[i + 1];
      // A negated shorthand refuses for the same reason a negated class does, the
      // shorthand being one of those classes (see `negated`).
      if (next === undefined || !ARE_SHORTHANDS.has(next) || negated) return null;
      if (source.endsWith("-") && source.length - 1 > bodyStart) return null;
      if (pattern[i + 2] === "-" && (pattern[i + 3] ?? "]") !== "]") return null;
      source += `\\${next}`;
      i++;
      continue;
    }
    source += ch === "[" ? "\\[" : ch === "^" ? "\\^" : ch;
  }
  if (i >= pattern.length) return null;
  return { source: `${source}]`, next: i + 1 };
}

/**
 * The class shorthands PostgreSQL's regex engine (ARE, not bare POSIX ERE)
 * reads and JS reads alike, so `~ '^ex_\d+'` can be translated rather than
 * refused.
 *
 * Only the three whose JS character set cannot be the *wider* of the two are
 * here, because a wider matcher credits a name the filter does not select.
 * ARE's classes are the POSIX ones (`\d` is `[[:digit:]]`, `\w` is
 * `[[:alnum:]_]`, `\s` is `[[:space:]]`), which a non-C database locale can
 * extend beyond ASCII; JS's `\d` and `\w` stay ASCII, so both are subsets and
 * under-accept at worst, and `\S` is the complement of the JS `\s` superset, so
 * it is a subset too. The complements `\D` and `\W` — and `\s` itself, which JS
 * extends to Unicode separators PostgreSQL's `[[:space:]]` need not include —
 * run the other way and stay refused.
 *
 * Refused alongside them: back references, `\b` (a word boundary in both, but
 * ALSO PostgreSQL's spelling of backspace inside a bracket expression), and the
 * ARE-only `\A` / `\Z` / `\y` / `\Y` / `\m` / `\M`, which JS cannot spell at all
 * (`\Y` is ARE's *not* a word boundary, documented alongside the others).
 */
const ARE_SHORTHANDS = new Set(["d", "w", "S"]);

/**
 * The JS character-class *body* fragment each licensed POSIX character class
 * (`[[:digit:]]`) translates to inside a bracket expression, so
 * `~ '^ex_[[:digit:]]'` can be translated rather than refused.
 *
 * This is the same argument `ARE_SHORTHANDS` records, read the other way round:
 * ARE's class shorthands ARE these POSIX classes (`\d` is `[[:digit:]]`, `\w` is
 * `[[:alnum:]_]`, `\s` is `[[:space:]]`), so the reasoning that licensed
 * `[\d]` -> `\d` licenses `[[:digit:]]` -> `\d` too. A non-C database locale can
 * extend every one of these past ASCII; the spellings here are all the ASCII
 * reading, so each is a *subset* of what the filter selects and under-accepts at
 * worst — never wider, which is the invariant that matters, since a wider
 * matcher credits a name the filter does not select. (`digit` and `word` reuse
 * the JS shorthands, which stay ASCII; the rest are spelled out because JS has
 * no shorthand for them.)
 *
 * Every other class name refuses: `punct`, `graph`, `print`, `cntrl` and `ascii`
 * are not spelled here because nothing needs them yet and each would need its
 * own subset proof, and refusing costs only noise. Locale-extending complements
 * never appear as a POSIX class name at all — the complement is spelled by
 * negating the bracket expression, which refuses wholesale (see `bracketSource`).
 */
const POSIX_CLASS_SOURCES = new Map([
  ["alnum", "0-9A-Za-z"],
  ["alpha", "A-Za-z"],
  ["blank", " \\t"],
  ["digit", "\\d"],
  ["lower", "a-z"],
  ["space", " \\t\\n\\v\\f\\r"],
  ["upper", "A-Z"],
  ["word", "\\w"],
  ["xdigit", "0-9A-Fa-f"],
]);

/**
 * The JS regex source equivalent to the POSIX ERE `pattern`, or null when it
 * uses a construct this compiler will not translate. Refusing is always safe
 * (the sweep goes unrecognised and its creates are reported as noise); guessing
 * is not, since a widened matcher credits a name the filter does not select.
 *
 * Alternation, grouping and the quantifiers `* + ?` are spelled identically in
 * both, as are `{n,m}` bounds and `.`; bracket expressions go through
 * `bracketSource` in its ARE reading, so a bracketed `ARE_SHORTHANDS` member
 * (`[\d]`) translates like the bare one, except under a negating `^`, which
 * refuses (see `bracketSource`). A backslash escape of a word character
 * is translated only
 * for the ARE class shorthands whose JS meaning is identical (`ARE_SHORTHANDS`);
 * every other one is refused, since a back reference (`\1`) means something
 * else once the `^(?:…)` wrapper adds a group, and the ARE-only escapes (`\A`,
 * `\Z`, `\y`, `\Y`, `\m`, `\M`) have no JS spelling at all. Also refused: a `{` that
 * does not open a bound, and an `^` or `$` past the leading anchor, which would
 * constrain a position this prefix reading does not model.
 */
function posixRegexpSource(pattern) {
  let source = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "[") {
      const bracket = bracketSource(pattern, i, "\\");
      if (bracket === null) return null;
      source += bracket.source;
      i = bracket.next;
    } else if (ch === "\\") {
      const next = pattern[i + 1];
      if (next === undefined) return null;
      if (/\w/.test(next) && !ARE_SHORTHANDS.has(next)) return null;
      source += `\\${next}`;
      i += 2;
    } else if (ch === "{") {
      const bound = BOUND_RE.exec(pattern.slice(i));
      if (bound === null) return null;
      source += bound[0];
      i += bound[0].length;
    } else if (ch === "^" || ch === "$") {
      return null;
    } else {
      source += "()|*+?.".includes(ch) ? ch : ch.replace(JS_METACHAR_RE, "\\$&");
      i++;
    }
  }
  return source;
}

/**
 * An anchored RegExp matching the names the regex filter `pattern` selects, or
 * null when it is unanchored or untranslatable. A bare `^` selects every name
 * and is no prefix, so it too yields nothing.
 *
 * The translated source is wrapped in a group before the anchor is reapplied:
 * `^(?:a|b)` is what `^a|b` means here, whereas the unwrapped `^a|b` would read
 * the anchor as binding to the first branch alone. That the POSIX match is a
 * *search* past the anchor needs no `.*` — a name our matcher accepts matched
 * the whole translated pattern at position 0, so the filter matches it too.
 */
function regexpPrefixMatcher(pattern, caseInsensitive) {
  if (!pattern.startsWith("^")) return null;
  const source = posixRegexpSource(pattern.slice(1));
  if (source === null || source === "") return null;
  return compileMatcher(`^(?:${source})`, caseInsensitive);
}

/**
 * An anchored RegExp matching the names `<pattern>%` selects under
 * `escapeChar`, or null when the pattern is untranslatable. `SIMILAR TO` reads
 * `_` and `%` as LIKE wildcards and everything in `| * + ? ( ) [ ] { }` as
 * regex, which is why it cannot share the LIKE compiler.
 *
 * The trailing `%` is translated with the rest (`.*`) and the whole thing
 * full-matched rather than treated as an implicit prefix, because `SIMILAR TO`
 * matches the entire name: in `'ex|tmp%'` the `%` belongs to the second branch
 * only, so a prefix reading of the alternation would credit `exFOO`, which the
 * filter does not select.
 *
 * `escapeChar` reaches `bracketSource` too, because PostgreSQL honours the
 * `ESCAPE` character inside a bracket expression and hands the pair to the
 * underlying ARE — so `[\d]` under the default backslash escape (the one
 * `sanitize_sql_like` emits) is the digits, exactly as on the `~` path, while a
 * backslash that is not the escape character is a literal member there and is
 * translated as the doubled `\\`.
 */
function similarPrefixMatcher(pattern, escapeChar, caseInsensitive) {
  let source = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === escapeChar) {
      const next = pattern[i + 1];
      if (next === undefined) return null;
      source += next.replace(JS_METACHAR_RE, "\\$&");
      i += 2;
    } else if (ch === "[") {
      const bracket = bracketSource(pattern, i, escapeChar);
      if (bracket === null) return null;
      source += bracket.source;
      i = bracket.next;
    } else if (ch === "{") {
      const bound = BOUND_RE.exec(pattern.slice(i));
      if (bound === null) return null;
      source += bound[0];
      i += bound[0].length;
    } else {
      source += ch === "_" ? "." : "()|*+?".includes(ch) ? ch : ch.replace(JS_METACHAR_RE, "\\$&");
      i++;
    }
  }
  return compileMatcher(`^(?:${source}.*)$`, caseInsensitive);
}

/**
 * `new RegExp(source)`, or null when the source does not compile — a pattern
 * whose grouping or quantifier placement is unbalanced (`'(ex_%'`, `'*ex_%'`)
 * is malformed rather than translatable, and must credit nothing rather than
 * throw out of the lint pass.
 */
function compileMatcher(source, caseInsensitive) {
  try {
    return new RegExp(source, caseInsensitive ? "i" : "");
  } catch {
    return null;
  }
}

/**
 * An anchored RegExp matching the names `<pattern>%` selects under
 * `escapeChar`, or null when the trailing `%` is itself escaped — `LIKE 'ex\%'`
 * matches the single literal name `ex%`, not a prefix, so it sweeps nothing
 * this rule should credit. `caseInsensitive` is set for `ILIKE` filters only —
 * `LIKE` is case-sensitive in PostgreSQL, so widening it would credit creates
 * the sweep leaves behind. `SIMILAR TO` gives regex meaning to characters LIKE
 * reads literally and goes through `similarPrefixMatcher` instead.
 */
function likePrefixMatcher(pattern, escapeChar, caseInsensitive) {
  let source = "";
  let escaped = false;
  for (const ch of pattern) {
    if (escaped) {
      source += ch.replace(JS_METACHAR_RE, "\\$&");
      escaped = false;
    } else if (ch === escapeChar) {
      escaped = true;
    } else if (ch === "_") {
      source += ".";
    } else {
      source += ch.replace(JS_METACHAR_RE, "\\$&");
    }
  }
  if (escaped) return null;
  return new RegExp(`^${source}`, caseInsensitive ? "i" : "");
}

/**
 * Whether `text` ends in a `DROP TABLE` whose table *name* is dynamic — the drop
 * half of a sweep, which names no table itself. `nextTexts` is the static text
 * of every template quasi following this one, in order, or null for a plain
 * string (which can never end in an interpolation).
 *
 * An interpolation in the name position is not automatically the name. In
 * `DROP TABLE "${schema}"."fixed"` the dynamic part is only the qualifier and
 * the table is named statically, so no swept row name is dropped; such a drop
 * must not arm a sweep, or a file combining it with a catalogue `LIKE` filter
 * would stop reporting its own leaked creates. The chain is therefore followed
 * to its end: a quasi that is nothing but a `.` separator (with optional quotes
 * and whitespace) means another interpolation continues the qualified name, so
 * `"${schema}"."${row.tablename}"` — a genuine sweep — still arms, while a
 * chain ending in static text does not.
 *
 * A *static* qualifier ahead of the interpolation is skipped rather than
 * disqualifying: in `DROP TABLE IF EXISTS public."${row.tablename}"` the
 * interpolation still occupies the table-name position, which is the shape
 * `require-canonical-rebuild` recognises as a sweep too.
 */
const STATIC_QUALIFIER = /^\s*(?:(?:"[^"]*"|'[^']*'|`[^`]*`|\w+)\s*\.\s*)*["'`]?$/;
export function hasDynamicDropName(text, nextTexts) {
  if (!nextTexts || nextTexts.length === 0) return false;
  DROP_TABLE_RE.lastIndex = 0;
  let m;
  while ((m = DROP_TABLE_RE.exec(text)) !== null) {
    if (STATIC_QUALIFIER.test(text.slice(m.index + m[0].length))) {
      return dynamicNameEndsChain(nextTexts);
    }
  }
  return false;
}

/** Whether the qualified name starting at the first interpolation ends dynamically. */
function dynamicNameEndsChain(nextTexts) {
  let i = 0;
  while (i < nextTexts.length && /^["'`]?\s*\.\s*["'`]?$/.test(nextTexts[i])) i++;
  if (i >= nextTexts.length) return true;
  return !/^["'`]?\s*\./.test(nextTexts[i]);
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
    // Arming SUPPRESSES reports here, so a loop binding counts only when the
    // loop iterates sink-derived rows — see createSweepBinding's doc.
    const { isSweepBound, resolve } = createSweepBinding(context, {
      loopBindingNeedsSinkIterable: true,
    });
    const sqlTextGroups = createSqlTextGroups(resolve);

    // table name → first create node seen (for the report location).
    const created = new Map();
    const dropped = new Set();
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
    function recordText(text, node, nextTexts) {
      const endIsDynamic = nextTexts !== null;
      for (const table of rawCreateNames(text, endIsDynamic)) {
        if (!created.has(table)) created.set(table, node);
      }
      for (const table of rawDropNames(text, endIsDynamic)) dropped.add(table);
      sweptPrefixes.push(...sweepPrefixMatchers(text));
      if (hasDynamicDropName(text, nextTexts)) sawSweepDrop = true;
    }

    // Each quasi is static text between interpolations; a quasi that is
    // followed by an interpolation has a dynamic end (see rawCreateNames), and
    // the quasis after it are where the interpolated values resume.
    function recordQuasis(quasis, node) {
      const last = quasis.length - 1;
      quasis.forEach((text, i) => {
        if (text) recordText(text, node, i < last ? quasis.slice(i + 1) : null);
      });
    }

    function recordSinkSql(call) {
      // Every shape goes through the shared resolver: an inline literal and an
      // inline template resolve to their own quasi group unchanged, so reading
      // them here would duplicate it. A resolved string is read exactly like an
      // inline one — its quasi group carries the same boundary information the
      // AST would, so a hoisted or concatenated sweep's DROP half arms and a
      // hoisted or concatenated raw CREATE/DROP folds into the same balance.
      for (const arg of call.arguments) {
        for (const quasis of sqlTextGroups(arg)) recordQuasis(quasis, arg);
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
          // The helper spelling of a sweep's drop half: `dropTable(row.name)`
          // names no table itself, so it arms only when its argument traces
          // back to a sink-derived row binding. A fixed name arms nothing.
          for (const arg of node.arguments) {
            if (staticString(arg) === null && isSweepBound(arg)) sawSweepDrop = true;
          }
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
          if (prefixes.some((p) => p.test(name))) continue;
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
