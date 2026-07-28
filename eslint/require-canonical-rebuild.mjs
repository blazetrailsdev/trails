/**
 * ESLint rule: require-canonical-rebuild
 *
 * The inverse of `require-table-teardown`. That rule balances DDL **per table
 * name** — a bespoke `CREATE TABLE foo` must be matched by a `DROP TABLE foo`
 * — which catches a table that outlives its test. It cannot catch the opposite
 * drift: a test file that **drops a canonical table and leaves it dropped**.
 *
 * That is what happened to `subscribers` (PR #5256): the mysql2 adapter test
 * hand-rolled `CREATE TABLE subscribers` and dropped it again in a `finally`,
 * perfectly balanced by the teardown rule's accounting, and still left the
 * shared per-worker database missing the canonical `subscribers` for whichever
 * file ran next — shape drift `repairWorkerSchema` then had to repair.
 *
 * The invariant: a **canonical** table (a key of `TEST_SCHEMA` in
 * `test-helpers/test-schema.ts`, supplied to the rule via the
 * `canonicalTables` option) may be dropped by a test file only if that same
 * file restores it, via `rebuildCanonicalTables(adapter, ["…"])` or
 * `loadCanonicalSchema(adapter)`.
 *
 *   ✗  await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");
 *      // …no rebuild anywhere in the file
 *
 *   ✓  await adapter.executeMutation("DROP TABLE IF EXISTS `subscribers`");
 *      await rebuildCanonicalTables(adapter, ["subscribers"]);
 *
 * Drops are seen in both forms `require-table-teardown` understands: the
 * `dropTable("foo")` helper (receiver-agnostic, multiple names per call) and a
 * raw `DROP TABLE foo` inside an execution sink's string/template argument
 * (`SQL_SINKS`). Only statically-known names participate in either direction.
 *
 * A third, indirect form: a drop loop driven by a catalogue sweep, where the
 * DROP carries no static name at all and its victims are named only in the
 * SELECT that feeds it. `items` went missing off the shared PostgreSQL worker
 * database exactly this way — `postgresql-adapter.trails.test.ts` swept
 * `pg_tables … tablename IN ('…', 'items', …)` and dropped each row by
 * interpolated name, which no per-name accounting could see. So when a file
 * contains a `` `DROP TABLE ${…}` `` *and* quotes a canonical table name in
 * some sink SQL, that name counts as dropped. Only *quoted* names count:
 * `columns`, `values`, `select` and `distinct` are canonical table names as
 * well as SQL keywords, so bare-word matching reports on ordinary query text.
 *
 * Restores are recognised as:
 *   - `rebuildCanonicalTables(adapter, ["a", "b"])` — each static element of
 *     the array literal is restored;
 *   - `loadCanonicalSchema(adapter)` — restores everything, so the file is
 *     clean by construction;
 *   - `rebuildCanonicalTables(adapter, NAMES)` with a non-literal name list —
 *     the set can't be read statically, so the file is treated as restoring
 *     everything rather than guessed at (no false positives).
 *
 * Exemptions live in `eslint/require-canonical-rebuild-exclude.json`, on the
 * same pattern `require-table-teardown-raw-sql-exclude.json` uses, split into
 * two permanently-exempt groups: `privateAdapter` files own their own adapter
 * (a `:memory:` database, or a throwaway file under a per-test tmpdir), so a
 * canonical table they drop cannot drift the shared per-worker database;
 * `nonExecuting` files have no database at all — a hand-rolled fake adapter
 * records the DDL instead of running it. Neither is backlog: a file that
 * really leaves a canonical table dropped is fixed, not listed, and a file
 * that only sometimes skips execution (captureSql's stub mode) takes a
 * line-scoped disable at the drop rather than a whole-file exemption.
 */

import { calledName, staticString, rawDropNames, SQL_SINKS } from "./require-table-teardown.mjs";

/**
 * A quasi whose text ends in `DROP TABLE [IF EXISTS] [quote]` hands the table
 * name to the interpolation that follows: the drop is real but its target is
 * invisible to `rawDropNames`. See `dynamicDrop` below.
 */
