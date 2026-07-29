/**
 * Resolving a sink argument to the SQL strings it can carry.
 *
 * Shared by the two table-teardown rules so they cannot disagree about which
 * writes count. It sits in a leaf module for the same reason
 * `sql-call-shapes.mjs` does: both rules need it, and neither should import the
 * other to get it.
 */

/**
 * Build a `sqlTexts(node)` over a scope resolver (`createSweepBinding`'s
 * `resolve`).
 *
 * Every string a sink argument could carry: the initializer AND all later
 * assignments, since a `let` reassigned to the catalogue query before the call
 * is as real as one initialized to it, and which write reaches the sink is not
 * decidable here. Guessing wrong that way is a miss rather than a noisy report,
 * so hoisting a query to a `const SWEEP_SQL` does not hide it while an
 * expected-SQL assertion never reaches a sink and so arms nothing.
 *
 * A template's quasis are joined with a space, which is lossy about where the
 * substitutions sat: it can only ADD strings a reader might match, so it is
 * safe for a rule whose matches produce reports and unsafe for one whose
 * matches suppress them. A rule that needs to know where the substitutions sat
 * takes `createSqlTextGroups` below instead of joining.
 */
export function createSqlTexts(resolve) {
  const sqlTextGroups = createSqlTextGroups(resolve);
  return function sqlTexts(node) {
    return sqlTextGroups(node).map((g) => g.join(" "));
  };
}

/**
 * The same resolution, but each resolved string is returned as its *quasi
 * array* — one entry per static run, in order — rather than as a flat string.
 *
 * A caller reading a table NAME off a resolved string needs to know whether the
 * name it found is complete or runs into a substitution, and the flat form has
 * thrown that away: `DROP TABLE tmp_${suffix}` and `DROP TABLE tmp_` reduce to
 * the same text. Keeping the group intact lets the caller pass each quasi its
 * successors, which is exactly the dynamic-end signal the inline-template path
 * already derives from the AST. A plain string resolves to a one-element group,
 * which correctly reads as having no dynamic end anywhere.
 *
 * A `+` concatenation is read as the template it is spelled as: each operand
 * resolves recursively, and an operand that resolves to no strings is a
 * substitution — the same quasi boundary a `${…}` produces — so `'DROP TABLE
 * tmp_' + suffix` lowers to the group `["DROP TABLE tmp_", ""]` and names no
 * knowable table, exactly as the template spelling does. A pattern closed
 * within one operand (`"… LIKE 'ex_%'" + tail`) sits inside a single quasi and
 * is still read whole, while one interpolated across operands (`"… LIKE 'ex" +
 * suffix + "%'"`) is split at the boundary and so credits nothing. An operand
 * that carries several strings fans out, so every combination is returned. The
 * `seen` set is forked per operand: a variable read on both sides resolves on
 * both, rather than going dynamic on whichever side is visited second.
 *
 * A CALL of a local helper resolves to what the helper can return: the callee
 * identifier resolves to its function binding, and every `return` expression in
 * that body — or the concise-body expression of an arrow — goes back through
 * this same recursion, so a helper is read exactly as the SQL it hands back
 * would have been read inline. Several returns fan out, since which one runs is
 * not decidable here, and so do several functions the callee binding can hold:
 * a helper ASSIGNED to a `let` is read alongside one declared or initialized,
 * the same every-write contract the string path above takes. Arguments are
 * deliberately NOT bound to parameters: a parameter binding has no initializer
 * and no write, so it resolves to no
 * strings and reads as a substitution — exactly the quasi boundary a name or
 * LIKE pattern flush against it needs, since its value is the caller's to vary.
 * So `` `… LIKE 'ex${prefix}%'` `` credits nothing whether the interpolation is
 * written at the call site or sits a parameter deep in a helper, and `` `DROP
 * TABLE tmp_${suffix}` `` returned from one names no knowable table. A callee
 * that is not a resolvable local function — an import, a global, a method call —
 * stays a dead end and contributes no strings, the same under-accepting
 * direction the rest of this resolver takes.
 *
 * What is NOT read as the string it produces is SQL assembled ACROSS
 * STATEMENTS, in any of four spellings: `sql += …`, `sql = sql + …`,
 * `` sql = `${sql}…` ``, and `parts.push(…)` joined at the sink. A write is only
 * its own right-hand side, and a self-read is already in `seen` by the time it is
 * visited — so it resolves to no strings and reads as a quasi boundary — which
 * leaves the fragments independent and in no particular order. Stitching them
 * would need the writes sorted by source position within the enclosing function;
 * that is left undone deliberately, because
 * `eslint/piecewise-sql-population.test.mjs` measures the population in the files
 * either teardown rule is enabled on (a scope resolved by ESLint, not restated)
 * at zero for all four, and fails if it stops being zero.
 *
 * Unlike this resolver's remaining dead ends, the direction is not always
 * under-accepting. Each fragment is read whole, so a fragment that carries both a
 * catalogue relation and a closed `LIKE '…%'` credits that prefix by itself —
 * sound when the fragment's text survives into the executed SQL, wrong when a
 * neighbour comments it out or negates it. Cut the other way, the relation and
 * the pattern land in different fragments and nothing is credited at all. A
 * pattern split across two fragments credits nothing either way. All four
 * spellings and both directions are pinned in
 * `eslint/require-table-teardown.test.mjs`.
 */
