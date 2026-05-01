import { NodeVisitor } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { BindError } from "../errors.js";

/**
 * BoundSqlLiteral — a SQL literal with bind parameters.
 *
 * Supports positional (`?`) and named (`:name`) placeholders.
 *
 * Mirrors: Arel::Nodes::BoundSqlLiteral
 */
export class BoundSqlLiteral extends NodeExpression {
  readonly sqlWithPlaceholders: string;
  readonly positionalBinds: unknown[];
  readonly namedBinds: Record<string, unknown>;

  constructor(
    sqlWithPlaceholders: string,
    positionalBinds: unknown[] = [],
    namedBinds: Record<string, unknown> = {},
  ) {
    super();
    this.sqlWithPlaceholders = sqlWithPlaceholders;
    this.positionalBinds = positionalBinds;
    this.namedBinds = namedBinds;
    this.validate();
  }

  private validate(): void {
    const sql = this.sqlWithPlaceholders;
    const hasPositional = this.positionalBinds.length > 0;
    const hasNamed = Object.keys(this.namedBinds).length > 0;

    if (hasPositional && hasNamed) {
      throw new BindError(`cannot mix positional and named binds`, sql);
    }

    if (hasPositional) {
      const expected = (sql.match(/\?/g) ?? []).length;
      if (this.positionalBinds.length !== expected) {
        throw new BindError(
          `wrong number of bind variables (${this.positionalBinds.length} for ${expected})`,
          sql,
        );
      }
    }

    if (hasNamed) {
      // Deduplicate tokens (matches Rails `.uniq`) before checking for missing binds.
      const tokens = [...new Set([...sql.matchAll(/:(?<!::)([a-zA-Z]\w*)/g)].map((m) => m[1]))];
      const missing = tokens.filter((t) => !(t in this.namedBinds));
      if (missing.length === 1) {
        throw new BindError(`missing value for :${missing[0]}`, sql);
      } else if (missing.length > 1) {
        throw new BindError(`missing values for ${JSON.stringify(missing)}`, sql);
      }
    }
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}
