/**
 * Shared sweep-binding resolver for `require-canonical-rebuild` and
 * `require-table-teardown`.
 *
 * A catalogue sweep names no table in its DROP: the victims come out of a
 * catalogue query, and the drop runs per row — either as raw SQL
 * (`` exec(`DROP TABLE "${row.tablename}"`) ``) or through the schema-statement
 * helper (`await adapter.dropTable(row.tablename)`). Both spellings are only a
 * sweep when the dropped name traces back to a row set, so both rules need the
 * same question answered: does this expression bottom out in a value that came
 * from an execution sink?
 *
 * The answer lives here rather than in either rule so the two cannot drift:
 * `require-table-teardown` used to recognise only the raw-SQL spelling, which
 * left the helper form — the form CLAUDE.md steers tests toward — reporting
 * every prefixed create in a file that does tear down correctly.
 *
 * See the `require-canonical-rebuild` rule doc for the full statement of what
 * arms, what does not, and the accepted over- and under-approximations; this
 * module is that description's implementation.
 */
import { calledName, SQL_SINKS } from "./sql-call-shapes.mjs";

/**
 * A sweep-binding resolver bound to one lint `context`. Returns
 * `{ resolve, isSweepBound }`: `resolve` maps an Identifier node to its scope
 * variable, and `isSweepBound` answers whether an expression's value traces
 * back to a sink-derived row binding.
 *
 * `loopBindingNeedsSinkIterable` picks which side to err on when a for-of/for-in
 * binding's iterable is NOT sink-derived (`for (const t of ["ex_int"])`), and
 * the two rules need opposite answers because arming means opposite things to
 * them. In `require-canonical-rebuild` an armed sweep ADDS reports, so accepting
 * every loop binding is a tolerable over-report — and a deliberate one: it is
 * what covers the index and while loops whose variable has no binding form to
 * detect. In `require-table-teardown` an armed sweep SUPPRESSES reports, since
 * a sweep counts as teardown for every create under its prefix, so the same
 * acceptance is a false negative: a file with a catalogue `LIKE` filter and
 * `for (const t of ["ex_int"]) dropTable(t)` would stop reporting a leaked
 * `ex_leak`, which is the exact leak the rule exists to catch. Set there, the
 * flag requires the iterable itself to be sink-derived.
 */
export function createSweepBinding(context, { loopBindingNeedsSinkIterable = false } = {}) {
  function resolve(node) {
    if (node?.type !== "Identifier") return null;
    const scope = context.sourceCode.getScope(node);
    for (let s = scope; s; s = s.upper) {
      const found = s.variables.find((v) => v.name === node.name);
      if (found) return found;
    }
    return null;
  }

  /**
   * One unwrapping step shared by both walkers, so they cannot drift apart:
   * they differ only in that isSinkDerived also descends a CallExpression.
   * Returns undefined when the node is not a wrapper, null at a dead end.
   */
  function unwrapStep(node) {
    switch (node?.type) {
      case "AwaitExpression":
        return node.argument;
      case "ChainExpression":
      case "TSNonNullExpression":
        return node.expression;
      case "ConditionalExpression":
        return node.consequent;
      case "LogicalExpression":
        return node.left;
      case "MemberExpression":
        return node.object;
      case "TemplateLiteral":
        return node.expressions.length === 1 ? node.expressions[0] : null;
      default:
        return undefined;
    }
  }

  function rootIdentifier(expr) {
    let cur = expr;
    for (;;) {
      if (!cur) return null;
      if (cur.type === "CallExpression" && cur.arguments.length === 1) {
        cur = cur.arguments[0];
        continue;
      }
      const next = unwrapStep(cur);
      if (next === undefined) return cur.type === "Identifier" ? cur : null;
      cur = next;
    }
  }

  /**
   * A value read out of a query's result rows — the row source of a sweep.
   * The sink call can sit at ANY level of the chain, not just the top:
   * `(await execute(sql)).rows` and `(await execute(sql)).rows.forEach` both
   * bottom out in a call rather than an identifier, so stopping at the first
   * non-call would miss the collapsed one-liner form while reporting the
   * two-step `const res = …; const rows = res.rows;` spelling.
   */
  function isSinkDerived(node, seen) {
    let cur = node;
    for (;;) {
      if (!cur) return false;
      if (cur.type === "CallExpression") {
        if (SQL_SINKS.has(calledName(cur.callee))) return true;
        // Toward the function, never the arguments: this exists only to reach
        // a member chain's object (`res.rows.filter(cb)`). Landing on a plain
        // function binding is an accepted dead end, not an error.
        cur = cur.callee;
        continue;
      }
      const next = unwrapStep(cur);
      if (next === undefined) break;
      cur = next;
    }
    return cur?.type === "Identifier" ? varIsSweepBound(resolve(cur), seen) : false;
  }

  /**
   * The variable must BE the sweep binding, never merely be enclosed by one:
   * walking up to an enclosing construct arms every fixed name declared
   * inside a describe/it callback or a loop body.
   */
  function varIsSweepBound(variable, seen = new Set()) {
    if (variable === null || seen.has(variable)) return false;
    seen.add(variable);
    const boundByDef = variable.defs.some((def) => {
      if (def.type === "Parameter") return isRowCallbackParam(def.node, seen);
      const declarator = def.node;
      if (declarator?.type !== "VariableDeclarator") return false;
      const declaration = declarator.parent;
      const loop = declaration?.parent;
      if (
        (loop?.type === "ForOfStatement" || loop?.type === "ForInStatement") &&
        loop.left === declaration
      ) {
        return loopBindingNeedsSinkIterable ? isSinkDerived(loop.right, seen) : true;
      }
      return declarator.init ? isSinkDerived(declarator.init, seen) : false;
    });
    if (boundByDef) return true;
    // `let name; name = row.tablename;` binds by assignment, not initializer,
    // and is as much a sweep binding as the `const` form.
    return variable.references.some((ref) => ref.writeExpr && isSinkDerived(ref.writeExpr, seen));
  }

  /**
   * A parameter of a callback whose call also carries the row set — as the
   * callee's object (`tables.map(cb)`) or as a sibling argument
   * (`eachRow(rows, cb)`, `pMap(rows, cb)`). Shape, not method name: a name
   * list misses every non-member spelling, and `withConnection((conn) => …)`
   * stays quiet here because it carries no sink-derived value at all.
   *
   * Arming is per-CALL, not per-parameter: every parameter of every callback
   * in a qualifying call counts, whatever its role. A `reduce` accumulator
   * arms, and so does the resource parameter of
   * `withRows(rows, (conn) => …)`. Over-report direction, accepted.
   */
  function isRowCallbackParam(fn, seen) {
    if (fn?.type !== "ArrowFunctionExpression" && fn?.type !== "FunctionExpression") return false;
    const call = fn.parent;
    if (call?.type !== "CallExpression" || !call.arguments.includes(fn)) return false;
    const callee = call.callee;
    if (callee?.type === "MemberExpression" && isSinkDerived(callee.object, seen)) return true;
    return call.arguments.some((arg) => arg !== fn && isSinkDerived(arg, seen));
  }

  function isSweepBound(expr) {
    const root = rootIdentifier(expr);
    return root === null ? false : varIsSweepBound(resolve(root));
  }

  return { resolve, isSweepBound };
}
