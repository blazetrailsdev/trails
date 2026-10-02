import { Nodes } from "../namespaces.js";
import { include } from "@blazetrails/activesupport";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Binary, type NodeOrValue } from "./binary.js";
import { Expressions, type ExpressionsModule } from "../expressions.js";
import { Predications, type PredicationsModule } from "../predications.js";
import { OrderPredications, type OrderPredicationsModule } from "../order-predications.js";
import { AliasPredication, type AliasPredicationModule } from "../alias-predication.js";
import { Math as MathMixin, type MathModule } from "../math.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class InfixOperation extends Binary {
  readonly operator: string;

  constructor(operator: string, left: NodeOrValue, right: NodeOrValue) {
    super(left, right);
    this.operator = operator;
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

include(InfixOperation, Expressions);
include(InfixOperation, Predications);
include(InfixOperation, OrderPredications);
include(InfixOperation, AliasPredication);
include(InfixOperation, MathMixin);

rbModConstSet(Nodes, "InfixOperation", InfixOperation);
rbModConstSet(Nodes, "BitwiseAnd", BitwiseAnd);
rbModConstSet(Nodes, "BitwiseOr", BitwiseOr);
rbModConstSet(Nodes, "BitwiseXor", BitwiseXor);
rbModConstSet(Nodes, "BitwiseShiftLeft", BitwiseShiftLeft);
rbModConstSet(Nodes, "BitwiseShiftRight", BitwiseShiftRight);
rbModConstSet(Nodes, "Addition", Addition);
rbModConstSet(Nodes, "Subtraction", Subtraction);
rbModConstSet(Nodes, "Multiplication", Multiplication);
rbModConstSet(Nodes, "Division", Division);
rbModConstSet(Nodes, "Concat", Concat);
rbModConstSet(Nodes, "Contains", Contains);
rbModConstSet(Nodes, "Overlaps", Overlaps);
