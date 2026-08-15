/**
 * Mirrors: active_support/core_ext/array/access.rb
 *
 * Ruby reopens `Array`; TypeScript cannot, so the reopening is a class of the
 * Ruby name whose members take the receiver as the first parameter — the same
 * idiom `core-ext/object/blank.ts` uses for `NilClass`/`String`/`Time`.
 */

import { isBlank } from "../../string-utils.js";

export class Array {
  /**
   * Returns the tail of the array from +position+.
   *
   *   %w( a b c d ).from(0)  # => ["a", "b", "c", "d"]
   *   %w( a b c d ).from(2)  # => ["c", "d"]
   *   %w( a b c d ).from(10) # => []
   *   %w().from(0)           # => []
   *   %w( a b c d ).from(-2) # => ["c", "d"]
   *   %w( a b c ).from(-10)  # => []
   *
   * Ruby's `self[position, length] || []`: the two-arg slice is nil (→ `[]`)
   * for a start past the end, or a negative start that underflows the array.
   */
  static from<T>(self: T[], position: number): T[] {
    const start = position < 0 ? self.length + position : position;
    if (start < 0 || start > self.length) return [];
    return self.slice(start);
  }

  /**
   * Returns the beginning of the array up to +position+.
   *
   *   %w( a b c d ).to(0)  # => ["a"]
   *   %w( a b c d ).to(2)  # => ["a", "b", "c"]
   *   %w( a b c d ).to(10) # => ["a", "b", "c", "d"]
   *   %w().to(0)           # => []
   *   %w( a b c d ).to(-2) # => ["a", "b", "c"]
   *   %w( a b c ).to(-10)  # => []
   *
   * The negative arm is Ruby's `self[0..position]`: an inclusive range with a
   * negative end, which is empty once that end underflows the array.
   */
  static to<T>(self: T[], position: number): T[] {
    if (position >= 0) {
      return self.slice(0, position + 1);
    } else {
      const end = self.length + position;
      return end < 0 ? [] : self.slice(0, end + 1);
    }
  }

  /**
   * Returns a new array that includes the passed elements.
   *
   *   [ 1, 2, 3 ].including(4, 5) # => [ 1, 2, 3, 4, 5 ]
   *   [ [ 0, 1 ] ].including([ [ 1, 0 ] ]) # => [ [ 0, 1 ], [ 1, 0 ] ]
   */
  static including<T>(self: T[], ...elements: (T | T[])[]): T[] {
    return self.concat(elements.flat(1) as T[]);
  }

  /**
   * Returns a copy of the Array excluding the specified elements.
   *
   *   ["David", "Rafael", "Aaron", "Todd"].excluding("Aaron", "Todd") # => ["David", "Rafael"]
   *   [ [ 0, 1 ], [ 1, 0 ] ].excluding([ [ 1, 0 ] ]) # => [ [ 0, 1 ] ]
   *
   * Note: This is an optimization of `Enumerable#excluding` that uses `Array#-`
   * instead of `Array#reject` for performance reasons.
   */
  static excluding<T>(self: T[], ...elements: (T | T[])[]): T[] {
    const removed = elements.flat(1) as T[];
    return self.filter((element) => !removed.includes(element));
  }

  /** Alias of {@link Array.excluding}. */
  static without<T>(self: T[], ...elements: (T | T[])[]): T[] {
    return Array.excluding(self, ...elements);
  }

  /**
   * Equal to `self[1]`.
   *
   *   %w( a b c d e ).second # => "b"
   */
  static second<T>(self: T[]): T | undefined {
    return self[1];
  }

  /**
   * Equal to `self[2]`.
   *
   *   %w( a b c d e ).third # => "c"
   */
  static third<T>(self: T[]): T | undefined {
    return self[2];
  }

  /**
   * Equal to `self[3]`.
   *
   *   %w( a b c d e ).fourth # => "d"
   */
  static fourth<T>(self: T[]): T | undefined {
    return self[3];
  }

  /**
   * Equal to `self[4]`.
   *
   *   %w( a b c d e ).fifth # => "e"
   */
  static fifth<T>(self: T[]): T | undefined {
    return self[4];
  }

  /**
   * Equal to `self[41]`. Also known as accessing "the reddit".
   *
   *   (1..42).to_a.forty_two # => 42
   */
  static fortyTwo<T>(self: T[]): T | undefined {
    return self[41];
  }

  /**
   * Equal to `self[-3]`.
   *
   *   %w( a b c d e ).third_to_last # => "c"
   */
  static thirdToLast<T>(self: T[]): T | undefined {
    return self.at(-3);
  }

  /**
   * Equal to `self[-2]`.
   *
   *   %w( a b c d e ).second_to_last # => "d"
   */
  static secondToLast<T>(self: T[]): T | undefined {
    return self.at(-2);
  }

  /**
   * Removes all blank elements from the `Array` in place and returns self.
   *
   * Mirrors: `Array#compact_blank!` (`core_ext/enumerable.rb:263-266`) —
   * `delete_if(&:blank?)`, which Rails uses rather than `reject!` because it
   * always returns self even if nothing changed.
   */
  static compactBlankBang<T>(self: T[]): T[] {
    for (let i = self.length - 1; i >= 0; i--) {
      if (isBlank(self[i])) self.splice(i, 1);
    }
    return self;
  }
}
