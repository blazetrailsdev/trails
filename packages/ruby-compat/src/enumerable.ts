/**
 * Ruby's core `Enumerable` module (`vendor/ruby/v3.3.11/enum.c:5047` `Init_Enumerable`):
 * members derived from the including class's `each`, mixed in with
 * `include(Klass, Enumerable)`. Where `each` answers a promise, each member
 * answers a promise of its result.
 *
 * Only the members a trails includer reaches are ported; the rest of
 * `Init_Enumerable` joins as a caller needs it.
 */

import { ArgumentError } from "./argument-error.js";
import { each } from "./array.js";
import {
  numericPlus,
  rbBigNorm,
  rbDbl2num,
  rbFloatTypeP,
  rbIntegerTypeP,
  rbPlus,
} from "./numeric.js";
import { rbFPublicSend, rbFSend } from "./object.js";
import { Rational } from "./rational.js";
import { checkArity } from "./string/support.js";
import { rbEqq, rbEqual } from "./rb-equal.js";
import { isSymbol, stringToSym, symbolToS } from "./symbol.js";

/** @noRailsEquivalent PERMANENT */
export interface Each<T, E = unknown> {
  each(block: (i: T) => void): E;
}

/** @noRailsEquivalent PERMANENT */
export type Enumerated<E, R> = E extends Promise<unknown> ? Promise<R> : R;

const iterBreak = Symbol("rb_iter_break");

function rbBlockCall<T, E, R>(
  obj: Each<T, E>,
  block: (i: T) => void,
  result: () => R,
): Enumerated<E, R> {
  const rescue = (e: unknown): R => {
    if (e !== iterBreak) throw e;
    return result();
  };
  let each: unknown;
  try {
    each = obj.each(block);
  } catch (e) {
    return rescue(e) as Enumerated<E, R>;
  }
  if (each instanceof Promise) return each.then(result, rescue) as Enumerated<E, R>;
  return result() as Enumerated<E, R>;
}

/**
 * Mirrors: Ruby's Enumerable#find_all — `vendor/ruby/v3.3.11/enum.c:509` `enum_find_all`,
 * pushing each element whose block result `RTEST`s (`find_all_i`, `:456`).
 * @noRailsEquivalent PERMANENT
 */
function findAll<T, E = unknown>(this: Each<T, E>, block: (i: T) => unknown): Enumerated<E, T[]> {
  const ary: T[] = [];
  return rbBlockCall(
    this,
    (i) => {
      const result = block(i);
      if (result != null && result !== false) ary.push(i);
    },
    () => ary,
  );
}

/**
 * Mirrors: Ruby's Enumerable#map — `vendor/ruby/v3.3.11/enum.c:638` `enum_collect`.
 * @noRailsEquivalent PERMANENT
 */
function map<T, R, E = unknown>(this: Each<T, E>, block: (i: T) => R): Enumerated<E, R[]> {
  const ary: R[] = [];
  return rbBlockCall(
    this,
    (i) => {
      ary.push(block(i));
    },
    () => ary,
  );
}

/**
 * Mirrors: Ruby's Enumerable#first — `vendor/ruby/v3.3.11/enum.c:1284` `enum_first`,
 * whose `n` arm is `enum_take` (`:3514`).
 * @noRailsEquivalent PERMANENT
 */
function first<T, E = unknown>(this: Each<T, E>): Enumerated<E, T | null>;
function first<T, E = unknown>(this: Each<T, E>, n: number): Enumerated<E, T[]>;
function first<T, E = unknown>(this: Each<T, E>, n?: number): Enumerated<E, T | null | T[]> {
  if (n !== undefined) {
    if (n < 0) throw new ArgumentError("attempt to take negative size");
    const result: T[] = [];
    if (n === 0) return result as Enumerated<E, T[]>;
    return rbBlockCall(
      this,
      (i) => {
        result.push(i);
        if (result.length >= n) throw iterBreak;
      },
      () => result,
    );
  }
  let memo: T | null = null;
  return rbBlockCall(
    this,
    (i) => {
      memo = i;
      throw iterBreak;
    },
    () => memo,
  );
}

/**
 * Mirrors: Ruby's Enumerable#drop — `vendor/ruby/v3.3.11/enum.c:3603` `enum_drop`, whose
 * `drop_i` (`:3571`) counts `n` elements down before it pushes.
 * @noRailsEquivalent PERMANENT
 */
