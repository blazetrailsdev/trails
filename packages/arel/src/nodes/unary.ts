import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
import { Node } from "./node.js";
import { NodeExpression } from "./node-expression.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Unary<E = unknown> extends NodeExpression {
  get value(): E {
    return this.expr;
  }

  constructor(expr: E) {
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

export class Bin extends Unary {}
export class Cube extends Unary {}
export class DistinctOn extends Unary {}
export class Group extends Unary {}
export class GroupingElement extends Unary {}
export class GroupingSet extends Unary {}

export class Lateral extends Unary {
  declare expr: Node;
  constructor(expr: Node) {
    super(expr);
  }
}

export class Limit extends Unary {}

export class Lock extends Unary {}
export class Not extends Unary {
  declare expr: Node;
  constructor(expr: Node) {
    super(expr);
  }
}
export class Offset extends Unary {}
export class On extends Unary {}

export class OptimizerHints extends Unary {
  declare expr: ReadonlyArray<string | import("./sql-literal.js").SqlLiteral>;
}
export class RollUp extends Unary {}

rbModConstSet(Nodes, "Not", Not);

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
export interface Unary<E = unknown> extends _AliasPredication {
  expr: E;
}

rbModConstSet(Nodes, "Unary", Unary);
rbModConstSet(Nodes, "Offset", Offset);
rbModConstSet(Nodes, "Limit", Limit);
rbModConstSet(Nodes, "Lock", Lock);
rbModConstSet(Nodes, "DistinctOn", DistinctOn);
rbModConstSet(Nodes, "Bin", Bin);
rbModConstSet(Nodes, "On", On);
rbModConstSet(Nodes, "Lateral", Lateral);
rbModConstSet(Nodes, "GroupingElement", GroupingElement);
rbModConstSet(Nodes, "Cube", Cube);
rbModConstSet(Nodes, "GroupingSet", GroupingSet);
rbModConstSet(Nodes, "Group", Group);
rbModConstSet(Nodes, "OptimizerHints", OptimizerHints);
rbModConstSet(Nodes, "RollUp", RollUp);
