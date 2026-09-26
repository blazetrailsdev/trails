import { RangeError } from "./range-error.js";

/**
 * Ruby's core `FloatDomainError` (`vendor/ruby/numeric.c:6155`
 * `rb_define_class("FloatDomainError", rb_eRangeError)`), a `RangeError`
 * subclass — what `rb_num2int` / `Integer()` and `float_decode_internal`
 * (`vendor/ruby/rational.c:2491`) raise for a non-finite Float, with the
 * Float's own `to_s` as the message: `Integer(Float::INFINITY)` is
 * `FloatDomainError: Infinity`.
 *
 * Ruby's chain is `FloatDomainError < RangeError < StandardError`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `FloatDomainError`, which Rails
 * inherits rather than defines.
 */
export class FloatDomainError extends RangeError {}

FloatDomainError.prototype.name = "FloatDomainError";
