/**
 * Ruby's core `Enumerable` module (`vendor/ruby/v3.3.11/enum.c:5047` `Init_Enumerable`):
 * members derived from the including class's `each`, mixed in with
 * `include(Klass, Enumerable)`.
 *
 * Only the members a trails includer reaches are ported; the rest of
 * `Init_Enumerable` joins as a caller needs it.
 */

import { ArgumentError } from "./argument-error.js";
import {
  numericPlus,
  rbBigNorm,
  rbDbl2num,
  rbFloatTypeP,
  rbIntegerTypeP,
  rbPlus,
} from "./numeric.js";
import { Rational } from "./rational.js";
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

interface EnumSumMemo {
  v: unknown;
  r: Rational | undefined;
  n: number;
  f: number;
  c: number;
  blockGiven: boolean;
  floatValue: boolean;
}

function sumIterNormalizeMemo(memo: EnumSumMemo): void {
  memo.v = numericPlus(memo.n, memo.v);
  memo.n = 0;
  if (memo.r !== undefined) memo.v = numericPlus(memo.r, memo.v);
  memo.r = undefined;
}

function sumIterFixnum(i: number, memo: EnumSumMemo): void {
  if (Number.isSafeInteger(memo.n + i)) {
    memo.n += i;
  } else {
    memo.v = numericPlus(rbBigNorm(BigInt(memo.n) + BigInt(i)), memo.v);
    memo.n = 0;
  }
}

function sumIterBignum(i: bigint, memo: EnumSumMemo): void {
  memo.v = numericPlus(i, memo.v);
}

function sumIterRational(i: Rational, memo: EnumSumMemo): void {
  if (memo.r === undefined) memo.r = i;
  else memo.r = memo.r.add(i);
}

/** `sum_iter_some_value` (`vendor/ruby/v3.3.11/enum.c:4581`): `memo->v + i`. */
function sumIterSomeValue(i: unknown, memo: EnumSumMemo): void {
  memo.v = rbPlus(memo.v, i);
}

function sumIterKahanBabuska(i: unknown, memo: EnumSumMemo): void {
  let x: number;
  if (rbFloatTypeP(i)) x = i.valueOf();
  else if (typeof i === "number") x = i;
  else if (typeof i === "bigint") x = Number(i);
  else if (i instanceof Rational) x = i.toF();
  else {
    memo.v = rbDbl2num(memo.f);
    memo.floatValue = false;
    sumIterSomeValue(i, memo);
    return;
  }
  const f = memo.f;
  if (Number.isNaN(f)) return;
  else if (!Number.isFinite(x)) {
    if (!Number.isNaN(x) && !Number.isFinite(f) && x > 0 !== f > 0) {
      i = rbDbl2num(f);
      x = NaN;
    }
    memo.v = i;
    memo.f = x;
    return;
  } else if (!Number.isFinite(f)) return;

  let c = memo.c;
  const t = f + x;
  if (Math.abs(f) >= Math.abs(x)) c += f - t + x;
  else c += x - t + f;
  memo.f = t;
  memo.c = c;
}

function sumIter(i: unknown, memo: EnumSumMemo): void {
  if (memo.floatValue) {
    sumIterKahanBabuska(i, memo);
  } else if (rbIntegerTypeP(memo.v) || rbFloatTypeP(memo.v) || memo.v instanceof Rational) {
    if (typeof i === "number" && Number.isInteger(i)) sumIterFixnum(i, memo);
    else if (typeof i === "bigint") sumIterBignum(i, memo);
    else if (i instanceof Rational) sumIterRational(i, memo);
    else if (rbFloatTypeP(i)) {
      sumIterNormalizeMemo(memo);
      memo.f = memo.v instanceof Rational ? memo.v.toF() : Number((memo.v as number).valueOf());
      memo.c = 0.0;
      memo.floatValue = true;
      sumIterKahanBabuska(i, memo);
    } else {
      sumIterNormalizeMemo(memo);
      sumIterSomeValue(i, memo);
    }
  } else {
    sumIterSomeValue(i, memo);
  }
}

