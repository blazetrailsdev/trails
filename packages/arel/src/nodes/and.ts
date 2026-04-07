import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";
import { Nary } from "./nary.js";

/**
 * AND node — represents a conjunction of children.
 *
 * Mirrors: Arel::Nodes::And (extends Nary)
 */
export class And extends Nary {
  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }
}
