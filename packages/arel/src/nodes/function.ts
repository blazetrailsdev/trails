import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { SqlLiteral } from "./sql-literal.js";

// Rails: Arel::Nodes::Function includes WindowPredications and
// FilterPredications. Runtime mixin wiring lives in ../index.ts.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Function extends NodeExpression {
  readonly expressions: Node[];
  // Rails' `count(nil)` stores nil (expressions.rb:5-7), which `must_be_nil`
  // asserts on (attribute_test.rb:377-381), so nil is part of the domain.
  distinct: boolean | null;
  private _alias: Node | null;

  get alias(): Node | null {
    return this._alias;
  }

  set alias(value: Node | string | null) {
    this._alias = typeof value === "string" ? new SqlLiteral(value) : value;
  }

  constructor(expr: Node[], aliaz: Node | string | null = null) {
    super();
    this.expressions = expr;
    this._alias = typeof aliaz === "string" ? new SqlLiteral(aliaz) : aliaz;
    this.distinct = false;
  }

  as(aliaz: string): this {
    this.alias = aliaz;
    return this;
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
