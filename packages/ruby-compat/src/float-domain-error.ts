/**
 * Ruby's core `FloatDomainError` (`vendor/ruby/numeric.c:6155`
 * `rb_define_class("FloatDomainError", rb_eRangeError)`), a `RangeError`
 * subclass — what `rb_num2int` / `Integer()` and `float_decode_internal`
 * (`vendor/ruby/rational.c:2491`) raise for a non-finite Float, with the
 * Float's own `to_s` as the message: `Integer(Float::INFINITY)` is
 * `FloatDomainError: Infinity`.
 *
 * It extends the JS `RangeError` rather than a ruby-compat `RangeError` seat
 * because Rails declares `RangeError` itself twice
 * (`activemodel/lib/active_model/errors.rb:523`,
 * `activerecord/lib/active_record/errors.rb:301`), so that name is not
 * Ruby-core surface this package owns.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `FloatDomainError`, which Rails
 * inherits rather than defines.
 */
export class FloatDomainError extends globalThis.RangeError {
  constructor(message: string) {
    super(message);
    this.name = "FloatDomainError";
  }
}
