import { Node } from "./node.js";
import { Binary, type NodeOrValue } from "./binary.js";
import { buildQuoted } from "./casted.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class InfixOperation extends Binary {
  readonly operator: string;
  left: NodeOrValue;
  right: NodeOrValue;

  constructor(operator: string, left: NodeOrValue, right: NodeOrValue) {
    super(left, right);
    this.operator = operator;
    this.left = left;
    this.right = right;
  }

  /** @internal */
  quotedNode(other: unknown): Node {
    return buildQuoted(other, this);
  }
}

export class Multiplication extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("*", left, right);
  }
}

export class Division extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("/", left, right);
  }
}

export class Addition extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("+", left, right);
  }
}

export class Subtraction extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("-", left, right);
  }
}

export class Concat extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("||", left, right);
  }
}

export class Contains extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("@>", left, right);
  }
}

export class Overlaps extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("&&", left, right);
  }
}

export class BitwiseAnd extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("&", left, right);
  }
}

export class BitwiseOr extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("|", left, right);
  }
}

export class BitwiseXor extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("^", left, right);
  }
}

export class BitwiseShiftLeft extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super("<<", left, right);
  }
}

export class BitwiseShiftRight extends InfixOperation {
  constructor(left: NodeOrValue, right: NodeOrValue) {
    super(">>", left, right);
  }
}

/**
 * Declaration merging: tell TypeScript that InfixOperation instances carry
 * the Predications + Math method surfaces mixed in from index.ts via
 * `include()`. The runtime wiring lives there to avoid a circular module
 * cycle between infix-operation.ts and math.ts.
 * Inline `typeof import(...)` keeps the mixin modules out of this file's
 * static import graph (math.ts imports InfixOperation for its class
 * references; a static reverse import would cycle).
 * See node-expression.ts for why these use the explicit module interfaces.
 *
 * @noRailsEquivalent TypeScript-only mixin typing; Ruby `include` needs no type surface.
 */
type _Predications = import("../predications.js").PredicationsModule;
type _Math = import("../math.js").MathModule;
type _AliasPredication = import("../alias-predication.js").AliasPredicationModule;
type _OrderPredications = import("../order-predications.js").OrderPredicationsModule;
type _Expressions = import("../expressions.js").ExpressionsModule;
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface InfixOperation
  extends _Predications, _Math, _Expressions, _AliasPredication, _OrderPredications {}
