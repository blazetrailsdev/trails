import { Node } from "./node.js";
import { Unary } from "./unary.js";
import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";

/**
 * Represents EXTRACT(field FROM expr).
 *
 * Mirrors: Arel::Nodes::Extract (extends Unary)
 */
export class Extract extends Unary {
  readonly field: string;

  constructor(expr: Node, field: string) {
    super(expr);
    this.field = field;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }
}
