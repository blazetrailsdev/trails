/**
 * Mirrors: active_support/core_ext/numeric/bytes.rb
 *
 * Ruby reopens `Numeric`; TypeScript cannot, so the reopening is a class of the
 * Ruby name whose members take the receiver as the first parameter — the same
 * idiom `core-ext/object/blank.ts` uses for `NilClass`/`String`/`Time`.
 *
 * `EXABYTE` (1024**6) and `ZETTABYTE` (1024**7) exceed `Number.MAX_SAFE_INTEGER`,
 * so they — and any `exabytes`/`zettabytes` result — are the nearest double
 * rather than the exact value Ruby's arbitrary-precision `Integer` gives. The
 * return type stays `number` to match every other Numeric core_ext method; a
 * `bigint` port would not compose with them.
 */

export class Numeric {
  static readonly KILOBYTE = 1024;
  static readonly MEGABYTE = Numeric.KILOBYTE * 1024;
  static readonly GIGABYTE = Numeric.MEGABYTE * 1024;
  static readonly TERABYTE = Numeric.GIGABYTE * 1024;
  static readonly PETABYTE = Numeric.TERABYTE * 1024;
  static readonly EXABYTE = Numeric.PETABYTE * 1024;
  static readonly ZETTABYTE = Numeric.EXABYTE * 1024;

  /**
   * Enables the use of byte calculations and declarations, like 45.bytes + 2.6.megabytes
   *
   *   2.bytes # => 2
   */
  static bytes(self: number): number {
    return self;
  }

  /** Alias of {@link Numeric.bytes}. */
  static byte(self: number): number {
    return Numeric.bytes(self);
  }

  /**
   * Returns the number of bytes equivalent to the kilobytes provided.
   *
   *   2.kilobytes # => 2048
   */
  static kilobytes(self: number): number {
    return self * Numeric.KILOBYTE;
  }

  /** Alias of {@link Numeric.kilobytes}. */
  static kilobyte(self: number): number {
    return Numeric.kilobytes(self);
  }

  /**
   * Returns the number of bytes equivalent to the megabytes provided.
   *
   *   2.megabytes # => 2_097_152
   */
  static megabytes(self: number): number {
    return self * Numeric.MEGABYTE;
  }

  /** Alias of {@link Numeric.megabytes}. */
  static megabyte(self: number): number {
    return Numeric.megabytes(self);
  }

  /**
   * Returns the number of bytes equivalent to the gigabytes provided.
   *
   *   2.gigabytes # => 2_147_483_648
   */
  static gigabytes(self: number): number {
    return self * Numeric.GIGABYTE;
  }

  /** Alias of {@link Numeric.gigabytes}. */
  static gigabyte(self: number): number {
    return Numeric.gigabytes(self);
  }

  /**
   * Returns the number of bytes equivalent to the terabytes provided.
   *
   *   2.terabytes # => 2_199_023_255_552
   */
  static terabytes(self: number): number {
    return self * Numeric.TERABYTE;
  }

  /** Alias of {@link Numeric.terabytes}. */
  static terabyte(self: number): number {
    return Numeric.terabytes(self);
  }

  /**
   * Returns the number of bytes equivalent to the petabytes provided.
   *
   *   2.petabytes # => 2_251_799_813_685_248
   */
  static petabytes(self: number): number {
    return self * Numeric.PETABYTE;
  }

  /** Alias of {@link Numeric.petabytes}. */
  static petabyte(self: number): number {
    return Numeric.petabytes(self);
  }

  /**
   * Returns the number of bytes equivalent to the exabytes provided.
   *
   *   2.exabytes # => 2_305_843_009_213_693_952
   */
  static exabytes(self: number): number {
    return self * Numeric.EXABYTE;
  }

  /** Alias of {@link Numeric.exabytes}. */
  static exabyte(self: number): number {
    return Numeric.exabytes(self);
  }

  /**
   * Returns the number of bytes equivalent to the zettabytes provided.
   *
   *   2.zettabytes # => 2_361_183_241_434_822_606_848
   */
  static zettabytes(self: number): number {
    return self * Numeric.ZETTABYTE;
  }

  /** Alias of {@link Numeric.zettabytes}. */
  static zettabyte(self: number): number {
    return Numeric.zettabytes(self);
  }
}
