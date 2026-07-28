import { calledName, staticString, rawDropNames, SQL_SINKS } from "./require-table-teardown.mjs";

const DROP_TABLE_DYNAMIC_TAIL =
  /\bdrop\s+table\s+(?:if\s+exists\s+)?(?:(?:"[^"]*"|`[^`]*`|\[[^\]]*\]|\w+)\s*\.\s*)?["'`[]?$/i;

const CATALOGUE_SOURCE =
  /\b(?:pg_tables|pg_class|sqlite_master|information_schema\.tables)\b|\bshow\s+tables\b/i;

const FULL_RESTORE_CALLS = new Set(["loadCanonicalSchema"]);

const REBUILD_CALL = "rebuildCanonicalTables";

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
        "Require a test file that drops a canonical table to restore it in the same file, via rebuildCanonicalTables() or loadCanonicalSchema(). Three drop forms are detected: the dropTable() helper, a raw DROP TABLE naming the table in an execution sink, and a drop loop driven by a catalogue sweep. The third form names no table in the DROP itself (`DROP TABLE ${row.tablename}`, or dropTable(row.name)); its victims appear only in the catalogue SELECT that feeds the loop. Once a file contains such an unnameable drop, a canonical name quoted in a SQL string that also references a catalogue source (pg_tables, pg_class, sqlite_master, information_schema.tables, SHOW TABLES) counts as dropped. Two deliberate narrowings, both to stop this becoming a ratchet that fires on unrelated edits: (a) only quoted names, never bare words, because `columns`, `values`, `select` and `distinct` are canonical table names as well as SQL keywords, and bare-word matching measured 24 false positives across 5 files; (b) only strings that touch a catalogue, because a sweep can only choose its victims by reading one, so ordinary DML quoting a table name for an unrelated reason stays quiet. Both are over-approximations within the catalogue-query population: a canonical name quoted in a catalogue probe that does NOT feed the drop loop still reports. Scoping the scan to the exact SELECT the loop iterates would need dataflow from the loop variable back to its iterable's initializer, which is more machinery than the one shape this guards. Restores are rebuildCanonicalTables(adapter, [names]), loadCanonicalSchema(adapter), or a rebuildCanonicalTables() whose name list is not a literal array, which is treated as restoring everything rather than guessed at. Permanent exemptions live in eslint/require-canonical-rebuild-exclude.json: `privateAdapter` files own a :memory: or tmpdir database that cannot drift the shared per-worker one, and `nonExecuting` files record DDL against a fake adapter instead of running it.",
    },
    schema: [
      {
        type: "object",
        properties: {
          canonicalTables: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingRebuild:
        'Canonical table `{{table}}` is dropped but never restored in this file. Add `await rebuildCanonicalTables(adapter, ["{{table}}"])` after the drop. A canonical table left dropped drifts the shared per-worker database for every file that runs next. If this file owns a private adapter (`:memory:` or a tmpdir file) it cannot drift the shared database — add it to the `privateAdapter` group in eslint/require-canonical-rebuild-exclude.json.',
      sweepReachesCanonical:
        'This file drops tables by a name it computes at runtime, and a catalogue query in it names the canonical table `{{table}}`, so the sweep can drop `{{table}}` off the shared per-worker database and leave it dropped for every file that runs next. Narrow the catalogue filter so it cannot select `{{table}}` (a prefix filter matching only this file\'s own tables), or restore it with `await rebuildCanonicalTables(adapter, ["{{table}}"])`.',
    },
  },

  create(context) {
    const canonical = new Set(context.options[0]?.canonicalTables ?? []);
    if (canonical.size === 0) return {};

    const dropped = new Map();

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
            recordCatalogueFilterNames(arg.value);
          }
        } else if (arg.type === "TemplateLiteral") {
          const last = arg.quasis.length - 1;
          const whole = arg.quasis.map((q) => q.value.cooked ?? "").join(" ");
          arg.quasis.forEach((quasi, i) => {
            if (!quasi.value.cooked) return;
            for (const table of rawDropNames(quasi.value.cooked, i < last)) recordDrop(table, arg);
            if (i < last && DROP_TABLE_DYNAMIC_TAIL.test(quasi.value.cooked)) dynamicDrop ??= arg;
          });
          recordCatalogueFilterNames(whole);
        }
      }
    }

    function recordCatalogueFilterNames(text) {
      if (!CATALOGUE_SOURCE.test(text)) return;
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
            else if (arg.type !== "ObjectExpression") dynamicDrop ??= node;
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