function drop<T, E = unknown>(this: Each<T, E>, n: number): Enumerated<E, T[]> {
  let len = n;

  if (len < 0) {
    throw new ArgumentError("attempt to drop negative size");
  }

  const result: T[] = [];
  return rbBlockCall(
    this,
    (i) => {
      if (len === 0) {
        result.push(i);
      } else {
        len--;
      }
    },
    () => result,
  );
}

function enumfunc<T>(args: unknown[]): (i: T) => unknown {
  checkArity(args.length, 0, 1);
  return args.length > 0 ? (i) => rbEqq(args[0], i) : (i) => i;
}

/**
 * Mirrors: Ruby's Enumerable#any? — `vendor/ruby/v3.3.11/enum.c:1861` `enum_any`,
 * `RTEST`ing `pattern === element`, or the element itself with no argument.
 * @noRailsEquivalent PERMANENT
 */
function isAny<T, E = unknown>(this: Each<T, E>, ...args: unknown[]): Enumerated<E, boolean> {
  const func = enumfunc<T>(args);
  let memo = false;
  return rbBlockCall(
    this,
    (i) => {
      const result = func(i);
      if (result != null && result !== false) {
        memo = true;
        throw iterBreak;
      }
    },
    () => memo,
  );
}

/**
 * Mirrors: Ruby's Enumerable#one? — `vendor/ruby/v3.3.11/enum.c:2148` `enum_one`, which
 * breaks on the second match (`:1869`).
 * @noRailsEquivalent PERMANENT
 */
function isOne<T, E = unknown>(this: Each<T, E>, ...args: unknown[]): Enumerated<E, boolean> {
  const func = enumfunc<T>(args);
  let memo: boolean | undefined = undefined;
  return rbBlockCall(
    this,
    (i) => {
      const result = func(i);
      if (result != null && result !== false) {
        if (memo === undefined) {
          memo = true;
        } else if (memo === true) {
          memo = false;
          throw iterBreak;
        }
      }
    },
    () => memo === true,
  );
}

/**
 * Mirrors: Ruby's Enumerable#none? — `vendor/ruby/v3.3.11/enum.c:2210` `enum_none`
 * (`:2160`).
 * @noRailsEquivalent PERMANENT
 */
function isNone<T, E = unknown>(this: Each<T, E>, ...args: unknown[]): Enumerated<E, boolean> {
  const func = enumfunc<T>(args);
  let memo = true;
  return rbBlockCall(
    this,
    (i) => {
      const result = func(i);
      if (result != null && result !== false) {
        memo = false;
        throw iterBreak;
      }
    },
    () => memo,
  );
}

/**
 * Mirrors: Ruby's Enumerable#include? — `vendor/ruby/v3.3.11/enum.c:2921` `enum_member`,
 * whose `member_i` (`:2892`) asks `rb_equal(element, val)` and breaks on the first hit.
 * @noRailsEquivalent PERMANENT
 */
function isInclude<T, E = unknown>(this: Each<T, E>, val: unknown): Enumerated<E, boolean> {
  let memo = false;
  return rbBlockCall(
    this,
    (i) => {
      if (rbEqual(i, val)) {
        memo = true;
        throw iterBreak;
      }
    },
    () => memo,
  );
}

/**
 * The JS spelling of what `for x in enum` / `*enum` read off `each`:
 * `vendor/ruby/v3.3.11/enum.c:711` `enum_to_a`, iterated. An `each` that
 * answers a promise has yielded nothing yet, so it raises.
 * @noRailsEquivalent PERMANENT
 */