const DROP_TABLE_DYNAMIC_TAIL = /\bdrop\s+table\s+(?:if\s+exists\s+)?["'`[]?$/i;

/** Call names that restore the canonical schema for every table at once. */
const FULL_RESTORE_CALLS = new Set(["loadCanonicalSchema"]);
/** Call name that restores a named subset of the canonical schema. */
const REBUILD_CALL = "rebuildCanonicalTables";

/**
 * The statically-known table names a `rebuildCanonicalTables(adapter, names)`
 * call restores, or null when the name list isn't a literal array of static
 * strings — a spread, a variable, or a computed element makes the set unknown,
 * which the caller treats as a full restore.
 */
function rebuiltTableNames(call) {
  const names = call.arguments[1];
  if (!names || names.type !== "ArrayExpression") return null;
  const out = [];
  for (const element of names.elements) {
    if (!element) continue;
    const name = staticString(element);
    if (name === null) return null;
    out.push(name);
  }
  return out;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a test file that drops a canonical table to restore it in the same file, via rebuildCanonicalTables() or loadCanonicalSchema().",
    },
    schema: [
      {
        type: "object",
        properties: {
          // The canonical table names (keys of TEST_SCHEMA), supplied by
          // eslint.config.mjs so the rule stays free of filesystem access.
          canonicalTables: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingRebuild:
        'Canonical table `{{table}}` is dropped but never restored in this file. Add `await rebuildCanonicalTables(adapter, ["{{table}}"])` after the drop. A canonical table left dropped drifts the shared per-worker database for every file that runs next. If this file owns a private adapter (`:memory:` or a tmpdir file) it cannot drift the shared database — add it to the `privateAdapter` group in eslint/require-canonical-rebuild-exclude.json.',
      sweepReachesCanonical:
        'This file drops tables by interpolated name (`DROP TABLE ${…}`) and mentions the canonical table `{{table}}`, so the sweep can drop it off the shared per-worker database and leave it dropped. Narrow the sweep so it cannot select `{{table}}` (a prefix filter on this file\'s own tables), or restore it with `await rebuildCanonicalTables(adapter, ["{{table}}"])`.',
    },
  },

  create(context) {
    const canonical = new Set(context.options[0]?.canonicalTables ?? []);
    if (canonical.size === 0) return {};

    // canonical table name → first drop node seen (for the report location).
    const dropped = new Map();
    // First `DROP TABLE ${…}` node in the file, if any, plus every canonical
    // name quoted in a SQL sink string. A drop loop fed by a
    // `pg_tables`/`sqlite_master` sweep names its victims in the SELECT's
    // filter list, never in the DROP — that pair is the only static evidence
    // that the sweep can reach a canonical table.
    let dynamicDrop = null;
    const namesInScope = new Set();
    const rebuilt = new Set();
    let restoresEverything = false;

    function recordDrop(table, node) {
      if (canonical.has(table) && !dropped.has(table)) dropped.set(table, node);
    }

    function recordSinkSql(call) {
      for (const arg of call.arguments) {
        if (arg.type === "Literal") {
          if (typeof arg.value === "string") {
            for (const table of rawDropNames(arg.value)) recordDrop(table, arg);
            recordQuotedNames(arg.value);
          }
        } else if (arg.type === "TemplateLiteral") {
          // A quasi followed by an interpolation has a dynamic end: a name that
          // runs to it is a prefix of a dynamic name, not a table (see
          // rawDropNames).
          const last = arg.quasis.length - 1;
          arg.quasis.forEach((quasi, i) => {
            if (!quasi.value.cooked) return;
            for (const table of rawDropNames(quasi.value.cooked, i < last)) recordDrop(table, arg);
            recordQuotedNames(quasi.value.cooked);
            if (i < last && DROP_TABLE_DYNAMIC_TAIL.test(quasi.value.cooked)) dynamicDrop ??= arg;
          });
        }
      }
    }

    /**
     * Canonical names appearing as a *quoted SQL string* in a sink argument —
     * `IN ('items', …)` in the catalogue SELECT that feeds a drop loop. Bare
     * words are deliberately not counted: several canonical tables are named
     * after SQL keywords (`columns`, `values`, `select`, `distinct`), so any
     * looser match reports on ordinary query text.
     */
    function recordQuotedNames(text) {
      for (const [, name] of text.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) {
        if (canonical.has(name)) namesInScope.add(name);
      }
    }

    return {
      CallExpression(node) {
        const name = calledName(node.callee);
        if (name === null) return;
        if (name === "dropTable") {
          for (const arg of node.arguments) {
            const table = staticString(arg);
            if (table !== null) recordDrop(table, node);
          }
        } else if (name === REBUILD_CALL) {
          const names = rebuiltTableNames(node);
          if (names === null) restoresEverything = true;
          else for (const table of names) rebuilt.add(table);
        } else if (FULL_RESTORE_CALLS.has(name)) {
          restoresEverything = true;
        } else if (SQL_SINKS.has(name)) {
          recordSinkSql(node);
        }
      },

      // Deferred so a rebuild anywhere in the file — including a hook declared
      // after the test that drops — counts as the restore.
      "Program:exit"() {
        if (restoresEverything) return;
        for (const [table, node] of dropped) {
          if (rebuilt.has(table)) continue;
          context.report({ node, messageId: "missingRebuild", data: { table } });
        }
        if (dynamicDrop === null) return;
        for (const table of namesInScope) {
          if (rebuilt.has(table) || dropped.has(table)) continue;
          context.report({
            node: dynamicDrop,
            messageId: "sweepReachesCanonical",
            data: { table },
          });
        }
      },
    };
  },
};

export default rule;
