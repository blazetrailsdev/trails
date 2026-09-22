/**
 * Ruby's core `NilClass` method table — the methods `nil` answers
 * (`vendor/ruby/nilclass.rb`, `vendor/ruby/object.c:4415-4425`). JS `null`
 * carries no methods, so a caller that dispatches on `nil` (Rails'
 * `nil.respond_to?(:to_f)` in `delegation.rb:125`) reads them here.
 *
 * @noRailsEquivalent PERMANENT
 */
export const NilClass: Readonly<Record<string, (...args: unknown[]) => unknown>> = Object.freeze(
  Object.assign(Object.create(null) as object, {
    toI: () => 0,
    toF: () => 0.0,
    /** `vendor/ruby/object.c:4415` `rb_nil_to_s`. */
    toS: () => "",
    /** `vendor/ruby/object.c:4416` `nil_to_a`. */
    toA: () => [],
    /** `vendor/ruby/object.c:4417` `nil_to_h`. */
    toH: () => ({}),
    /** `vendor/ruby/object.c:4418` `nil_inspect`. */
    inspect: () => "nil",
    /** `vendor/ruby/object.c:4425` `NilClass#nil?`. */
    isNil: () => true,
  }),
);
