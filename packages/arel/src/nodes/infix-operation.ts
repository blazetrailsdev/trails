import { Node, NodeVisitor } from "./node.js";
import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";

/**
 * Represents a custom infix operation: left OP right.
 *
 * Mirrors: Arel::Nodes::InfixOperation
 */
export class InfixOperation extends Node {
  readonly operator: string;
  readonly left: Node;
  readonly right: Node;

  constructor(operator: string, left: Node, right: Node) {
    super();
    this.operator = operator;
    this.left = left;
    this.right = right;
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName));
  }

  accept<T>(visitor: NodeVisitor<T>): T {
    return visitor.visit(this);
  }
}

/** Bitwise AND: left & right */
export class BitwiseAnd extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("&", left, right);
  }
}

/** Bitwise OR: left | right */
export class BitwiseOr extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("|", left, right);
  }
}

/** Bitwise XOR: left ^ right */
export class BitwiseXor extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("^", left, right);
  }
}

/** Bitwise Shift Left: left << right */
export class BitwiseShiftLeft extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("<<", left, right);
  }
}

/** Bitwise Shift Right: left >> right */
export class BitwiseShiftRight extends InfixOperation {
  constructor(left: Node, right: Node) {
    super(">>", left, right);
  }
}

/** Math operations — these live here to match Rails infix_operation.rb */
export class Addition extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("+", left, right);
  }
}

export class Subtraction extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("-", left, right);
  }
}

export class Multiplication extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("*", left, right);
  }
}

export class Division extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("/", left, right);
  }
}

/** String concatenation: left || right */
export class Concat extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("||", left, right);
  }
}
