import { rbObjClone, rbModConstSet } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";
import { buildQuoted } from "./casted.js";
import { Binary, type NodeOrValue } from "./binary.js";
import { Unary } from "./unary.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Case extends NodeExpression {
  case: Node | null;
  conditions: When[];
  default: Node | null;

  constructor(expression?: Node, defaultValue?: Node) {
    super();
    this.case = expression ?? null;
    this.conditions = [];
    this.default = defaultValue ?? null;
  }

  when(condition: Node | unknown, expression: NodeOrValue = null): this {
    this.conditions.push(new When(buildQuoted(condition), expression));
    return this;
  }

  then(onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown): void;
  then(expression: Node | unknown): this;

  then(expression: Node | unknown, onRejected?: unknown): this | void {
    if (typeof expression === "function" && typeof onRejected === "function") {
      (onRejected as (e: Error) => unknown)(
        new TypeError("Arel::Nodes::Case is not awaitable; use #toSql() to render"),
      );
      return;
    }
    this.conditions[this.conditions.length - 1].right = buildQuoted(expression);
    return this;
  }

  else(expression: Node | unknown): this {
    this.default = new Else(buildQuoted(expression));
    return this;
  }

  hash(): number {
    return rbHash([this.case, this.conditions, this.default]);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Case &&
      this.constructor === other.constructor &&
      rbEqual(this.case, other.case) &&
      rbEqual(this.conditions, other.conditions) &&
      rbEqual(this.default, other.default)
    );
  }

  initializeCopy(_other: Case): void {
    if (this.case != null) this.case = rbObjClone(this.case);
    this.conditions = this.conditions.map((x) => rbObjClone(x));
    if (this.default != null) this.default = rbObjClone(this.default);
  }
}

export class When extends Binary {}
export class Else extends Unary {}

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Case extends _AliasPredication {}

rbModConstSet(Nodes, "Case", Case);
rbModConstSet(Nodes, "When", When);
rbModConstSet(Nodes, "Else", Else);
