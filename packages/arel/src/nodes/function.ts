import { Node, NodeVisitor } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { SqlLiteral } from "./sql-literal.js";

// Rails: Arel::Nodes::Function includes WindowPredications and
// FilterPredications. Runtime mixin wiring lives in ../index.ts.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Function extends NodeExpression {
  readonly expressions: Node[];
  alias: Node | null;
  distinct: boolean;

  constructor(expressions: Node[], alias: string | null = null) {
    super();
    this.expressions = expressions;
    this.alias = alias ? new SqlLiteral(alias) : null;
    this.distinct = false;
  }

  as(aliasName: string): this {
    this.alias = new SqlLiteral(aliasName);
    return this;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

export class Exists extends Node {
  readonly expressions: Node;
  readonly alias: Node | null;

  constructor(expressions: Node, alias: Node | null = null) {
    super();
    this.expressions = expressions;
    this.alias = alias;
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
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
