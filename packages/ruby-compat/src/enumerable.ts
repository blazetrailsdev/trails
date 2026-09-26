/**
 * Ruby's core `Enumerable` module (`vendor/ruby/v3.3.11/enum.c:5047` `Init_Enumerable`):
 * members derived from the including class's `each`, mixed in with
 * `include(Klass, Enumerable)`.
 *
 * Only the members a trails includer reaches are ported; the rest of
 * `Init_Enumerable` joins as a caller needs it.
 */

import { ArgumentError } from "./argument-error.js";

/** @noRailsEquivalent PERMANENT */
export interface Each<T> {
  each(block: (i: T) => void): unknown;
}

const iterBreak = Symbol("rb_iter_break");

function rbBlockCall<T>(obj: Each<T>, block: (i: T) => void): void {
  try {
    obj.each(block);
  } catch (e) {
    if (e !== iterBreak) throw e;
  }
}

/**
 * Mirrors: Ruby's Enumerable#map — `vendor/ruby/v3.3.11/enum.c:638` `enum_collect`.
 * @noRailsEquivalent PERMANENT
 */
function map<T, R>(this: Each<T>, block: (i: T) => R): R[] {
  const ary: R[] = [];
  rbBlockCall(this, (i) => {
    ary.push(block(i));
  });
  return ary;
}

/**
 * Mirrors: Ruby's Enumerable#first — `vendor/ruby/v3.3.11/enum.c:1284` `enum_first`,
 * whose `n` arm is `enum_take` (`:3514`).
 * @noRailsEquivalent PERMANENT
 */
function first<T>(this: Each<T>): T | null;
function first<T>(this: Each<T>, n: number): T[];
function first<T>(this: Each<T>, n?: number): T | null | T[] {
  if (n !== undefined) {
    if (n < 0) throw new ArgumentError("attempt to take negative size");
    const result: T[] = [];
    if (n === 0) return result;
    rbBlockCall(this, (i) => {
      result.push(i);
      if (result.length >= n) throw iterBreak;
    });
    return result;
  }
  let memo: T | null = null;
  rbBlockCall(this, (i) => {
    memo = i;
    throw iterBreak;
  });
  return memo;
}

/**
 * Mirrors: Ruby's Enumerable#any? — `vendor/ruby/v3.3.11/enum.c:1861` `enum_any`,
 * `RTEST`ing the block's result, or the element itself with no block.
 * @noRailsEquivalent PERMANENT
 */
function isAny<T>(this: Each<T>, block?: (i: T) => unknown): boolean {
  let memo = false;
  rbBlockCall(this, (i) => {
    const result = block ? block(i) : i;
    if (result != null && result !== false) {
      memo = true;
      throw iterBreak;
    }
  });
  return memo;
}

/** @noRailsEquivalent PERMANENT */
export const Enumerable = { map, first, isAny };
