import { calledName, staticString, rawDropNames, SQL_SINKS } from "./require-table-teardown.mjs";

const DROP_TABLE = /\bdrop\s+table\b/i;

const CATALOGUE_SOURCE =
  /\b(?:pg_tables|pg_class|sqlite_master|sqlite_schema|pragma_table_list|information_schema\.tables)\b|\bshow\s+tables\b/i;

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
        "Require a test file that drops a canonical table to restore it in the same file, via rebuildCanonicalTables() or loadCanonicalSchema(). Three drop forms are detected: the dropTable() helper, a raw DROP TABLE naming the table in an execution sink, and a drop loop driven by a catalogue sweep. The third form names no table in the DROP itself (`DROP TABLE ${row.tablename}`, or dropTable(row.name)); its victims appear only in the catalogue SELECT that feeds the loop. BOTH spellings arm only on a swept name: the dropTable() argument, and at least one substitution of a template containing DROP TABLE, must trace back to a for-of/for-in binding, an inline callback parameter, or a variable initialized from an execution sink. That last clause is what covers index and while loops (an index loop over rows[i].name, or while (rows.length) { const t = rows.pop(); … }), whose loop variable has no binding form to detect — the rows came from a query, which is the actual sweep signal. Arming looks at every substitution rather than only the one following a `DROP TABLE ` prefix, so a dynamic schema qualifier (DROP TABLE ${SCHEMA}.<quoted ${t}>) cannot hide the swept name. So dropTable(SOME_MODULE_CONST) and exec(`DROP TABLE \"${TABLE_NAME}\"`) — fixed names, not sweeps — do not arm the check, and an identifier that resolves to no declaration at all (an import, a global) counts as fixed rather than loop-bound. Once a file contains such an unnameable drop, a canonical name counts as dropped when it is quoted inside a SQL string that also references a catalogue source (pg_tables, pg_class, sqlite_master, sqlite_schema, pragma_table_list, information_schema.tables, SHOW TABLES), or when it is an element of an array literal in a file that executes such a query — the latter because the filter list is commonly built in JS (`IN (${names.map((n) => `'${n}'`).join(\",\")})`), which puts the name in an array and never in the SQL. Catalogue strings count only where they reach an execution sink, either directly or through an identifier whose initializer or first assignment is the string, so hoisting the query to a `const SWEEP_SQL` does not hide it while an expected-SQL assertion or an error-message literal mentioning a catalogue does not arm anything. Two deliberate narrowings, both to stop this becoming a ratchet that fires on unrelated edits: (a) only quoted names, never bare words, because `columns`, `values`, `select` and `distinct` are canonical table names as well as SQL keywords, and bare-word matching measured 24 false positives across 5 files; (b) only strings that touch a catalogue, because a sweep can only choose its victims by reading one, so ordinary DML quoting a table name for an unrelated reason stays quiet. Both are over-approximations within the catalogue-query population: a canonical name quoted in a catalogue probe that does NOT feed the drop loop still reports. The name scan is deliberately NOT scoped to the exact SELECT the loop iterates, even though arming now resolves a swept name back to its row source: a sweep's filter and its DROP are often written against different variables, and pairing them would trade a tolerable over-report for real misses. KNOWN GAPS, all of which let a real sweep through undetected: a filter list built from values that are neither string literals nor array-literal elements (a map lookup, a function return, a name read off another query's rows); a catalogue name spelled in a way CATALOGUE_SOURCE does not list; a drop whose swept name reaches either spelling through a call the rule does not see through, such as dropTable(String(t)) or a wrapper function — member, optional-chain, non-null, logical and single-expression-template wrappings ARE unwrapped, a call is not; and a catalogue query built by string concatenation or returned from a helper, since only a literal, a template, or an identifier initialized to one is followed to a sink. The array-literal path also keeps one over-approximation of its own: the array need not be the filter list, so a canonical name in an unrelated array literal reports if the file both executes a catalogue query and drops by loop-bound name. Restores are rebuildCanonicalTables(adapter, [names]), loadCanonicalSchema(adapter), or a rebuildCanonicalTables() whose name list is not a literal array, which is treated as restoring everything rather than guessed at. Permanent exemptions live in eslint/require-canonical-rebuild-exclude.json: `privateAdapter` files own a :memory: or tmpdir database that cannot drift the shared per-worker one, and `nonExecuting` files record DDL against a fake adapter instead of running it.",
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

    function resolve(node) {
      if (node?.type !== "Identifier") return null;
      const scope = context.sourceCode.getScope(node);
      for (let s = scope; s; s = s.upper) {
        const found = s.variables.find((v) => v.name === node.name);
        if (found) return found;
      }
      return null;
    }

    /** The string a sink argument carries, following one hoisted identifier. */
    function sqlText(node, seen = new Set()) {
      if (node?.type === "Literal") return typeof node.value === "string" ? node.value : null;
      if (node?.type === "TemplateLiteral")
        return node.quasis.map((q) => q.value.cooked ?? "").join(" ");
      if (node?.type !== "Identifier") return null;
      const variable = resolve(node);
      if (variable === null || seen.has(variable)) return null;
      seen.add(variable);
      const init = variable.defs?.[0]?.node?.init;
      if (init) return sqlText(init, seen);
      const written = variable.references.find((r) => r.writeExpr)?.writeExpr;
      return written ? sqlText(written, seen) : null;
    }

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
        const text = sqlText(arg);
        if (text !== null) recordCatalogueFilterNames(text);
      }
    }

    function recordCatalogueFilterNames(text) {
      if (!CATALOGUE_SOURCE.test(text)) return;
      catalogueSeen = true;
      for (const [, name] of text.matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) {
        if (canonical.has(name)) namesInScope.add(name);
      }
    }

    function rootIdentifier(expr) {
      let cur = expr;
      for (;;) {
        if (!cur) return null;
        if (cur.type === "MemberExpression") cur = cur.object;
        else if (cur.type === "ChainExpression") cur = cur.expression;
        else if (cur.type === "TSNonNullExpression") cur = cur.expression;
        else if (cur.type === "LogicalExpression") cur = cur.left;
        else if (cur.type === "AwaitExpression") cur = cur.argument;
        else if (cur.type === "TemplateLiteral")
          cur = cur.expressions.length === 1 ? cur.expressions[0] : null;
        else return cur.type === "Identifier" ? cur : null;
      }
    }

    /** A value read out of a query's result rows — the row source of a sweep. */
    function isSinkDerived(node, seen) {
      let cur = node;
      while (cur?.type === "AwaitExpression") cur = cur.argument;
      if (cur?.type !== "CallExpression") return false;
      if (SQL_SINKS.has(calledName(cur.callee))) return true;
      const root = rootIdentifier(cur.callee);
      return root === null ? false : varIsSweepBound(resolve(root), seen);
    }

    function varIsSweepBound(variable, seen = new Set()) {
      if (variable === null || seen.has(variable)) return false;
      seen.add(variable);
      return variable.defs.some((def) => {
        for (let n = def.node; n; n = n.parent) {
          if (n.type === "ForOfStatement" || n.type === "ForInStatement") return true;
          if (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression") {
            return n.parent?.type === "CallExpression" && n.parent.arguments.includes(n);
          }
          if (n.type === "VariableDeclarator" && n.init) return isSinkDerived(n.init, seen);
          if (n.type === "FunctionDeclaration" || n.type === "Program") return false;
        }
        return false;
      });
    }

    function isLoopBound(expr) {
      const root = rootIdentifier(expr);
      return root === null ? false : varIsSweepBound(resolve(root));
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
