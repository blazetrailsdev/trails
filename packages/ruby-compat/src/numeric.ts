import { FloatDomainError } from "./float-domain-error.js";
import { NilClass } from "./nil-class.js";
import { NoMethodError } from "./no-method-error.js";
import { rbObjClass } from "./object.js";
import { rbStrToI } from "./string/convert.js";

/**
 * Ruby `Float#round` (`vendor/ruby/numeric.c:2505` `flo_round`): rounds to
 * `ndigits` decimal places, half away from zero — which is where JS
 * `Math.round` differs, rounding `-0.5` up to `-0` where Ruby answers `-1`.
 * @noRailsEquivalent PERMANENT — Ruby core `Float#round` (`vendor/ruby/numeric.c:2505`).
 */
export function round(x: number, ndigits = 0): number {
  const f = 10 ** ndigits;
  const scaled = x * f;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return ndigits === 0 ? rounded : rounded / f;
}

/**
 * Ruby `Integer#anybits?` (`vendor/ruby/numeric.c:3647` `int_anybits_p`):
 * whether any of `mask`'s set bits are set in `self`.
 *
 * Taken over BigInt rather than JS `&`, which truncates both operands to signed
 * 32 bits: `rb_int_and` is arbitrary-precision, so `(2**40).anybits?(2**40)` is
 * true in Ruby and false under `&`. BigInt's bitwise operators read a value as
 * two's complement of unbounded width, which is the notation
 * `vendor/ruby/spec/ruby/core/integer/anybits_spec.rb:15-20` pins for negative
 * receivers and the bignum cases at `:9-12`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Integer#anybits?` (`vendor/ruby/numeric.c:3647`).
 */
export function anybits(x: number | bigint, mask: number | bigint): boolean {
  return (BigInt(x) & BigInt(mask)) !== 0n;
}

/**
 * Ruby's `obj.to_i` send, dispatched on the receiver's class: `NilClass#to_i`
 * (`vendor/ruby/object.c:4414`), `Integer#to_i` (`vendor/ruby/numeric.c`
 * `int_to_i`), `Float#to_i` (`flo_to_i`, `FloatDomainError` off the finite
 * range), `String#to_i` (`rb_str_to_i`, {@link rbStrToI}), else the
 * receiver's own `toI`.
 *
 * @noRailsEquivalent PERMANENT — a Ruby method send, which JS has no receiver
 * for on a primitive.
 */
export function toI(obj: unknown): number | bigint {
  if (obj == null) return NilClass.toI() as number;
  if (typeof obj === "bigint") return obj;
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) throw new FloatDomainError(String(obj));
    return Math.trunc(obj);
  }
  if (typeof obj === "string") return rbStrToI(obj);
  if (typeof (obj as { toI?: unknown }).toI === "function") {
    return (obj as { toI(): number | bigint }).toI();
  }
  throw new NoMethodError(`undefined method 'to_i' for an instance of ${rbObjClass(obj)}`);
}
