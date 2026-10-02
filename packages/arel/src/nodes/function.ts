import { Nodes } from "../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import type { NodeOrValue } from "./binary.js";
import { NodeExpression } from "./node-expression.js";
import { SqlLiteral } from "./sql-literal.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Function extends NodeExpression {
  expressions: NodeOrValue[] | NodeOrValue;
  alias: Node | null;
  distinct: boolean | null;
  constructor(expr: NodeOrValue[] | NodeOrValue, aliaz: string | SqlLiteral | null = null) {
    super();
    this.expressions = expr;
    this.alias = aliaz == null ? null : new SqlLiteral(aliaz);
    this.distinct = false;
  }

  as(aliaz: string): this {
    this.alias = new SqlLiteral(aliaz);
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

rbModConstSet(Nodes, "Function", Function);
rbModConstSet(Nodes, "Exists", Exists);
rbModConstSet(Nodes, "Sum", Sum);
rbModConstSet(Nodes, "Max", Max);
rbModConstSet(Nodes, "Min", Min);
rbModConstSet(Nodes, "Avg", Avg);
