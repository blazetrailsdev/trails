/**
 * Mirrors: active_support/core_ext/integer/multiple.rb
 *
 * Ruby reopens `Integer`; TypeScript cannot, so the reopening is a class of the
 * Ruby name whose members take the receiver as the first parameter — the same
 * idiom `core-ext/numeric/bytes.ts` uses for `Numeric`.
 */

export class Integer {
  /**
   * Check whether the integer is evenly divisible by the argument.
   *
   *   0.multiple_of?(0)  # => true
   *   6.multiple_of?(5)  # => false
   *   10.multiple_of?(2) # => true
   *
   * Ruby's `Integer` is arbitrary-precision, so the receiver can exceed
   * `Number.MAX_SAFE_INTEGER` — where a `number` `%` would answer from a
   * rounded double. `bigint` is that arm.
   */
  static isMultipleOf(self: number, number: number): boolean;
  static isMultipleOf(self: bigint, number: bigint | number): boolean;
  static isMultipleOf(self: number | bigint, number: number | bigint): boolean {
    if (typeof self === "bigint" || typeof number === "bigint") {
      const selfBig = BigInt(self);
      const numberBig = BigInt(number);
      return numberBig === 0n ? selfBig === 0n : selfBig % numberBig === 0n;
    }
    return number === 0 ? self === 0 : self % number === 0;
  }
}
