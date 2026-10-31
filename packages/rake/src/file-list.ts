import {
  ARRAY_METHOD_TABLE,
  ArgumentError,
  Dir,
  Enumerable,
  File,
  FrozenError,
  IndexError,
  Range,
  StandardError,
  arySlice,
  aryJoin,
  cmp,
  compactBang,
  deleteAt,
  eachCons,
  eachSlice,
  flatten,
  groupBy,
  include,
  isIntersect,
  maxBy,
  minBy,
  pack,
  product,
  puts,
  rbAryFetch,
  rbBlockGivenP,
  rbCheckArrayType,
  rbCmpint,
  rbEqq,
  rbEqual,
  rbFSend,
  rbInspect,
  rbObjIsProc,
  rbStrSub,
  rtest,
  sortBy,
  stderr as $stderr,
  stdout as $stdout,
  strGsub,
  tally,
  toEnum,
  uniq,
} from "@blazetrails/ruby-compat";
import { Cloneable } from "./cloneable.js";
import { ext as stringExt, pathmap as stringPathmap } from "./ext/string.js";
import { fromPathname } from "./rake-module.js";

type Items = unknown[];
type ElementBlock = (fn: string) => unknown;
type PairBlock = (a: string, b: string) => unknown;

async function _yields(items: Items, block: ElementBlock): Promise<Items> {
  const result: Items = [];
  for (const fn of items) result.push(await block(fn as string));
  return result;
}

async function _filterBy(items: Items, block: ElementBlock, keep: boolean): Promise<Items> {
  const yields = await _yields(items, block);
  return items.filter((_fn, i) => rtest(yields[i]) === keep);
}

async function _replay(items: Items, block: ElementBlock): Promise<(fn: unknown) => unknown> {
  const yields = await _yields(items, block);
  let i = 0;
  return () => yields[i++];
}

function _replace(items: Items, result: Items): Items {
  items.splice(0, items.length, ...result);
  return items;
}

const _isProc = rbObjIsProc as (arg: unknown) => arg is ElementBlock;

const _compare = (a: unknown, b: unknown): number => rbCmpint(cmp(a, b), a, b);

function _comparator(block?: unknown): (a: unknown, b: unknown) => number {
  return _isProc(block)
    ? (a, b) => (block as unknown as (a: unknown, b: unknown) => number)(a, b)
    : _compare;
}

/** `rb_range_beg_len` (`vendor/ruby/v3.3.11/range.c:1744`) for `Array#[]=` and `#slice!`. */
function _span(items: Items, start: unknown, len?: number): [number, number] {
  if (start instanceof Range) {
    let beg = (start.begin as number | null) ?? 0;
    let end = (start.end as number | null) ?? items.length;
    if (beg < 0) beg += items.length;
    if (end < 0) end += items.length;
    if (start.end !== null && !start.excludeEnd) end += 1;
    return [beg, Math.max(0, end - beg)];
  }
  return [(start as number) < 0 ? (start as number) + items.length : (start as number), len ?? 1];
}

function _choose(items: Items, n: number, ordered: boolean, repeat: boolean): Items[] {
  if (n < 0) return [];
  if (n === 0) return [[]];
  return items.flatMap((fn, i) => {
    const rest = ordered
      ? repeat
        ? items
        : items.filter((_x, j) => j !== i)
      : items.slice(repeat ? i : i + 1);
    return _choose(rest, n - 1, ordered, repeat).map((tail) => [fn, ...tail]);
  });
}

async function _combinatoric(result: Items[], items: Items, block?: ElementBlock): Promise<Items> {
  if (!block) return result;
  for (const c of result) await (block as unknown as (c: Items) => unknown)(c);
  return items;
}

async function _extreme(items: Items, args: unknown[], last: boolean): Promise<unknown> {
  const block = _isProc(args.at(-1)) ? args.pop() : undefined;
  const sorted = [...items].sort(_comparator(block));
  if (last) sorted.reverse();
  return args.length ? sorted.slice(0, args[0] as number) : (sorted[0] ?? null);
}

async function _split(items: Items, cut: (a: string, b: string) => unknown): Promise<Items[]> {
  const result: Items[] = [];
  for (const [i, fn] of items.entries()) {
    if (i > 0 && !rtest(await cut(items[i - 1] as string, fn as string))) {
      result.at(-1)!.push(fn);
    } else {
      result.push([fn]);
    }
  }
  return result;
}

function _matcher(args: unknown[]): ElementBlock {
  return _isProc(args[0]) ? args[0] : (fn) => rbEqq(args[0], fn);
}

