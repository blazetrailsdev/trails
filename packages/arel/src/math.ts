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
import { buildQuoted } from "./nodes/casted.js";

/**
 * Math — arithmetic mixin.
 *
 * Mirrors: Arel::Math (activerecord/lib/arel/math.rb). `+` and `-` wrap
 * in Grouping so precedence is preserved when the result is further
 * chained (`a + b - c` becomes `(a + b) - c` via nested Groupings);
 * `*` and `/` do not — same as Rails.
 */
export const Math = {
  add(this: Node, other: unknown): Grouping {
    return new Grouping(new Addition(this, buildQuoted(other)));
  },
  subtract(this: Node, other: unknown): Grouping {
    return new Grouping(new Subtraction(this, buildQuoted(other)));
  },
  multiply(this: Node, other: unknown): Multiplication {
    return new Multiplication(this, buildQuoted(other));
  },
  divide(this: Node, other: unknown): Division {
    return new Division(this, buildQuoted(other));
  },
  bitwiseAnd(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseAnd(this, buildQuoted(other)));
  },
  bitwiseOr(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseOr(this, buildQuoted(other)));
  },
  bitwiseXor(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseXor(this, buildQuoted(other)));
  },
  bitwiseShiftLeft(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseShiftLeft(this, buildQuoted(other)));
  },
  bitwiseShiftRight(this: Node, other: unknown): Grouping {
    return new Grouping(new BitwiseShiftRight(this, buildQuoted(other)));
  },
};
