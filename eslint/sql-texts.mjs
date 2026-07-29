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
 * substitutions sat — enough to read a `LIKE` filter or a catalogue name out of
 * it, not enough to decide whether a name at a quasi boundary is complete.
 */
export function createSqlTexts(resolve) {
  return function sqlTexts(node, seen = new Set()) {
    if (node?.type === "Literal") return typeof node.value === "string" ? [node.value] : [];
    if (node?.type === "TemplateLiteral")
      return [node.quasis.map((q) => q.value.cooked ?? "").join(" ")];
    if (node?.type !== "Identifier") return [];
    const variable = resolve(node);
    if (variable === null || seen.has(variable)) return [];
    seen.add(variable);
    const out = [];
    const init = variable.defs?.[0]?.node?.init;
    if (init) out.push(...sqlTexts(init, seen));
    for (const ref of variable.references) {
      if (ref.writeExpr) out.push(...sqlTexts(ref.writeExpr, seen));
    }
    return out;
  };
}