export function createSqlTextGroups(resolve) {
  const isFunctionNode = (node) =>
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression" ||
    node?.type === "ArrowFunctionExpression";

  /**
   * The `{ variable, fns }` a call's callee identifier names, or null when it
   * names no local function — an import, a global, a method call, or a binding
   * that holds something other than a function.
   *
   * EVERY function the binding can hold counts, initializer and assignments
   * alike, on the same contract the string path takes above: which write reaches
   * the call is not decidable here, so `let sweepSql; sweepSql = () => …` is as
   * real a helper as the `const` form, and reading only the declarator would
   * leave the assigned spelling invisible. Several candidates fan out exactly as
   * several returns from one candidate do.
   */
  function calleeFunctions(node) {
    if (node?.type !== "Identifier") return null;
    const variable = resolve(node);
    if (variable === null) return null;
    const fns = [];
    for (const def of variable.defs ?? []) {
      const defNode = def.node;
      if (isFunctionNode(defNode)) fns.push(defNode);
      else if (defNode?.type === "VariableDeclarator" && isFunctionNode(defNode.init)) {
        fns.push(defNode.init);
      }
    }
    for (const ref of variable.references) {
      if (isFunctionNode(ref.writeExpr)) fns.push(ref.writeExpr);
    }
    return fns.length > 0 ? { variable, fns } : null;
  }

  /**
   * Every value the function can hand back. Nested functions are skipped: their
   * returns are the inner function's, not this one's.
   */
  function returnExpressions(fn) {
    if (fn.body?.type !== "BlockStatement") return fn.body ? [fn.body] : [];
    const out = [];
    const walk = (node) => {
      if (!node || typeof node.type !== "string" || isFunctionNode(node)) return;
      if (node.type === "ReturnStatement") {
        if (node.argument) out.push(node.argument);
        return;
      }
      for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach(walk);
        else walk(child);
      }
    };
    walk(fn.body);
    return out;
  }

  return function sqlTextGroups(node, seen = new Set()) {
    if (node?.type === "Literal") return typeof node.value === "string" ? [[node.value]] : [];
    if (node?.type === "TemplateLiteral") return [node.quasis.map((q) => q.value.cooked ?? "")];
    if (node?.type === "BinaryExpression" && node.operator === "+") {
      const operandGroups = (operand) => {
        const groups = sqlTextGroups(operand, new Set(seen));
        return groups.length > 0 ? groups : [["", ""]];
      };
      const out = [];
      for (const left of operandGroups(node.left)) {
        for (const right of operandGroups(node.right)) {
          out.push([...left.slice(0, -1), left[left.length - 1] + right[0], ...right.slice(1)]);
        }
      }
      return out;
    }
    if (node?.type === "CallExpression") {
      const resolved = calleeFunctions(node.callee);
      if (resolved === null || seen.has(resolved.variable)) return [];
      seen.add(resolved.variable);
      const out = [];
      for (const fn of resolved.fns) {
        for (const returned of returnExpressions(fn)) {
          out.push(...sqlTextGroups(returned, new Set(seen)));
        }
      }
      return out;
    }
    if (node?.type !== "Identifier") return [];
    const variable = resolve(node);
    if (variable === null || seen.has(variable)) return [];
    seen.add(variable);
    const out = [];
    const init = variable.defs?.[0]?.node?.init;
    if (init) out.push(...sqlTextGroups(init, seen));
    for (const ref of variable.references) {
      if (ref.writeExpr) out.push(...sqlTextGroups(ref.writeExpr, seen));
    }
    return out;
  };
}
