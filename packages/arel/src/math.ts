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
 * the visitor renders primitive values via `visit` class dispatch.
 *
 * The operand is typed `NodeOrValue` — the union of exactly what a Rails
 * node slot admits. Ruby's `Arel::Math#*` is untyped only because Ruby has
 * no types; here the union is the faithful encoding, and typing the
 * parameter with it (rather than `unknown` + a cast) makes it load-bearing:
 * a caller that cannot produce a `NodeOrValue` is a finding, not a widen.
 */
export const Math = {
  add(this: Node, other: NodeOrValue): Grouping {
    return new Grouping(new Addition(this, other));
  },
  subtract(this: Node, other: NodeOrValue): Grouping {
    return new Grouping(new Subtraction(this, other));
  },
  multiply(this: Node, other: NodeOrValue): Multiplication {
    return new Multiplication(this, other);
  },
  divide(this: Node, other: NodeOrValue): Division {
    return new Division(this, other);
  },
  bitwiseAnd(this: Node, other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseAnd(this, other));
  },
  bitwiseOr(this: Node, other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseOr(this, other));
  },
  bitwiseXor(this: Node, other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseXor(this, other));
  },
  bitwiseShiftLeft(this: Node, other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseShiftLeft(this, other));
  },
  bitwiseShiftRight(this: Node, other: NodeOrValue): Grouping {
    return new Grouping(new BitwiseShiftRight(this, other));
  },
  bitwiseNot(this: Node): BitwiseNot {
    return new BitwiseNot(this);
  },
};
