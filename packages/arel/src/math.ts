import type { Node } from "./nodes/node.js";
import {
  Addition,
  Subtraction,
  Multiplication,
  Division,
  BitwiseAnd,
  BitwiseOr,
  BitwiseXor,
  BitwiseShiftLeft,
  BitwiseShiftRight,
} from "./nodes/infix-operation.js";
import { Grouping } from "./nodes/grouping.js";
import { BitwiseNot } from "./nodes/unary-operation.js";
import type { NodeOrValue } from "./nodes/binary.js";

/**
 * Math — arithmetic mixin.
 *
 * Mirrors: Arel::Math (activerecord/lib/arel/math.rb). `+`/`-` and the
 * bitwise operators wrap in Grouping so precedence is preserved when the
 * result is further chained; `*` and `/` do not — same as Rails. The
 * right-hand operand is passed through raw (Rails does not pre-quote);
 * the visitor renders primitive values via `visitNodeOrValue`.
 */
export const Math = {
  add(this: Node, other: unknown): Grouping {
    return new Grouping(new Addition(this, other as NodeOrValue));
  },
  subtract(this: Node, other: unknown): Grouping {
    return new Grouping(new Subtraction(this, other as NodeOrValue));
  },
  multiply(this: Node, other: unknown): Multiplication {
    return new Multiplication(this, other as NodeOrValue);
  },
  divide(this: Node, other: unknown): Division {
    return new Division(this, other as NodeOrValue);
  },
  bitwiseAnd(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseAnd(this, other as NodeOrValue));
  },
  bitwiseOr(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseOr(this, other as NodeOrValue));
  },
  bitwiseXor(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseXor(this, other as NodeOrValue));
  },
  bitwiseShiftLeft(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseShiftLeft(this, other as NodeOrValue));
  },
  bitwiseShiftRight(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseShiftRight(this, other as NodeOrValue));
  },
  bitwiseNot(this: Node): BitwiseNot {
    return new BitwiseNot(this);
  },
};
