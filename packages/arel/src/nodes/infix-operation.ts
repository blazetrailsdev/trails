import { Nodes } from "../namespaces.js";
import { rbSetClassPathString } from "@blazetrails/ruby-compat";
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

rbSetClassPathString(InfixOperation, Nodes, "InfixOperation");
Nodes.InfixOperation = InfixOperation;
rbSetClassPathString(BitwiseAnd, Nodes, "BitwiseAnd");
Nodes.BitwiseAnd = BitwiseAnd;
rbSetClassPathString(BitwiseOr, Nodes, "BitwiseOr");
Nodes.BitwiseOr = BitwiseOr;
rbSetClassPathString(BitwiseXor, Nodes, "BitwiseXor");
Nodes.BitwiseXor = BitwiseXor;
rbSetClassPathString(BitwiseShiftLeft, Nodes, "BitwiseShiftLeft");
Nodes.BitwiseShiftLeft = BitwiseShiftLeft;
rbSetClassPathString(BitwiseShiftRight, Nodes, "BitwiseShiftRight");
Nodes.BitwiseShiftRight = BitwiseShiftRight;
rbSetClassPathString(Addition, Nodes, "Addition");
Nodes.Addition = Addition;
rbSetClassPathString(Subtraction, Nodes, "Subtraction");
Nodes.Subtraction = Subtraction;
rbSetClassPathString(Multiplication, Nodes, "Multiplication");
Nodes.Multiplication = Multiplication;
rbSetClassPathString(Division, Nodes, "Division");
Nodes.Division = Division;
rbSetClassPathString(Concat, Nodes, "Concat");
Nodes.Concat = Concat;
rbSetClassPathString(Contains, Nodes, "Contains");
Nodes.Contains = Contains;
rbSetClassPathString(Overlaps, Nodes, "Overlaps");
Nodes.Overlaps = Overlaps;
