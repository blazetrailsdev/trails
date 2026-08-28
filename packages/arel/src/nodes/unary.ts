import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { _setNot } from "../node-slots.js";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Unary extends NodeExpression {
  expr: unknown;

  get value(): unknown {
    return this.expr;
  }

  constructor(expr: unknown) {
    super();
    this.expr = expr;
  }

  hash(): number {
    return rbHash(this.expr);
  }

  eql(other: unknown): boolean {
    return (
      other instanceof Unary &&
      this.constructor === other.constructor &&
      rbEqual(this.expr, other.expr)
    );
  }
}

export class Offset extends Unary {}
export class Limit extends Unary {}
export class Lock extends Unary {}
export class DistinctOn extends Unary {}
export class Bin extends Unary {}
export class On extends Unary {}

export class Not extends Unary {
  declare expr: Node;
  constructor(expr: Node) {
    super(expr);
  }
}

export class Lateral extends Unary {
  declare expr: Node;
  constructor(expr: Node) {
    super(expr);
  }
}

export class GroupingElement extends Unary {}
export class Cube extends Unary {}
export class RollUp extends Unary {}
export class GroupingSet extends Unary {}

export class Group extends Unary {}
export class OptimizerHints extends Unary {
  declare expr: ReadonlyArray<string | import("./sql-literal.js").SqlLiteral>;
}

_setNot(Not);

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Unary extends _AliasPredication {}
