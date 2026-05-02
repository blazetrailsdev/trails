import { Node, NodeVisitor } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { SqlLiteral } from "./sql-literal.js";

// Rails: Arel::Nodes::Function includes WindowPredications and
// FilterPredications. Runtime mixin wiring lives in ../index.ts.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Function extends NodeExpression {
  readonly expressions: Node[];
  distinct: boolean;
  private _alias: Node | null;

  constructor(expressions: Node[], aliasNode: Node | string | null = null) {
    super();
    this.expressions = expressions;
    this._alias = typeof aliasNode === "string" ? new SqlLiteral(aliasNode) : aliasNode;
    this.distinct = false;
  }

  get alias(): Node | null {
    return this._alias;
  }

  set alias(value: Node | string | null) {
    this._alias = typeof value === "string" ? new SqlLiteral(value) : value;
  }

  as(aliasName: string): this {
    this.alias = aliasName;
    return this;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/**
 * Exists — EXISTS(subquery) node.
 *
 * Mirrors: Arel::Nodes::Exists (extends Function in Rails)
 */
export class Exists extends Function {
  constructor(expression: Node, aliasNode: Node | null = null) {
    super([expression], aliasNode);
  }
}

export class Sum extends Function {}
export class Max extends Function {}
export class Min extends Function {}
export class Avg extends Function {}

type _WindowPredications = import("../window-predications.js").WindowPredicationsModule;
type _FilterPredications = import("../filter-predications.js").FilterPredicationsModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Function extends _WindowPredications, _FilterPredications {}
