import type { Node } from "./nodes/node.js";
import type { Multiplication, Division } from "./nodes/infix-operation.js";
import type { Grouping } from "./nodes/grouping.js";
import type { BitwiseNot } from "./nodes/unary-operation.js";
import { Nodes } from "./namespaces.js";
import type { NodeOrValue } from "./nodes/binary.js";

export interface MathModule {
  multiply(other: NodeOrValue): Multiplication;
  add(other: NodeOrValue): Grouping;
  subtract(other: NodeOrValue): Grouping;
  divide(other: NodeOrValue): Division;
  bitwiseAnd(other: NodeOrValue): Grouping;
  bitwiseOr(other: NodeOrValue): Grouping;
  bitwiseXor(other: NodeOrValue): Grouping;
  bitwiseShiftLeft(other: NodeOrValue): Grouping;
  bitwiseShiftRight(other: NodeOrValue): Grouping;
  bitwiseNot(): BitwiseNot;
}

export const Math: MathModule = {
  multiply(this: Node, other: NodeOrValue): Multiplication {
    return new Nodes.Multiplication(this, other);
  },
  add(this: Node, other: NodeOrValue): Grouping {
    return new Nodes.Grouping(new Nodes.Addition(this, other));
  },
  subtract(this: Node, other: NodeOrValue): Grouping {
    return new Nodes.Grouping(new Nodes.Subtraction(this, other));
  },
  divide(this: Node, other: NodeOrValue): Division {
    return new Nodes.Division(this, other);
  },
  bitwiseAnd(this: Node, other: NodeOrValue): Grouping {
    return new Nodes.Grouping(new Nodes.BitwiseAnd(this, other));
  },
  bitwiseOr(this: Node, other: NodeOrValue): Grouping {
    return new Nodes.Grouping(new Nodes.BitwiseOr(this, other));
  },
  bitwiseXor(this: Node, other: NodeOrValue): Grouping {
    return new Nodes.Grouping(new Nodes.BitwiseXor(this, other));
  },
  bitwiseShiftLeft(this: Node, other: NodeOrValue): Grouping {
    return new Nodes.Grouping(new Nodes.BitwiseShiftLeft(this, other));
  },
  bitwiseShiftRight(this: Node, other: NodeOrValue): Grouping {
    return new Nodes.Grouping(new Nodes.BitwiseShiftRight(this, other));
  },
  bitwiseNot(this: Node): BitwiseNot {
    return new Nodes.BitwiseNot(this);
  },
};
