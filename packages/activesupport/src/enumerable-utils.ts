import {
  Hash,
  Rational,
  numericPlus,
  rbBigNorm,
  rbDbl2num,
  rbEqual,
  rbFloatTypeP,
  rbIntegerTypeP,
  rbPlus,
} from "@blazetrails/ruby-compat";
import { Range } from "@blazetrails/ruby-compat/range";
import { SoleItemExpectedError } from "./core-ext/enumerable.js";
import { isPlainObject, valuesAt } from "./hash-utils.js";
import { isBlank } from "./string-utils.js";

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

function sumIter<T>(i: unknown, memo: EnumSumMemo, block?: (element: T) => unknown): void {
  if (memo.blockGiven) i = block!(i as T);

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

function intRangeSum(beg: number | bigint, end: number | bigint, excl: boolean, init: unknown) {
  if (excl) end = typeof end === "bigint" ? end - 1n : end - 1;
  if (BigInt(end) >= BigInt(beg)) {
    const a = ((BigInt(end) - BigInt(beg) + 1n) * (BigInt(end) + BigInt(beg))) / 2n;
    return numericPlus(init, rbBigNorm(a));
  }
  return init;
}

/** Ruby core `Enumerable#sum` (`vendor/ruby/v3.3.11/enum.c:4760` `enum_sum`). */
export function sum(collection: Iterable<number>): number;
export function sum<T>(collection: Iterable<T>, block: (element: T) => number): number;
export function sum<T>(collection: Iterable<T> | Range<T>, ...args: unknown[]): unknown;
export function sum<T>(collection: Iterable<T> | Range<T>, ...args: unknown[]): unknown {
  const block =
    typeof args[args.length - 1] === "function"
      ? (args.pop() as (element: T) => unknown)
      : undefined;
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

  if (collection instanceof Range) {
    const { begin: beg, end, excludeEnd: excl } = collection as Range<unknown>;
    if (!memo.blockGiven && !memo.floatValue && rbIntegerTypeP(beg) && rbIntegerTypeP(end)) {
      return intRangeSum(beg, end, excl, memo.v);
    }
  }

  const each = collection instanceof Range ? collection.each() : collection;
  for (const element of each) sumIter(element, memo, block);

  if (memo.floatValue) {
    return rbDbl2num(memo.f + memo.c);
  } else {
    if (memo.n !== 0) memo.v = numericPlus(memo.n, memo.v);
    if (memo.r !== undefined) memo.v = numericPlus(memo.r, memo.v);
    return memo.v;
  }
}

export function indexBy<T, K extends string | number>(
  collection: T[],
  fn: (item: T) => K,
): Record<K, T> {
  const result = Object.create(null) as Record<K, T>;
  for (const item of collection) {
    result[fn(item)] = item;
  }
  return result;
}

export function indexWith<T, V>(
  collection: readonly T[],
  defaultOrBlock: V | ((elem: T) => V),
): Hash<T, V> {
  const result = new Hash<T, V>();
  if (typeof defaultOrBlock === "function") {
    const block = defaultOrBlock as (elem: T) => V;
    for (const elem of collection) result.set(elem, block(elem));
  } else {
    for (const elem of collection) result.set(elem, defaultOrBlock);
  }
  return result;
}

export function groupBy<T, K>(collection: T[], fn: (item: T) => K): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const item of collection) {
    const key = fn(item);
    if (!result.has(key)) result.set(key, []);
    result.get(key)!.push(item);
  }
  return result;
}

export function pluck<T, K extends keyof T>(collection: T[], ...keys: K[]): T[K][] | T[K][][] {
  if (keys.length > 1) {
    return collection.map((element) => keys.map((key) => element[key]));
  } else {
    const key = keys[0];
    return collection.map((element) => element[key]);
  }
}

export function maximum<T>(collection: T[], key: (item: T) => number): number | undefined {
  if (collection.length === 0) return undefined;
  return Math.max(...collection.map(key));
}

export function minimum<T>(collection: T[], key: (item: T) => number): number | undefined {
  if (collection.length === 0) return undefined;
  return Math.min(...collection.map(key));
}

export function inBatchesOf<T>(collection: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < collection.length; i += size) {
    result.push(collection.slice(i, i + size));
  }
  return result;
}

