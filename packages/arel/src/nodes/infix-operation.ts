import { Nodes } from "../namespaces.js";
import { Binary, type NodeOrValue } from "./binary.js";
import type { PredicationsModule } from "../predications.js";
import type { MathModule } from "../math.js";
import type { AliasPredicationModule } from "../alias-predication.js";
import type { OrderPredicationsModule } from "../order-predications.js";
import type { ExpressionsModule } from "../expressions.js";

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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface InfixOperation
  extends
    PredicationsModule,
    MathModule,
    ExpressionsModule,
    AliasPredicationModule,
    OrderPredicationsModule {}

Nodes.InfixOperation = InfixOperation;
Nodes.BitwiseAnd = BitwiseAnd;
Nodes.BitwiseOr = BitwiseOr;
Nodes.BitwiseXor = BitwiseXor;
Nodes.BitwiseShiftLeft = BitwiseShiftLeft;
Nodes.BitwiseShiftRight = BitwiseShiftRight;
Nodes.Addition = Addition;
Nodes.Subtraction = Subtraction;
Nodes.Multiplication = Multiplication;
Nodes.Division = Division;
Nodes.Concat = Concat;
Nodes.Contains = Contains;
Nodes.Overlaps = Overlaps;
