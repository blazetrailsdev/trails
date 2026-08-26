import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { BindError } from "../errors.js";
import { Fragments } from "./fragments.js";

/**
 * BoundSqlLiteral — a SQL literal with bind parameters.
 *
 * Supports positional (`?`) and named (`:name`) placeholders.
 *
 * Mirrors: Arel::Nodes::BoundSqlLiteral
 */
export class BoundSqlLiteral extends NodeExpression {
  readonly sqlWithPlaceholders: string;
  // Mirrors bound_sql_literal.rb:31-38 — exactly one collection is kept; the
  // unused side is nil, which is what `visit_Arel_Nodes_BoundSqlLiteral`
  // branches on (to_sql.rb:799).
  readonly positionalBinds: unknown[] | null;
  readonly namedBinds: Record<string, unknown> | null;

  /**
   * Mirrors: bound_sql_literal.rb:8-40 — `initialize`, whose named-bind arm
   * dedupes both token lists (`.uniq`, :20-21).
   *
   * @missingRailsCall uniq — PERMANENT: Language shortcoming: Ruby's
   * `Array#uniq` has no JS function to call; `[...new Set(...)]` IS the
   * dedupe, spelled with the language's own primitive.
   */
  constructor(
    sqlWithPlaceholders: string,
    positionalBinds: unknown[] | null,
    namedBinds: Record<string, unknown> | null,
  ) {
    super();
    const hasPositional = !(positionalBinds == null || positionalBinds.length === 0);
    const hasNamed = !(namedBinds == null || Object.keys(namedBinds).length === 0);

    if (hasPositional) {
      if (hasNamed) {
        throw new BindError(`cannot mix positional and named binds`, sqlWithPlaceholders);
      }
      const expected = (sqlWithPlaceholders.match(/\?/g) ?? []).length;
      if (positionalBinds.length !== expected) {
        throw new BindError(
          `wrong number of bind variables (${positionalBinds.length} for ${expected})`,
          sqlWithPlaceholders,
        );
      }
    } else if (hasNamed) {
      // Deduplicate tokens (matches Rails `.uniq`) before checking for missing binds.
      const tokensInString = [
        ...new Set([...sqlWithPlaceholders.matchAll(/:(?<!::)([a-zA-Z]\w*)/g)].map((m) => m[1])),
      ];
      const missing = tokensInString.filter((t) => !(t in namedBinds));
      if (missing.length > 0) {
        if (missing.length === 1) {
          throw new BindError(`missing value for :${missing[0]}`, sqlWithPlaceholders);
        } else {
          throw new BindError(`missing values for ${JSON.stringify(missing)}`, sqlWithPlaceholders);
        }
      }
    }

    this.sqlWithPlaceholders = sqlWithPlaceholders;
    if (hasPositional) {
      this.positionalBinds = positionalBinds;
      this.namedBinds = null;
    } else {
      this.positionalBinds = null;
      this.namedBinds = namedBinds;
    }
  }

  // Mirrors Arel::Nodes::BoundSqlLiteral#+ — concatenates with another
  // Arel node by wrapping both in a Fragments node. Method-renamed to
  // `plus` because TS classes can't define an arithmetic operator.
  // Rails: `raise ArgumentError, "Expected Arel node" unless Arel.arel_node?(other)`.
  // Param widened to `unknown` so the runtime guard is reachable from typed
  // callers too (matches Rails' runtime-validation intent).
  plus(other: unknown): Fragments {
    if (!(other instanceof Node)) {
      throw new TypeError("Expected Arel node");
    }
    return new Fragments([this, other]);
  }
}