export function compactBlank<T>(collection: T[]): T[] {
  return collection.filter((item) => !isBlank(item));
}

export function any<T>(collection: readonly T[], fn?: (item: T) => unknown): boolean {
  for (const item of collection) {
    const value = fn ? fn(item) : item;
    if (value != null && value !== false) return true;
  }
  return false;
}

export function many<T>(collection: T[], fn?: (item: T) => boolean): boolean {
  if (!fn) return collection.length > 1;
  let count = 0;
  for (const item of collection) {
    if (fn(item)) {
      count++;
      if (count > 1) return true;
    }
  }
  return false;
}

export function tally<T extends string | number>(collection: T[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of collection) {
    const key = String(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

export function filterMap<T, U>(
  collection: T[],
  fn: (item: T) => U | false | null | undefined,
): U[] {
  const result: U[] = [];
  for (const item of collection) {
    const mapped = fn(item);
    if (mapped !== null && mapped !== undefined && mapped !== false) {
      result.push(mapped);
    }
  }
  return result;
}

export function excluding<T extends Record<string, unknown>>(
  collection: T,
  ...elements: unknown[]
): Partial<T>;
export function excluding<T>(collection: Iterable<T>, ...elements: unknown[]): T[];
export function excluding(collection: unknown, ...elements: unknown[]): unknown {
  elements = elements.flat(1);
  if (isPlainObject(collection)) {
    return Object.fromEntries(
      Object.entries(collection).filter(([element]) => !elements.some((e) => rbEqual(e, element))),
    );
  }
  return [...(collection as Iterable<unknown>)].filter(
    (element) => !elements.some((e) => rbEqual(e, element)),
  );
}

export function including<T>(collection: T[], ...elements: T[]): T[] {
  return [...collection, ...elements];
}

export function minBy<T>(collection: T[], fn: (item: T) => number): T | undefined {
  if (collection.length === 0) return undefined;
  return collection.reduce((best, item) => (fn(item) < fn(best) ? item : best));
}

export function maxBy<T>(collection: T[], fn: (item: T) => number): T | undefined {
  if (collection.length === 0) return undefined;
  return collection.reduce((best, item) => (fn(item) > fn(best) ? item : best));
}

export function eachCons<T>(collection: T[], n: number): T[][];
export function eachCons<T>(collection: T[], n: number, block: (slice: T[]) => void): T[];
export function eachCons<T>(collection: T[], n: number, block?: (slice: T[]) => void): T[][] | T[] {
  const result: T[][] = [];
  for (let i = 0; i <= collection.length - n; i++) {
    result.push(collection.slice(i, i + n));
  }
  if (!block) return result;
  result.forEach(block);
  return collection;
}

export function eachSlice<T>(collection: T[], n: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < collection.length; i += n) {
    result.push(collection.slice(i, i + n));
  }
  return result;
}

export function inOrderOf<T>(
  collection: T[],
  key: (item: T) => unknown,
  series: unknown[],
  options: { filter?: boolean } = {},
): T[] {
  const filter = options.filter !== false;
  if (filter) {
    return valuesAt(groupBy(collection, key), ...series)
      .flat(1)
      .filter((v): v is T => v != null);
  } else {
    const position = (v: T): number => {
      const index = series.indexOf(key(v));
      return index === -1 ? series.length : index;
    };
    return [...collection].sort((a, b) => position(a) - position(b)).filter((v) => v != null);
  }
}

export function exclude<T>(collection: T[], object: T): boolean {
  return !collection.includes(object);
}

export function without<T>(collection: T[], ...elements: T[]): T[] {
  return excluding(collection, ...elements);
}

export function pick<T, K extends keyof T>(
  collection: T[],
  ...keys: K[]
): T[K] | T[K][] | undefined {
  if (collection.length === 0) return undefined;

  if (keys.length > 1) {
    return keys.map((key) => collection[0][key]);
  } else {
    return collection[0][keys[0]];
  }
}

export function sole<T>(collection: T[], fn?: (item: T) => boolean): T {
  const filtered = fn ? collection.filter(fn) : collection;
  if (filtered.length === 0) throw new SoleItemExpectedError("no item found");
  if (filtered.length > 1) throw new SoleItemExpectedError("multiple items found");
  return filtered[0];
}
