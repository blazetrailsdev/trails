import { Node, NodeVisitor } from "./node.js";
import { Binary } from "./binary.js";
import { As } from "./binary.js";
import { SqlLiteral } from "./sql-literal.js";
import { buildQuoted } from "./casted.js";
import { Ascending } from "./ascending.js";
import { Descending } from "./descending.js";
import type { Included } from "@blazetrails/activesupport";

/**
 * Represents a custom infix operation: left OP right.
 *
 * Mirrors: Arel::Nodes::InfixOperation
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class InfixOperation extends Binary {
  readonly operator: string;
  readonly left: Node;
  readonly right: Node;

  constructor(operator: string, left: Node, right: Node) {
    super(left, right);
    this.operator = operator;
    this.left = left;
    this.right = right;
  }

  /**
   * Mirrors: Arel::Predications#quoted_node. No type-cast context on an
   * InfixOperation — fall through to a plain Quoted wrap.
   *
   * @internal
   */
  quotedNode(other: unknown): Node {
    return buildQuoted(other, this);
  }

  as(aliasName: string): As {
    return new As(this, new SqlLiteral(aliasName, { retryable: true }));
  }

  asc(): Ascending {
    return new Ascending(this);
  }

  desc(): Descending {
    return new Descending(this);
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

/** PostgreSQL @> contains operator */
export class Contains extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("@>", left, right);
  }
}

/** PostgreSQL && overlaps operator */
export class Overlaps extends InfixOperation {
  constructor(left: Node, right: Node) {
    super("&&", left, right);
  }
}

// Declaration merging: tell TypeScript that InfixOperation instances carry
// the Predications + Math method surfaces mixed in from index.ts via
// `include()`. The runtime wiring lives there to avoid a circular module
// cycle between infix-operation.ts and math.ts.
// Inline `typeof import(...)` keeps the mixin modules out of this file's
// static import graph (math.ts imports InfixOperation for its class
// references; a static reverse import would cycle).
// See node-expression.ts for why these use the explicit module interfaces.
type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
type _OrderPredications = import("../order-predications.js").OrderPredicationsModule;
type _Expressions = import("../expressions.js").ExpressionsModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface InfixOperation
  extends
    Included<typeof import("../predications.js").Predications>,
    Included<typeof import("../math.js").Math>,
    _Expressions,
    _AliasPredication,
    _OrderPredications {}