function enumSumMemo<T>(args: unknown[]): [EnumSumMemo, ((element: T) => unknown) | undefined] {
  const block =
    typeof args[args.length - 1] === "function"
      ? (args.pop() as (element: T) => unknown)
      : undefined;
  if (args.length > 1) {
    throw new ArgumentError(`wrong number of arguments (given ${args.length}, expected 0..1)`);
  }
  const memo: EnumSumMemo = {
    v: args.length === 0 ? 0 : args[0],
    blockGiven: block !== undefined,
    n: 0,
    r: undefined,
    f: 0.0,
    c: 0.0,
    floatValue: false,
  };

  if ((memo.floatValue = rbFloatTypeP(memo.v))) {
    memo.f = memo.v.valueOf();
    memo.c = 0.0;
  }
  return [memo, block];
}

function enumSumValue(memo: EnumSumMemo): unknown {
  if (memo.floatValue) {
    return rbDbl2num(memo.f + memo.c);
  } else {
    if (memo.n !== 0) memo.v = numericPlus(memo.n, memo.v);
    if (memo.r !== undefined) memo.v = numericPlus(memo.r, memo.v);
    return memo.v;
  }
}

/**
 * Mirrors: Ruby's Enumerable#sum — `vendor/ruby/v3.3.11/enum.c:4753` `enum_sum`. The
 * block is the trailing function argument, so a function cannot be the initial
 * value. The Range arm (`int_range_sum`, `:4706`) is the caller's, and no
 * includer is a Hash.
 * @noRailsEquivalent PERMANENT
 */
function sum<T>(this: Each<T>, ...args: unknown[]): unknown {
  const [memo, block] = enumSumMemo<T>(args);
  rbBlockCall(this, (i) => {
    sumIter(memo.blockGiven ? block!(i) : i, memo);
  });
  return enumSumValue(memo);
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
  isAny,
  isInclude,
  sum,
  [Symbol.iterator]: iterator,
};

/** @noRailsEquivalent PERMANENT */
export interface AsyncEach<T> {
  each(): AsyncIterable<T>;
  each(block: (i: T) => unknown): PromiseLike<unknown>;
}

/**
 * `Enumerable` (`vendor/ruby/v3.3.11/enum.c:5047` `Init_Enumerable`) for a class
 * whose `each` awaits: every member awaits `each`, and `each` awaits the block
 * before it yields the next element.
 * @noRailsEquivalent PERMANENT
 */
export const AsyncEnumerable = {
  /**
   * Mirrors: Ruby's Enumerable#to_a — `vendor/ruby/v3.3.11/enum.c:711` `enum_to_a`.
   * @noRailsEquivalent PERMANENT
   */
  async toA<T>(this: AsyncEach<T>): Promise<T[]> {
    const ary: T[] = [];
    await this.each((i) => {
      ary.push(i);
    });
    return ary;
  },

  /**
   * Mirrors: Ruby's Enumerable#sum — `vendor/ruby/v3.3.11/enum.c:4753` `enum_sum`, awaiting
   * the block's result before it is added (`sum_iter`'s `rb_yield`, `:4645`).
   * @noRailsEquivalent PERMANENT
   */
  async sum<T>(this: AsyncEach<T>, ...args: unknown[]): Promise<unknown> {
    const [memo, block] = enumSumMemo<T>(args);
    await this.each(async (i) => {
      sumIter(memo.blockGiven ? await block!(i) : i, memo);
    });
    return enumSumValue(memo);
  },

  /** @noRailsEquivalent PERMANENT */
  [Symbol.asyncIterator]<T>(this: AsyncEach<T>): AsyncIterator<T> {
    return this.each()[Symbol.asyncIterator]();
  },
};
