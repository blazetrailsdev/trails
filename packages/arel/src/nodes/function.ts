import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import type { NodeOrValue } from "./binary.js";
import { NodeExpression } from "./node-expression.js";
import { SqlLiteral } from "./sql-literal.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Function extends NodeExpression {
  expressions: NodeOrValue[] | NodeOrValue;
  distinct: boolean | null;
  private _alias: Node | null;

  get alias(): Node | null {
    return this._alias;
  }

  set alias(value: Node | string | null) {
    this._alias = typeof value === "string" ? new SqlLiteral(value) : value;
  }

  constructor(expr: NodeOrValue[] | NodeOrValue, aliaz: Node | string | null = null) {
    super();
    this.expressions = expr;
    this._alias = typeof aliaz === "string" ? new SqlLiteral(aliaz) : aliaz;
    this.distinct = false;
  }

  as(aliaz: string): this {
    this.alias = aliaz;
    return this;
  }

  hash(): number {
    return rbHash([this.expressions, this.alias, this.distinct]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Function &&
      this.constructor === other.constructor &&
      rbEqual(this.expressions, other.expressions) &&
      rbEqual(this.alias, other.alias) &&
      rbEqual(this.distinct, other.distinct)
    );
  }
}

export class Sum extends Function {}

export class Exists extends Function {}

export class Max extends Function {}
export class Min extends Function {}
export class Avg extends Function {}

type _WindowPredications = import("../window-predications.js").WindowPredicationsModule;
type _FilterPredications = import("../filter-predications.js").FilterPredicationsModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Function extends _WindowPredications, _FilterPredications {}
