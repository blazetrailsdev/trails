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
 * (`SQL_SINKS`). Only statically-known names participate in either direction;
 * a name behind an interpolation (`` `DROP TABLE ${t}` ``) is invisible, so it
 * is never flagged.
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
 * two groups: `memoryScoped` files own a private `:memory:` adapter, never
 * touch the shared per-worker database, and are permanently exempt; `backlog`
 * files really do leave a canonical table dropped and are ratcheted to zero.
 */

import { calledName, staticString, rawDropNames, SQL_SINKS } from "./require-table-teardown.mjs";

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
        'Canonical table `{{table}}` is dropped but never restored in this file. Add `await rebuildCanonicalTables(adapter, ["{{table}}"])` after the drop. A canonical table left dropped drifts the shared per-worker database for every file that runs next. If this file owns a private `:memory:` adapter it cannot drift the shared database — add it to the `memoryScoped` group in eslint/require-canonical-rebuild-exclude.json.',
    },
  },

  create(context) {
    const canonical = new Set(context.options[0]?.canonicalTables ?? []);
    if (canonical.size === 0) return {};

    // canonical table name → first drop node seen (for the report location).
    const dropped = new Map();
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
          }
        } else if (arg.type === "TemplateLiteral") {
          // A quasi followed by an interpolation has a dynamic end: a name that
          // runs to it is a prefix of a dynamic name, not a table (see
          // rawDropNames).
          const last = arg.quasis.length - 1;
          arg.quasis.forEach((quasi, i) => {
            if (!quasi.value.cooked) return;
            for (const table of rawDropNames(quasi.value.cooked, i < last)) recordDrop(table, arg);
          });
        }
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
      },
    };
  },
};

export default rule;
