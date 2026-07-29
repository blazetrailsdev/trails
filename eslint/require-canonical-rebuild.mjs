import { calledName, staticString, SQL_SINKS } from "./sql-call-shapes.mjs";
import { rawDropNames } from "./require-table-teardown.mjs";
import { createSweepBinding } from "./sweep-binding.mjs";
import { CATALOGUE_SOURCE } from "./canonical-catalogue-sources.mjs";
import { createSqlTexts } from "./sql-texts.mjs";

const DROP_TABLE = /\bdrop\s+table\b/i;

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
        "Require a test file that drops a canonical table to restore it in the same file, via rebuildCanonicalTables() or loadCanonicalSchema(). Three drop forms are detected: the dropTable() helper, a raw DROP TABLE naming the table in an execution sink, and a drop loop driven by a catalogue sweep. The third form names no table in the DROP itself (`DROP TABLE ${row.tablename}`, or dropTable(row.name)); its victims appear only in the catalogue SELECT that feeds the loop. BOTH spellings arm only on a swept name: the dropTable() argument, and at least one substitution of a template containing DROP TABLE, must trace back to a for-of/for-in binding, an inline callback parameter, or a variable initialized OR ASSIGNED from an execution sink (let rows; rows = await execute(sql) binds as surely as the const form). A variable counts as sweep-bound only when it IS the for-of/for-in binding, or the parameter of a callback whose call also carries the row set — either as the callee's object (tables.map(cb)) or as another argument (eachRow(rows, cb), pMap(rows, cb), Array.from(rows, cb)). That is a shape test, not a method-name list: a list covers no non-member spelling, while requiring the row set to be sink-derived keeps a resource callback such as withConnection((conn) => …) quiet, since it carries no sink-derived value. Arming is per-CALL, not per-parameter: every parameter of every callback in a qualifying call arms, whatever its role — a reduce accumulator, and equally the resource parameter of withRows(rows, (conn) => …), where a fixed per-connection name reports because the same call also carries the row set. Over-report direction, accepted. A variable is never sweep-bound merely by being declared inside one of these — otherwise every fixed name declared in a describe/it callback or a loop body arms. That last clause is what covers index and while loops (an index loop over rows[i].name, or while (rows.length) { const t = rows.pop(); … }), whose loop variable has no binding form to detect — the rows came from a query, which is the actual sweep signal. Note it is ANY sink-derived value, rows or not: a scratch name read back from the database (const scratch = await execute('SELECT gen_scratch_name()')) arms too, though nothing is swept. Arming looks at every substitution rather than only the one following a `DROP TABLE ` prefix, so a dynamic schema qualifier (DROP TABLE ${SCHEMA}.<quoted ${t}>) cannot hide the swept name. The swept substitution need NOT be the table name, and need not be related to the DROP at all: a template that contains DROP TABLE anywhere and any swept substitution anywhere arms, so a fixed-name drop carrying a swept value in a trailing comment or a second statement arms too. That is deliberate — pairing a substitution to the name position costs the schema-qualifier and multi-statement cases for no measured benefit. So dropTable(SOME_MODULE_CONST) and exec(`DROP TABLE \"${TABLE_NAME}\"`) — fixed names, not sweeps — do not arm the check, and an identifier that resolves to no declaration at all (an import, a global) counts as fixed rather than loop-bound. Once a file contains such an unnameable drop, a canonical name counts as dropped when it is quoted inside a SQL string that also references a catalogue source (pg_tables, pg_class, sqlite_master, sqlite_schema, pragma_table_list, information_schema.tables, SHOW TABLES), or when it is an element of an array literal in a file that executes such a query — the latter because the filter list is commonly built in JS (`IN (${names.map((n) => `'${n}'`).join(\",\")})`), which puts the name in an array and never in the SQL. Catalogue strings count only where they reach an execution sink, either directly or through an identifier holding the string. For such an identifier EVERY string it can hold counts — initializer and all assignments, regardless of position relative to the call — deliberately, because which write reaches the sink is not decidable here and guessing wrong is a miss rather than a noisy report, so hoisting the query to a `const SWEEP_SQL` does not hide it while an expected-SQL assertion or an error-message literal mentioning a catalogue does not arm anything. Two deliberate narrowings, both to stop this becoming a ratchet that fires on unrelated edits: (a) only quoted names, never bare words, because `columns`, `values`, `select` and `distinct` are canonical table names as well as SQL keywords, and bare-word matching measured 24 false positives across 5 files; (b) only strings that touch a catalogue, because a sweep can only choose its victims by reading one, so ordinary DML quoting a table name for an unrelated reason stays quiet. Both are over-approximations within the catalogue-query population: a canonical name quoted in a catalogue probe that does NOT feed the drop loop still reports. The name scan is deliberately NOT scoped to the exact SELECT the loop iterates, even though arming now resolves a swept name back to its row source: a sweep's filter and its DROP are often written against different variables, and pairing them would trade a tolerable over-report for real misses. KNOWN GAPS, all of which let a real sweep through undetected, and all reviewed once since: a filter list built from values that are neither string literals nor array-literal elements (a map lookup, a function return, a name read off another query's rows) — ACCEPTED, since following those needs interprocedural value tracking the lint pass does not have; a catalogue name spelled in a way CATALOGUE_SOURCE does not list — CLOSED as far as a lint pass can close it: the list now lives in eslint/canonical-catalogue-sources.mjs, and canonical-catalogue-sources.test.mjs scans every catalogue relation read under packages/ and fails on one classified neither as able nor as unable to name a table, so the alternation cannot rot silently the way it did when pragma_table_list went missing; a drop whose swept name reaches either spelling through a wrapper call — CLOSED for the single-argument identity-ish case (dropTable(String(t)), exec(`DROP TABLE \"${quote(t)}\"`)), which the drop-site walker now steps through: measured repo-wide at zero new reports. A call with more than one argument is still a dead end, ACCEPTED, since its arguments have no single value to follow. Both walkers share one unwrapStep, so member, optional-chain, non-null, await, logical, conditional and single-expression-template wrappings are unwrapped identically at the drop site and when resolving a row source; they differ only in that resolving a row source unwraps a call to its CALLEE (to reach a member chain's object, as in res.rows.filter(cb)) while the drop site unwraps a single-argument call to its ARGUMENT. A call resolving to a plain function binding is an accepted dead end; a catalogue query built from a shape the shared resolver does not follow — ACCEPTED, only a literal, a template, a `+` chain over those, an identifier holding one, and a call of a local function returning one is followed to a sink (all of them resolve through the shared resolver, whose joined reading is what this rule takes; every function the callee binding can hold counts, assignments included, on the same every-write contract a hoisted query string takes; arguments are not bound to parameters there, so a parameter reads as a substitution rather than as the caller's value); a catalogue query appended piecewise (sql += ' WHERE …') — ACCEPTED, since a compound assignment's write is only its right-hand side and the shared resolver would have to sort the writes by source position to form the string the code executes; left open on measurement rather than on cost, because eslint/piecewise-sql-population.test.mjs parses every AR test file either teardown rule is enabled on (the scope resolved by ESLint itself, so this rule's ignores and exclude lists cannot drift out from under the measurement) and finds zero SQL strings built that way, and fails the day one appears; a sweep whose row set reaches the drop only through a helper that closes over it (async function sweep(rows) { … } called elsewhere) — ACCEPTED, the callback shape test needs the row set on the same call; and a row name aliased through a form unwrapStep cannot follow, which the next paragraph states exactly. UNWRAPPING BOUNDARY: unwrapStep is single-successor by construction, so it follows exactly one operand per node. A CONDITIONAL and a LOGICAL expression are both two-successor nodes squeezed into it: each follows the branch the real value is actually written in — the consequent of r.tablename ? r.tablename : 'x', the left of res.rows ?? [] — so the mirrored spellings ('x' ? … : r.tablename, FALLBACK || res.rows) stay quiet, ACCEPTED. A template is followed only when it has exactly ONE substitution — `public.${r.tablename}` resolves, `${PRE}${r.tablename}` does not, ACCEPTED because two substitutions need a fan-out the single-successor shape cannot express. The array-literal path also keeps one over-approximation of its own: the array need not be the filter list, so a canonical name in an unrelated array literal reports if the file both executes a catalogue query and drops by loop-bound name. Restores are rebuildCanonicalTables(adapter, [names]), loadCanonicalSchema(adapter), or a rebuildCanonicalTables() whose name list is not a literal array, which is treated as restoring everything rather than guessed at. Permanent exemptions live in eslint/require-canonical-rebuild-exclude.json: `privateAdapter` files own a :memory: or tmpdir database that cannot drift the shared per-worker one, and `nonExecuting` files record DDL against a fake adapter instead of running it.",
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
    let catalogueSeen = false;
    const namesInScope = new Set();
    const arrayLiteralNames = new Set();
    const rebuilt = new Set();
    let restoresEverything = false;

    function recordDrop(table, node) {
      if (canonical.has(table) && !dropped.has(table)) dropped.set(table, node);
    }

    const { resolve, isSweepBound: isLoopBound } = createSweepBinding(context);

    const sqlTexts = createSqlTexts(resolve);

    function recordSinkSql(call) {
      for (const arg of call.arguments) {
        if (arg.type === "Literal") {
          if (typeof arg.value === "string") {
            for (const table of rawDropNames(arg.value)) recordDrop(table, arg);
          }
        } else if (arg.type === "TemplateLiteral") {
          const last = arg.quasis.length - 1;
          arg.quasis.forEach((quasi, i) => {
            if (!quasi.value.cooked) return;
            for (const table of rawDropNames(quasi.value.cooked, i < last)) recordDrop(table, arg);
          });
          const isDropStatement = arg.quasis.some((q) => DROP_TABLE.test(q.value.cooked ?? ""));
          if (isDropStatement && arg.expressions.some(isLoopBound)) dynamicDrop ??= arg;
        }
        for (const text of sqlTexts(arg)) recordCatalogueFilterNames(text);
      }
    }

    function recordCatalogueFilterNames(text) {
      if (!CATALOGUE_SOURCE.test(text)) return;
      catalogueSeen = true;
      for (const [, name] of text.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) {
        if (canonical.has(name)) namesInScope.add(name);
      }
    }

    return {
      Literal(node) {
        if (
          typeof node.value === "string" &&
          canonical.has(node.value) &&
          node.parent?.type === "ArrayExpression"
        ) {
          arrayLiteralNames.add(node.value);
        }
      },

      CallExpression(node) {
        const name = calledName(node.callee);
        if (name === null) return;
        if (name === "dropTable") {
          for (const arg of node.arguments) {
            const table = staticString(arg);
            if (table !== null) recordDrop(table, node);
            else if (isLoopBound(arg)) dynamicDrop ??= node;
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
        if (catalogueSeen) for (const table of arrayLiteralNames) namesInScope.add(table);
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
