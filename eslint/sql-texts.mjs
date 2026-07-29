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
 */
export function createSqlTextGroups(resolve) {
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