async function _search(items: Items, block: ElementBlock): Promise<number | null> {
  let [low, high, found] = [0, items.length, null as number | null];
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    const v = await block(items[mid] as string);
    if (v === 0) return mid;
    if (v === true || (typeof v === "number" && v < 0)) {
      if (v === true) found = mid;
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return found;
}

/** @noRailsEquivalent PERMANENT */
const ARRAY_CALLS: Record<string, (items: Items, ...args: never[]) => unknown> = {
  size: (items) => items.length,
  length: (items) => items.length,
  first: (items, ...args: [number?]) => {
    if (args.length === 0) return items[0] ?? null;
    if (args[0]! < 0) throw new ArgumentError("negative array size");
    return items.slice(0, args[0]);
  },
  last: (items, ...args: [number?]) =>
    args.length === 0 ? (items.at(-1) ?? null) : items.slice(Math.max(items.length - args[0]!, 0)),
  at: (items, i: number) => items.at(i) ?? null,
  get: (items, ...args: [unknown, unknown?]) => arySlice(items, ...args),
  set: (items, ...args: unknown[]) => {
    const value = args.at(-1);
    if (args.length === 2 && !(args[0] instanceof Range)) {
      const [i] = _span(items, args[0]);
      if (i < 0)
        throw new IndexError(`index ${args[0]} too small for array; minimum: -${items.length}`);
      while (items.length < i) items.push(null);
      items[i] = value;
      return value;
    }
    const [beg, len] = _span(items, args[0], args[1] as number);
    while (items.length < beg) items.push(null);
    items.splice(beg, len, ...(Array.isArray(value) ? value : [value]));
    return value;
  },
  fetch: (items, ...args: unknown[]) => {
    const i = args[0] as number;
    const inRange = i < items.length && i >= -items.length;
    if (inRange || args.length === 1) return rbAryFetch(items, i);
    return _isProc(args[1]) ? (args[1] as unknown as (i: number) => unknown)(i) : args[1];
  },
  dig: (items, i: number, ...rest: unknown[]) => {
    const v = items.at(i) ?? null;
    return rest.length === 0 || v === null
      ? v
      : (v as { dig(...a: unknown[]): unknown }).dig(...rest);
  },
  isEmpty: (items) => items.length === 0,
  isInclude: (items, obj: unknown) => items.some((fn) => rbEqual(fn, obj)),
  isMember: (items, obj: unknown) => items.some((fn) => rbEqual(fn, obj)),
  join: (items, sep: string | null = null) => aryJoin(items, sep),
  concat: (items, ...others: Items[]) => (items.push(...others.flat(1)), items),
  push: (items, ...objs: unknown[]) => (items.push(...objs), items),
  pop: (items, n?: number) =>
    n === undefined ? (items.pop() ?? null) : items.splice(Math.max(items.length - n, 0)),
  shift: (items, n?: number) => (n === undefined ? (items.shift() ?? null) : items.splice(0, n)),
  unshift: (items, ...objs: unknown[]) => (items.unshift(...objs), items),
  insert: (items, i: number, ...objs: unknown[]) => {
    if (objs.length === 0) return items;
    const at = i < 0 ? i + items.length + 1 : i;
    while (items.length < at) items.push(null);
    items.splice(at, 0, ...objs);
    return items;
  },
  clear: (items) => ((items.length = 0), items),
  replace: (items, other: Items) => _replace(items, [...other]),
  fill: async (items, ...args: unknown[]) => {
    const block = _isProc(args[0]) ? (args.shift() as (i: number) => unknown) : null;
    const [obj] = block ? [null] : args.splice(0, 1);
    const [beg, len] = args.length
      ? _span(items, args[0] ?? 0, args[1] as number)
      : [0, items.length];
    const end = args[0] instanceof Range || args[1] != null ? beg + len : items.length;
    for (let i = beg; i < end; i++) items[i] = block ? await block(i) : obj;
    return items;
  },
  reverse: (items) => [...items].reverse(),
  reverseBang: (items) => items.reverse(),
  rotate: (items, cnt?: number) => ARRAY_METHOD_TABLE.rotate(items, cnt as never),
  rotateBang: (items, cnt?: number) =>
    _replace(items, ARRAY_METHOD_TABLE.rotate(items, cnt as never) as Items),
  shuffle: (items) => ARRAY_METHOD_TABLE.shuffle(items),
  shuffleBang: (items) => _replace(items, ARRAY_METHOD_TABLE.shuffle(items) as Items),
  sample: (items, ...args: [number?]) =>
    ARRAY_METHOD_TABLE.sample(items, ...(args as unknown as never[])),
  zip: async (items, ...others: unknown[]) => {
    const block = _isProc(others.at(-1)) ? (others.pop() as ElementBlock) : null;
    const result = items.map((x, i) => [x, ...(others as Items[]).map((o) => o[i] ?? null)]);
    if (!block) return result;
    await _yields(result, block);
    return null;
  },
  transpose: (items) => {
    const rows = items as Items[];
    for (const row of rows) {
      if (row.length !== rows[0].length) {
        throw new IndexError(`element size differs (${row.length} should be ${rows[0].length})`);
      }
    }
    return (rows[0] ?? []).map((_x, i) => rows.map((row) => row[i]));
  },
  assoc: (items, key: unknown) =>
    items.find((row) => Array.isArray(row) && rbEqual(row[0], key)) ?? null,
  rassoc: (items, value: unknown) =>
    items.find((row) => Array.isArray(row) && rbEqual(row[1], value)) ?? null,
  product: (items, ...others: unknown[]) => {
    const block = _isProc(others.at(-1)) ? (others.pop() as ElementBlock) : undefined;
    return _combinatoric(product(items, ...(others as Items[])), items, block);
  },
  combination: (items, n: number, block?: ElementBlock) =>
    _combinatoric(_choose(items, n, false, false), items, block),
  permutation: (items, ...args: unknown[]) => {
    const block = _isProc(args.at(-1)) ? (args.pop() as ElementBlock) : undefined;
    const n = (args[0] as number | undefined) ?? items.length;
    return _combinatoric(_choose(items, n, true, false), items, block);
  },
  repeatedCombination: (items, n: number, block?: ElementBlock) =>
    _combinatoric(_choose(items, n, false, true), items, block),
  repeatedPermutation: (items, n: number, block?: ElementBlock) =>
    _combinatoric(_choose(items, n, true, true), items, block),
  pack: (items, ...args: unknown[]) => (pack as (...a: unknown[]) => unknown)(items, ...args),
  deconstruct: (items) => items,
  entries: (items) => [...items],
  toH: async (items, block?: ElementBlock) =>
    Object.fromEntries((block ? await _yields(items, block) : items) as [string, unknown][]),
  toSet: (items) => ARRAY_METHOD_TABLE.toSet(items),
  chain: (items, ...others: Items[]) => [...items, ...others.flat(1)],
  lazy: (items) => [...items],
  each: async (items, block?: ElementBlock) => {
    if (!block) return toEnum(items, "each");
    for (const fn of items) await block(fn as string);
    return items;
  },
  eachWithIndex: async (items, block?: (fn: string, i: number) => unknown) => {
    if (!block) return items.map((fn, i) => [fn, i]);
    for (const [i, fn] of items.entries()) await block(fn as string, i);
    return items;
  },
  eachIndex: async (items, block?: (i: number) => unknown) => {
    if (!block) return [...items.keys()];
    for (const i of items.keys()) await block(i);
    return items;
  },
  reverseEach: async (items, block?: ElementBlock) => {
    if (!block) return [...items].reverse();
    await _yields([...items].reverse(), block);
    return items;
  },
  eachWithObject: async (items, memo: unknown, block: (fn: string, memo: unknown) => unknown) => {
    for (const fn of items) await block(fn as string, memo);
    return memo;
  },
  eachSlice: async (items, n: number, block?: ElementBlock) => {
    const slices = eachSlice(items, n) as unknown as Iterable<unknown>;
    if (!block) return [...slices];
    await _yields([...slices], block);
    return items;
  },
  eachCons: async (items, n: number, block?: ElementBlock) => {
    const cons = eachCons(items, n) as unknown as Iterable<unknown>;
    if (!block) return [...cons];
    await _yields([...cons], block);
    return items;
  },
  cycle: async (items, ...args: unknown[]) => {
    const block = _isProc(args.at(-1)) ? (args.pop() as ElementBlock) : null;
    const n = (args[0] as number | null | undefined) ?? null;
    if (!block) return n === null ? [...items] : Array.from({ length: n }, () => items).flat(1);
    if (items.length === 0) return null;
    for (let i = 0; n === null || i < n; i++) await _yields(items, block);
    return null;
  },
  rejectBang: async (items, block: ElementBlock) => {
    const kept = await _filterBy(items, block, false);
    return kept.length === items.length ? null : _replace(items, kept);
  },
  selectBang: async (items, block: ElementBlock) => {
    const kept = await _filterBy(items, block, true);
    return kept.length === items.length ? null : _replace(items, kept);
  },
  deleteIf: async (items, block: ElementBlock) =>
    _replace(items, await _filterBy(items, block, false)),
  keepIf: async (items, block: ElementBlock) =>
    _replace(items, await _filterBy(items, block, true)),
  mapBang: async (items, block: ElementBlock) => _replace(items, await _yields(items, block)),
  sortBang: (items, block?: unknown) => items.sort(_comparator(block)),
  sortByBang: async (items, block: ElementBlock) =>
    _replace(items, sortBy(items, await _replay(items, block)) as Items),
  uniqBang: async (items, block?: ElementBlock) => {
    const kept = (await ARRAY_CALLS.uniq(items, block as never)) as Items;
    return kept.length === items.length ? null : _replace(items, kept);
  },
  compactBang: (items) => compactBang(items),
  flattenBang: (items, level?: number) => {
    if (!items.some(Array.isArray)) return null;
    return _replace(items, ARRAY_CALLS.flatten(items, level as never) as Items);
  },
  sliceBang: (items, ...args: [unknown, number?]) => {
    if (args.length === 1 && !(args[0] instanceof Range)) return deleteAt(items, args[0] as number);
    const result = arySlice(items, ...args);
    if (result !== null) items.splice(..._span(items, args[0], args[1]));
    return result;
  },
  deleteAt: (items, i: number) => deleteAt(items, i),
  map: (items, block?: ElementBlock) => (block ? _yields(items, block) : [...items]),
  flatMap: async (items, block?: ElementBlock) =>
    block ? (await _yields(items, block)).flat(1) : [...items],
  filterMap: async (items, block?: ElementBlock) =>
    block ? (await _yields(items, block)).filter(rtest) : [...items],
  sort: (items, block?: unknown) => [...items].sort(_comparator(block)),
  sortBy: async (items, block?: ElementBlock) =>
    block ? sortBy(items, await _replay(items, block)) : [...items],
  select: (items, block?: ElementBlock) => (block ? _filterBy(items, block, true) : [...items]),
  reject: (items, block?: ElementBlock) => (block ? _filterBy(items, block, false) : [...items]),
  grep: (items, pattern: unknown, block?: ElementBlock) => {
    const matched = items.filter((fn) => rbEqq(pattern, fn));
    return block ? _yields(matched, block) : matched;
  },
  grepV: (items, pattern: unknown, block?: ElementBlock) => {
    const matched = items.filter((fn) => !rbEqq(pattern, fn));
    return block ? _yields(matched, block) : matched;
  },
  compact: (items) => items.filter((fn) => fn != null),
  flatten: (items, level?: number) =>
    level === undefined || level < 0 ? flatten(items) : items.flat(level),
  uniq: async (items, block?: ElementBlock) =>
    block ? uniq(items, await _replay(items, block)) : uniq(items),
  valuesAt: (items, ...selectors: number[]) => selectors.map((i) => items.at(i) ?? null),
  partition: async (items, block: ElementBlock) => {
    const result: [Items, Items] = [[], []];
    for (const fn of items) result[rtest(await block(fn as string)) ? 0 : 1].push(fn);
    return result;
  },
  groupBy: async (items, block: ElementBlock) => groupBy(items, await _replay(items, block)),
  tally: (items) => tally(items),
  sum: async (items, ...args: unknown[]) => {
    const block = _isProc(args.at(-1)) ? (args.pop() as ElementBlock) : null;
    const values = block ? await _yields(items, block) : items;
    return new Enumerable(values).sum(...args);
  },
  toA: (items) => items,
  toAry: (items) => items,
  multiply: (items) => items,
  append: (items, obj: unknown) => (items.push(obj), items),
  inject: async (items, ...args: unknown[]) => {
    const op = args.at(-1);
    const block = _isProc(op) ? (op as unknown as (res: unknown, fn: string) => unknown) : null;
    if (block || (typeof op === "string" && args.length > 0)) args.pop();
    const rest = [...items];
    let memo = args.length ? args[0] : (rest.shift() ?? null);
    for (const fn of rest) {
      memo = block ? await block(memo, fn as string) : rbFSend(memo, op as string, fn);
    }
    return memo;
  },
  find: async (items, ...args: unknown[]) => {
    const block = args.pop() as ElementBlock | undefined;
    if (!block) return [...items];
    for (const fn of items) if (rtest(await block(fn as string))) return fn;
    return _isProc(args[0]) ? (args[0] as () => unknown)() : null;
  },
  count: async (items, obj?: unknown) => {
    if (obj === undefined) return items.length;
    if (!_isProc(obj)) return items.filter((fn) => rbEqual(fn, obj)).length;
    return (await _filterBy(items, obj, true)).length;
  },
  isAny: async (items, ...args: unknown[]) => {
    const test = args.length ? _matcher(args) : (rtest as ElementBlock);
    for (const fn of items) if (rtest(await test(fn as string))) return true;
    return false;
  },
  isAll: async (items, ...args: unknown[]) => {
    const test = args.length ? _matcher(args) : (rtest as ElementBlock);
    for (const fn of items) if (!rtest(await test(fn as string))) return false;
    return true;
  },
  isNone: async (items, ...args: unknown[]) =>
    !(await ARRAY_CALLS.isAny(items, ...(args as never[]))),
  isOne: async (items, ...args: unknown[]) => {
    const test = args.length ? _matcher(args) : (rtest as ElementBlock);
    return (await _filterBy(items, test, true)).length === 1;
  },
  min: (items, ...args: unknown[]) => _extreme(items, args, false),
  max: (items, ...args: unknown[]) => _extreme(items, args, true),
  minmax: async (items, block?: unknown) => [
    await _extreme(items, block ? [block] : [], false),
    await _extreme(items, block ? [block] : [], true),
  ],
  minBy: async (items, ...args: unknown[]) => {
    const block = args.pop() as ElementBlock;
    return (minBy as (...a: unknown[]) => unknown)(items, ...args, await _replay(items, block));
  },
  maxBy: async (items, ...args: unknown[]) => {
    const block = args.pop() as ElementBlock;
    return (maxBy as (...a: unknown[]) => unknown)(items, ...args, await _replay(items, block));
  },
  minmaxBy: async (items, block: ElementBlock) => [
    await ARRAY_CALLS.minBy(items, block as never),
    await ARRAY_CALLS.maxBy(items, block as never),
  ],
  index: async (items, ...args: unknown[]) => {
    if (args.length === 0) return [...items];
    const test = _isProc(args[0]) ? args[0] : (fn: string) => rbEqual(fn, args[0]);
    for (const [i, fn] of items.entries()) if (rtest(await test(fn as string))) return i;
    return null;
  },
  rindex: async (items, ...args: unknown[]) => {
    if (args.length === 0) return [...items].reverse();
    const test = _isProc(args[0]) ? args[0] : (fn: string) => rbEqual(fn, args[0]);
    for (let i = items.length; i--; ) if (rtest(await test(items[i] as string))) return i;
    return null;
  },
  bsearch: async (items, block: ElementBlock) => {
    const i = await _search(items, block);
    return i === null ? null : items[i];
  },
  bsearchIndex: (items, block: ElementBlock) => _search(items, block),
  delete: async (items, obj: unknown, block?: () => unknown) => {
    const found = items.find((fn) => rbEqual(fn, obj));
    if (found === undefined) return block ? block() : null;
    _replace(
      items,
      items.filter((fn) => !rbEqual(fn, obj)),
    );
    return found;
  },
  take: (items, n: number) => {
    if (n < 0) throw new ArgumentError("attempt to take negative size");
    return items.slice(0, n);
  },
  drop: (items, n: number) => {
    if (n < 0) throw new ArgumentError("attempt to drop negative size");
    return items.slice(n);
  },
  takeWhile: async (items, block: ElementBlock) => {
    let n = 0;
    while (n < items.length && rtest(await block(items[n] as string))) n++;
    return items.slice(0, n);
  },
  dropWhile: async (items, block: ElementBlock) => {
    let n = 0;
    while (n < items.length && rtest(await block(items[n] as string))) n++;
    return items.slice(n);
  },
  chunk: async (items, block: ElementBlock) => {
    const result: [unknown, Items][] = [];
    const yields = await _yields(items, block);
    for (const [i, fn] of items.entries()) {
      if (yields[i] === null || yields[i] === undefined) continue;
      const tail = result.at(-1);
      if (tail && i > 0 && rbEqual(tail[0], yields[i]) && rbEqual(yields[i - 1], yields[i])) {
        tail[1].push(fn);
      } else {
        result.push([yields[i], [fn]]);
      }
    }
    return result;
  },
  chunkWhile: (items, block: PairBlock) => _split(items, async (a, b) => !rtest(await block(a, b))),
  sliceWhen: (items, block: PairBlock) => _split(items, block),
  sliceBefore: (items, ...args: unknown[]) => {
    const test = _matcher(args);
    return _split(items, (_a, b) => test(b));
  },
  sliceAfter: (items, ...args: unknown[]) => {
    const test = _matcher(args);
    return _split(items, (a) => test(a));
  },
  plus: (items, other: Items) => [...items, ...other],
  minus: (items, other: Items) => ARRAY_METHOD_TABLE.difference(items, other as never),
  and: (items, other: Items) => ARRAY_METHOD_TABLE.intersection(items, other as never),
  or: (items, other: Items) => ARRAY_METHOD_TABLE.union(items, other as never),
  difference: (items, ...others: Items[]) =>
    ARRAY_METHOD_TABLE.difference(items, ...(others as never[])),
  union: (items, ...others: Items[]) => ARRAY_METHOD_TABLE.union(items, ...(others as never[])),
  intersection: (items, ...others: Items[]) =>
    ARRAY_METHOD_TABLE.intersection(items, ...(others as never[])),
  isIntersect: (items, other: Items) => isIntersect(items, other),
};

Object.assign(ARRAY_CALLS, {
  collect: ARRAY_CALLS.map,
  collectBang: ARRAY_CALLS.mapBang,
  collectConcat: ARRAY_CALLS.flatMap,
  detect: ARRAY_CALLS.find,
  eachEntry: ARRAY_CALLS.each,
  filter: ARRAY_CALLS.select,
  filterBang: ARRAY_CALLS.selectBang,
  findAll: ARRAY_CALLS.select,
  findIndex: ARRAY_CALLS.index,
  prepend: ARRAY_CALLS.unshift,
  reduce: ARRAY_CALLS.inject,
  slice: ARRAY_CALLS.get,
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class FileList {
  static readonly ARRAY_METHODS = Object.keys(ARRAY_CALLS);
  static readonly MUST_DEFINE = ["inspect", "compare"];
  static readonly MUST_NOT_DEFINE = ["toA", "toAry", "partition", "multiply", "append"];
  static readonly SPECIAL_RETURN = [
    "map",
    "collect",
    "sort",
    "sortBy",
    "select",
    "findAll",
    "reject",
    "grep",
    "compact",
    "flatten",
    "uniq",
    "valuesAt",
    "plus",
    "minus",
    "and",
    "or",
  ];
  static readonly DELEGATING_METHODS = [
    ...new Set([...FileList.ARRAY_METHODS, ...FileList.MUST_DEFINE]),
  ]
    .filter((sym) => !FileList.MUST_NOT_DEFINE.includes(sym))
    .sort();
  static readonly GLOB_PATTERN = /[*?[{]/;

  private pendingAdd: unknown[] = [];
  private pending = false;
  private excludePatterns: unknown[];
  private excludeProcs: ElementBlock[];
  private items: Items = [];

  constructor(...patterns: unknown[]) {
    const yieldSelf = rbBlockGivenP(patterns.at(-1))
      ? (patterns.pop() as (fl: this) => void)
      : null;
    this.excludePatterns = [...FileList.DEFAULT_IGNORE_PATTERNS];
    this.excludeProcs = [...FileList.DEFAULT_IGNORE_PROCS];
    patterns.forEach((pattern) => this.include(pattern));
    if (yieldSelf) yieldSelf(this);
  }

  include(...filenames: unknown[]): this {
    for (const fn of filenames) {
      const ary = fn instanceof FileList ? null : rbCheckArrayType(fn);
      if (ary !== null) {
        this.include(...ary);
      } else {
        this.pendingAdd.push(fn instanceof FileList ? fn : fromPathname(fn));
      }
    }
    this.pending = true;
    return this;
  }

  add(...filenames: unknown[]): this {
    return this.include(...filenames);
  }

  async exclude(...patterns: unknown[]): Promise<this> {
    const excludeBlock = rbBlockGivenP(patterns.at(-1)) ? (patterns.pop() as ElementBlock) : null;
    for (const pat of patterns) {
      const ary = pat instanceof FileList ? await pat.toAry() : rbCheckArrayType(pat);
      if (ary !== null) {
        await this.exclude(...ary);
      } else {
        this.excludePatterns.push(fromPathname(pat));
      }
    }
    if (excludeBlock) this.excludeProcs.push(excludeBlock);
    if (!this.pending) await this.resolveExclude();
    return this;
  }

  clearExclude(): this {
    this.excludePatterns = [];
    this.excludeProcs = [];
    return this;
  }

  async equals(array: unknown): Promise<boolean> {
    const other = array instanceof FileList ? await array.toAry() : array;
    return rbEqual(await this.toAry(), other);
  }

  async toA(): Promise<Items> {
    await this.resolve();
    return this.items;
  }

  toAry(): Promise<Items> {
    return this.toA();
  }

  multiply(other: number | string): this | string {
    const result =
      typeof other === "string"
        ? this.items.join(other)
        : Array.from({ length: other }, () => this.items).flat(1);
    return Array.isArray(result)
      ? new (this.constructor as new () => this)().import(result)
      : result;
  }

  async append(obj: unknown): Promise<this> {
    await this.resolve();
    this.items.push(fromPathname(obj));
    return this;
  }

  async resolve(): Promise<this> {
    if (this.pending) {
      if (Object.isFrozen(this)) {
        throw new FrozenError(`can't modify frozen Rake::FileList: ${rbInspect(this.items)}`, {
          receiver: this,
        });
      }
      this.pending = false;
      for (const fn of this.pendingAdd) await this.resolveAdd(fn);
      this.pendingAdd = [];
      await this.resolveExclude();
    }
    return this;
  }

  /**
   * @internal
   * @inventedArm if — PERMANENT
   */
  private async resolveAdd(fn: unknown): Promise<void> {
    if (fn instanceof FileList) {
      for (const item of await fn.toAry()) await this.resolveAdd(item);
    } else if (typeof fn === "string" && FileList.GLOB_PATTERN.test(fn)) {
      await this.addMatching(fn);
    } else {
      await this.append(fn);
    }
  }

  /** @internal */
  private async resolveExclude(): Promise<this> {
    await this.rejectBang((fn) => this.isExcludedFromList(fn));
    return this;
  }

  sub(pat: RegExp | string, rep: string): Promise<this> {
    return this.inject(new (this.constructor as new () => this)(), (res: unknown, fn: unknown) =>
      (res as this).append(rbStrSub({ string: fn as string }, pat, rep)),
    ) as Promise<this>;
  }

  gsub(pat: RegExp | string, rep: string): Promise<this> {
    return this.inject(new (this.constructor as new () => this)(), (res: unknown, fn: unknown) =>
      (res as this).append(strGsub({ string: fn as string }, [pat, rep], false)),
    ) as Promise<this>;
  }

  async subBang(pat: RegExp | string, rep: string): Promise<this> {
    await this.eachWithIndex((fn, i) => this.set(i, rbStrSub({ string: fn }, pat, rep)));
    return this;
  }

  async gsubBang(pat: RegExp | string, rep: string): Promise<this> {
    await this.eachWithIndex((fn, i) => this.set(i, strGsub({ string: fn }, [pat, rep], false)));
    return this;
  }

  pathmap(spec: string | null = null, block?: Parameters<typeof stringPathmap>[2]): Promise<this> {
    return this.collect((fn) => stringPathmap(fn, spec, block));
  }

  ext(newext = ""): Promise<this> {
    return this.collect((fn) => stringExt(fn, newext));
  }

  /** @missingRailsArgs open — CONVERGEABLE rake-file-list-egrep-async-open */
  async egrep(pattern: RegExp, ...options: unknown[]): Promise<number> {
    const yieldBlock = rbBlockGivenP(options.at(-1))
      ? (options.pop() as (fn: string, count: number, line: string) => unknown)
      : null;
    let matched = 0;
    await this.each(async (fn) => {
      try {
        let count = 0;
        for (const line of (await File.readAsync(fn)).match(/[^\n]*\n|[^\n]+$/g) ?? []) {
          count += 1;
          if (line.search(pattern) !== -1) {
            matched += 1;
            if (yieldBlock) {
              await yieldBlock(fn, count, line);
            } else {
              puts.call($stdout, `${fn}:${count}:${line}`);
            }
          }
        }
      } catch (ex) {
        if (!(ex instanceof StandardError)) throw ex;
        puts.call($stderr, `Error while processing '${fn}': ${ex.message}`);
      }
    });
    return matched;
  }

  async existing(): Promise<this> {
    return (await this.select((fn) => File.isExistAsync(fn))).uniq();
  }

  async existingBang(): Promise<this> {
    await this.resolve();
    this.items = uniq(
      (await ARRAY_CALLS.select(this.items, ((fn: string) =>
        File.isExistAsync(fn)) as never)) as Items,
    );
    return this;
  }

  async partition(block: ElementBlock): Promise<[this, this]> {
    await this.resolve();
    const result = (await ARRAY_CALLS.partition(this.items, block as never)) as [Items, Items];
    return [
      new (this.constructor as new () => this)().import(result[0]),
      new (this.constructor as new () => this)().import(result[1]),
    ];
  }

  async toS(): Promise<string> {
    await this.resolve();
    return this.join(" ");
  }

  /** @internal */
  private async addMatching(pattern: string): Promise<void> {
    for (const fn of await (this.constructor as typeof FileList).glob(pattern)) {
      if (!(await this.isExcludedFromList(fn))) await this.append(fn);
    }
  }

  async isExcludedFromList(fn: string): Promise<boolean> {
    const hit = await ARRAY_CALLS.isAny(this.excludePatterns, ((pat: unknown) => {
      if (pat instanceof RegExp) return fn != null && pat.test(fn);
      if (typeof pat === "string" && FileList.GLOB_PATTERN.test(pat)) {
        return File.fnmatch(pat, fn, File.FNM_PATHNAME | File.FNM_EXTGLOB);
      }
      return fn === pat;
    }) as never);
    if (hit) return true;
    return ARRAY_CALLS.isAny(this.excludeProcs, ((p: ElementBlock) =>
      p(fn)) as never) as Promise<boolean>;
  }

  static readonly DEFAULT_IGNORE_PATTERNS: RegExp[] = [
    /(^|[/\\])CVS([/\\]|$)/,
    /(^|[/\\])\.svn([/\\]|$)/,
    /\.bak$/,
    /~$/,
  ];
  static readonly DEFAULT_IGNORE_PROCS: ElementBlock[] = [
    async (fn) => /(^|[/\\])core$/.test(fn) && !(await File.isDirectoryAsync(fn)),
  ];

  import(array: Items): this {
    this.items = array;
    return this;
  }

  static get<T extends typeof FileList>(this: T, ...args: unknown[]): InstanceType<T> {
    return new this(...args) as InstanceType<T>;
  }

  static async glob(pattern: string, ...args: [number?]): Promise<string[]> {
    return (await Dir.globAsync(pattern, ...args)).sort();
  }
}

include(FileList, Cloneable);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileList {
  at(i: number): Promise<string | null>;
  fetch(i: number, fallback?: unknown): Promise<unknown>;
  dig(i: number, ...rest: unknown[]): Promise<unknown>;
  slice(start: unknown, length?: number): Promise<unknown>;
  sliceBang(start: unknown, length?: number): Promise<unknown>;
  insert(i: number, ...objs: unknown[]): Promise<this>;
  prepend(...objs: unknown[]): Promise<this>;
  replace(other: unknown): Promise<this>;
  fill(...args: unknown[]): Promise<this>;
  reverseBang(): Promise<this>;
  rotate(cnt?: number): Promise<Items>;
  rotateBang(cnt?: number): Promise<this>;
  shuffle(): Promise<Items>;
  shuffleBang(): Promise<this>;
  sample(n?: number): Promise<unknown>;
  transpose(): Promise<Items>;
  assoc(key: unknown): Promise<unknown>;
  rassoc(value: unknown): Promise<unknown>;
  product(...others: unknown[]): Promise<Items>;
  combination(n: number, block?: (c: string[]) => unknown): Promise<Items>;
  permutation(...args: unknown[]): Promise<Items>;
  repeatedCombination(n: number, block?: (c: string[]) => unknown): Promise<Items>;
  repeatedPermutation(n: number, block?: (c: string[]) => unknown): Promise<Items>;
  pack(...args: unknown[]): Promise<unknown>;
  deconstruct(): Promise<this>;
  entries(): Promise<Items>;
  toH(block?: ElementBlock): Promise<unknown>;
  toSet(): Promise<Set<unknown>>;
  chain(...others: unknown[]): Promise<Items>;
  lazy(): Promise<Items>;
  eachIndex(block?: (i: number) => unknown): Promise<this | number[]>;
  eachEntry(block?: ElementBlock): Promise<unknown>;
  reverseEach(block?: ElementBlock): Promise<this | Items>;
  eachWithObject<M>(memo: M, block: (fn: string, memo: M) => unknown): Promise<M>;
  eachSlice(n: number, block?: (slice: string[]) => unknown): Promise<this | Items>;
  eachCons(n: number, block?: (cons: string[]) => unknown): Promise<this | Items>;
  cycle(...args: unknown[]): Promise<Items | null>;
  selectBang(block: ElementBlock): Promise<this | null>;
  filterBang(block: ElementBlock): Promise<this | null>;
  deleteIf(block: ElementBlock): Promise<this>;
  keepIf(block: ElementBlock): Promise<this>;
  mapBang(block: ElementBlock): Promise<this>;
  collectBang(block: ElementBlock): Promise<this>;
  sortByBang(block: ElementBlock): Promise<this>;
  compactBang(): Promise<this | null>;
  flattenBang(level?: number): Promise<this | null>;
  deleteAt(i: number): Promise<unknown>;
  flatMap(block?: ElementBlock): Promise<Items>;
  collectConcat(block?: ElementBlock): Promise<Items>;
  filterMap(block?: ElementBlock): Promise<Items>;
  filter(block?: ElementBlock): Promise<this>;
  grepV(pattern: unknown, block?: ElementBlock): Promise<Items>;
  groupBy(block: ElementBlock): Promise<unknown>;
  tally(): Promise<unknown>;
  sum(...args: unknown[]): Promise<unknown>;
  reduce(...args: unknown[]): Promise<unknown>;
  detect(...args: unknown[]): Promise<unknown>;
  isAll(...args: unknown[]): Promise<boolean>;
  isNone(...args: unknown[]): Promise<boolean>;
  isOne(...args: unknown[]): Promise<boolean>;
  minmax(block?: (a: string, b: string) => number): Promise<[string | null, string | null]>;
  minBy(...args: unknown[]): Promise<unknown>;
  maxBy(...args: unknown[]): Promise<unknown>;
  minmaxBy(block: ElementBlock): Promise<[unknown, unknown]>;
  rindex(...args: unknown[]): Promise<unknown>;
  findIndex(...args: unknown[]): Promise<unknown>;
  bsearch(block: ElementBlock): Promise<unknown>;
  bsearchIndex(block: ElementBlock): Promise<number | null>;
  takeWhile(block: ElementBlock): Promise<Items>;
  dropWhile(block: ElementBlock): Promise<Items>;
  chunk(block: ElementBlock): Promise<Items>;
  chunkWhile(block: (a: string, b: string) => unknown): Promise<Items>;
  sliceWhen(block: (a: string, b: string) => unknown): Promise<Items>;
  sliceBefore(...args: unknown[]): Promise<Items>;
  sliceAfter(...args: unknown[]): Promise<Items>;
  difference(...others: unknown[]): Promise<Items>;
  union(...others: unknown[]): Promise<Items>;
  intersection(...others: unknown[]): Promise<Items>;
  isIntersect(other: unknown): Promise<boolean>;
  size(): Promise<number>;
  length(): Promise<number>;
  first(n?: number): Promise<string | null | Items>;
  last(n?: number): Promise<string | null | Items>;
  get(start: unknown, length?: number): Promise<unknown>;
  set(...args: unknown[]): Promise<unknown>;
  isEmpty(): Promise<boolean>;
  isInclude(obj: unknown): Promise<boolean>;
  isMember(obj: unknown): Promise<boolean>;
  join(sep?: string | null): Promise<string>;
  concat(...others: unknown[]): Promise<this>;
  push(...objs: unknown[]): Promise<this>;
  pop(n?: number): Promise<string | null | Items>;
  shift(n?: number): Promise<string | null | Items>;
  unshift(...objs: unknown[]): Promise<this>;
  clear(): Promise<this>;
  reverse(): Promise<Items>;
  zip(...others: (Items | FileList)[]): Promise<Items>;
  zip(...others: unknown[]): Promise<Items | null>;
  each(block?: ElementBlock): Promise<unknown>;
  eachWithIndex(block: (fn: string, i: number) => unknown): Promise<this>;
  rejectBang(block: ElementBlock): Promise<this | null>;
  sortBang(block?: (a: string, b: string) => number): Promise<this>;
  uniqBang(block?: ElementBlock): Promise<this | null>;
  inspect(): Promise<string>;
  compare(other: unknown): Promise<number | null>;
  map(block: ElementBlock): Promise<this>;
  collect(block: ElementBlock): Promise<this>;
  sort(block?: (a: string, b: string) => number): Promise<this>;
  sortBy(block: ElementBlock): Promise<this>;
  select(block: ElementBlock): Promise<this>;
  findAll(block: ElementBlock): Promise<this>;
  reject(block: ElementBlock): Promise<this>;
  grep(pattern: unknown, block?: ElementBlock): Promise<this>;
  compact(): Promise<this>;
  flatten(level?: number): Promise<this>;
  uniq(block?: ElementBlock): Promise<this>;
  valuesAt(...selectors: number[]): Promise<this>;
  inject(...args: unknown[]): Promise<unknown>;
  find(...args: unknown[]): Promise<unknown>;
  count(obj?: unknown): Promise<number>;
  isAny(...args: unknown[]): Promise<boolean>;
  min(...args: unknown[]): Promise<unknown>;
  max(...args: unknown[]): Promise<unknown>;
  index(...args: unknown[]): Promise<unknown>;
  delete(obj: unknown, block?: () => unknown): Promise<unknown>;
  take(n: number): Promise<Items>;
  drop(n: number): Promise<Items>;
  plus(other: unknown): Promise<this>;
  minus(other: unknown): Promise<this>;
  and(other: unknown): Promise<this>;
  or(other: unknown): Promise<this>;
}

/** @noRailsEquivalent PERMANENT */
const MUST_DEFINE_CALLS: typeof ARRAY_CALLS = {
  inspect: (items) => rbInspect(items),
  compare: (items, other: Items) => {
    if (!Array.isArray(other)) return null;
    for (let i = 0; i < Math.min(items.length, other.length); i++) {
      if (items[i] !== other[i]) return (items[i] as string) < (other[i] as string) ? -1 : 1;
    }
    return Math.sign(items.length - other.length);
  },
};

for (const sym of FileList.DELEGATING_METHODS) {
  const call = (ARRAY_CALLS[sym] ?? MUST_DEFINE_CALLS[sym]) as (
    items: Items,
    ...args: unknown[]
  ) => unknown;
  const special = FileList.SPECIAL_RETURN.includes(sym);
  Object.defineProperty(FileList.prototype, sym, {
    writable: true,
    configurable: true,
    async value(this: FileList, ...args: unknown[]) {
      const items = await this.toA();
      for (const [i, arg] of args.entries()) {
        if (arg instanceof FileList && sym !== "inject") args[i] = await arg.toAry();
      }
      const result = await call(items, ...args);
      if (special) return new (this.constructor as typeof FileList)().import(result as Items);
      return result === items ? this : result;
    },
  });
}
