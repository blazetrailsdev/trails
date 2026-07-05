import { ArgumentError } from "./store.js";

// Mirrors Ruby `Integer(amount)` over the numeric domain: a finite number
// truncates toward zero (`Integer(1.5) # => 1`, `Integer(-1.9) # => -1`), while
// NaN/Infinity raise the way Ruby's `Integer(Float::NAN)`/`Integer(Float::INFINITY)`
// raise FloatDomainError — rather than silently coercing to a non-integer.
export function integer(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new ArgumentError(`invalid value for Integer(): ${amount}`);
  }
  return Math.trunc(amount);
}
