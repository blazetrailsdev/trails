import { rbEqual, rbHash } from "@blazetrails/activesupport";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
import { Nodes } from "../namespaces.js";
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

rbSetClassPathString(Not, Nodes, "Not");
Nodes.Not = Not;

type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface Unary extends _AliasPredication {}

rbSetClassPathString(Unary, Nodes, "Unary");
Nodes.Unary = Unary;
rbSetClassPathString(Offset, Nodes, "Offset");
Nodes.Offset = Offset;
rbSetClassPathString(Limit, Nodes, "Limit");
Nodes.Limit = Limit;
rbSetClassPathString(Lock, Nodes, "Lock");
Nodes.Lock = Lock;
rbSetClassPathString(DistinctOn, Nodes, "DistinctOn");
Nodes.DistinctOn = DistinctOn;
rbSetClassPathString(Bin, Nodes, "Bin");
Nodes.Bin = Bin;
rbSetClassPathString(On, Nodes, "On");
Nodes.On = On;
rbSetClassPathString(Lateral, Nodes, "Lateral");
Nodes.Lateral = Lateral;
rbSetClassPathString(GroupingElement, Nodes, "GroupingElement");
Nodes.GroupingElement = GroupingElement;
rbSetClassPathString(Cube, Nodes, "Cube");
Nodes.Cube = Cube;
rbSetClassPathString(GroupingSet, Nodes, "GroupingSet");
Nodes.GroupingSet = GroupingSet;
rbSetClassPathString(Group, Nodes, "Group");
Nodes.Group = Group;
rbSetClassPathString(OptimizerHints, Nodes, "OptimizerHints");
Nodes.OptimizerHints = OptimizerHints;
rbSetClassPathString(RollUp, Nodes, "RollUp");
Nodes.RollUp = RollUp;