function iterator<T, E = unknown>(this: Each<T, E>): IterableIterator<T> {
  const ary: T[] = [];
  const each: unknown = rbBlockCall(
    this,
    (i) => {
      ary.push(i);
    },
    () => ary,
  );
  if (each instanceof Promise) {
    each.catch(() => {});
    throw new TypeError("each is asynchronous: await it before iterating");
  }
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
function sum<T, E = unknown>(this: Each<T, E>, ...args: unknown[]): unknown {
  const [memo, block] = enumSumMemo<T>(args);
  return rbBlockCall(
    this,
    (i) => {
      sumIter(memo.blockGiven ? block!(i) : i, memo);
    },
    () => enumSumValue(memo),
  );
}

const undef = Symbol("Qundef");

interface InjectMemo<T> {
  v1: unknown;
  block: ((memo: unknown, i: T) => unknown) | undefined;
  op: unknown;
}

/** `inject_i` (`vendor/ruby/v3.3.11/enum.c:775`). */
function injectI<T>(i: T, memo: InjectMemo<T>): void {
  if (memo.v1 === undef) {
    memo.v1 = i;
  } else {
    memo.v1 = memo.block!(memo.v1, i);
  }
}

/** `inject_op_i` (`vendor/ruby/v3.3.11/enum.c:791`). */
function injectOpI<T>(i: T, memo: InjectMemo<T>): void {
  const name = memo.op;
  if (memo.v1 === undef) {
    memo.v1 = i;
  } else if (isSymbol(name)) {
    memo.v1 = rbFPublicSend(memo.v1, name, i);
  } else {
    memo.v1 = rbFSend(memo.v1, name, i);
  }
}

/** `ary_inject_op` (`vendor/ruby/v3.3.11/enum.c:815`). */
function aryInjectOp(ary: readonly unknown[], init: unknown, op: string): unknown {
  let v: unknown;
  let i: number;

  if (ary.length === 0) return init === undef ? null : init;

  if (init === undef) {
    v = ary[0];
    i = 1;
    if (ary.length === 1) return v;
  } else {
    v = init;
    i = 0;
  }

  if (symbolToS(op) === "+") {
    if (rbIntegerTypeP(v)) {
      for (; i < ary.length; i++) {
        const e = ary[i];
        if (!rbIntegerTypeP(e)) break;
        v = numericPlus(v, e);
      }
    }
  }
  for (; i < ary.length; i++) {
    v = rbFPublicSend(v, op, ary[i]);
  }
  return v;
}

/**
 * Mirrors: Ruby's Enumerable#reduce — `vendor/ruby/v3.3.11/enum.c:1005` `enum_inject`,
 * bound as `reduce` at `:5085`. The receiver is the first argument, an Array
 * as readily as an `each` includer, and the block is the trailing function
 * argument. `rb_check_id` turns a String naming a method into its Symbol,
 * which every String here does; `rb_warning("given block not used")` prints
 * only under `$VERBOSE`. An Array's `each` is `rb_ary_each`
 * (`vendor/ruby/v3.3.11/array.c:2532`), which has no `each` member to call.
 * Unported: the `rb_method_basic_definition_p` checks on `each` (`:1044`) and
 * on `Integer#+` (`:836`), which ask whether a core method was redefined.
 * @noRailsEquivalent PERMANENT
 */
export function reduce<T, E = unknown>(
  obj: Each<T, E> | readonly T[],
  ...argv: unknown[]
): Enumerated<E, unknown> {
  const block =
    typeof argv[argv.length - 1] === "function"
      ? (argv.pop() as (memo: unknown, i: T) => unknown)
      : undefined;
  let init: unknown;
  let op: unknown;
  let iter: (i: T, memo: InjectMemo<T>) => void = injectI;

  if (block !== undefined) {
    checkArity(argv.length, 0, 2);
  } else {
    checkArity(argv.length, 1, 2);
  }
  [init, op] = argv;

  switch (argv.length) {
    case 0:
      init = undef;
      break;
    case 1:
      if (block !== undefined) {
        break;
      }
      op = typeof init === "string" ? stringToSym(init) : init;
      init = undef;
      iter = injectOpI;
      break;
    case 2:
      if (typeof op === "string") op = stringToSym(op);
      iter = injectOpI;
      break;
  }

  if (iter === injectOpI && isSymbol(op) && Array.isArray(obj)) {
    return aryInjectOp(obj, init, op) as Enumerated<E, unknown>;
  }

  const memo: InjectMemo<T> = { v1: init, block, op };
  const result = () => (memo.v1 === undef ? null : memo.v1);
  if (Array.isArray(obj)) {
    each(obj as T[], (i) => iter(i, memo));
    return result() as Enumerated<E, unknown>;
  }
  return rbBlockCall(obj as Each<T, E>, (i) => iter(i, memo), result);
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
  isOne,
  isNone,
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
