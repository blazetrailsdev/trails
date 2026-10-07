/**
 * Ruby's core `Enumerable` module (`vendor/ruby/v3.3.11/enum.c:5047` `Init_Enumerable`):
 * members derived from the including class's `each`, mixed in with
 * `include(Klass, Enumerable)`.
 *
 * Only the members a trails includer reaches are ported; the rest of
 * `Init_Enumerable` joins as a caller needs it.
 */

import { ArgumentError } from "./argument-error.js";
import { rbEqual } from "./rb-equal.js";

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
 * Mirrors: Ruby's Enumerable#find_all — `vendor/ruby/v3.3.11/enum.c:509` `enum_find_all`,
 * pushing each element whose block result `RTEST`s (`find_all_i`, `:456`).
 * @noRailsEquivalent PERMANENT
 */
function findAll<T>(this: Each<T>, block: (i: T) => unknown): T[] {
  const ary: T[] = [];
  rbBlockCall(this, (i) => {
    const result = block(i);
    if (result != null && result !== false) ary.push(i);
  });
  return ary;
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
 * Mirrors: Ruby's Enumerable#drop — `vendor/ruby/v3.3.11/enum.c:3603` `enum_drop`, whose
 * `drop_i` (`:3571`) counts `n` elements down before it pushes.
 * @noRailsEquivalent PERMANENT
 */
function drop<T>(this: Each<T>, n: number): T[] {
  let len = n;

  if (len < 0) {
    throw new ArgumentError("attempt to drop negative size");
  }

  const result: T[] = [];
  rbBlockCall(this, (i) => {
    if (len === 0) {
      result.push(i);
    } else {
      len--;
    }
  });
  return result;
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

/**
 * Mirrors: Ruby's Enumerable#include? — `vendor/ruby/v3.3.11/enum.c:2921` `enum_member`,
 * whose `member_i` (`:2892`) asks `rb_equal(element, val)` and breaks on the first hit.
 * @noRailsEquivalent PERMANENT
 */
function isInclude<T>(this: Each<T>, val: unknown): boolean {
  let memo = false;
  rbBlockCall(this, (i) => {
    if (rbEqual(i, val)) {
      memo = true;
      throw iterBreak;
    }
  });
  return memo;
}

/**
 * The JS spelling of what `for x in enum` / `*enum` read off `each`:
 * `vendor/ruby/v3.3.11/enum.c:711` `enum_to_a`, iterated.
 * @noRailsEquivalent PERMANENT
 */
function iterator<T>(this: Each<T>): IterableIterator<T> {
  const ary: T[] = [];
  rbBlockCall(this, (i) => {
    ary.push(i);
  });
  return ary[Symbol.iterator]();
}

/**
 * `select` is `enum_find_all` under a second name (`vendor/ruby/v3.3.11/enum.c:5076`).
 * @noRailsEquivalent PERMANENT
 */
export const Enumerable = {
  findAll,
  select: findAll,
  map,
  first,
  drop,
  isAny,
  isInclude,
  [Symbol.iterator]: iterator,
};
