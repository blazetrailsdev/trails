import {
  Dir,
  StandardError,
  File,
  FrozenError,
  flatten,
  include,
  puts,
  rbBlockGivenP,
  rbCheckArrayType,
  rbEqual,
  rbInspect,
  rbStrSub,
  rtest,
  sortBy,
  stderr as $stderr,
  stdout as $stdout,
  strGsub,
  uniq,
} from "@blazetrails/ruby-compat";
import { Cloneable } from "./cloneable.js";
import { ext as stringExt, pathmap as stringPathmap } from "./ext/string.js";
import { fromPathname } from "./rake-module.js";

type Items = unknown[];
type ElementBlock = (fn: string) => unknown;

async function _filterBy(items: Items, block: ElementBlock, keep: boolean): Promise<Items> {
  const result: Items = [];
  for (const fn of items) if (rtest(await block(fn as string)) === keep) result.push(fn);
  return result;
}

/** @noRailsEquivalent CONVERGEABLE rake-file-list-full-array-delegation */
const ARRAY_CALLS: Record<string, (items: Items, ...args: never[]) => unknown> = {
  size: (items) => items.length,
  length: (items) => items.length,
  first: (items, n?: number) => (n === undefined ? (items[0] ?? null) : items.slice(0, n)),
  last: (items, n?: number) =>
    n === undefined ? (items.at(-1) ?? null) : items.slice(Math.max(items.length - n, 0)),
  get: (items, i: number) => items.at(i) ?? null,
  set: (items, i: number, value: unknown) => (items[i < 0 ? items.length + i : i] = value),
  isEmpty: (items) => items.length === 0,
  isInclude: (items, obj: unknown) => items.includes(obj),
  isMember: (items, obj: unknown) => items.includes(obj),
  join: (items, sep: string = "") => items.join(sep),
  concat: (items, other: Items) => (items.push(...other), items),
  push: (items, ...objs: unknown[]) => (items.push(...objs), items),
  pop: (items, n?: number) =>
    n === undefined ? (items.pop() ?? null) : items.splice(Math.max(items.length - n, 0)),
  shift: (items, n?: number) => (n === undefined ? (items.shift() ?? null) : items.splice(0, n)),
  unshift: (items, ...objs: unknown[]) => (items.unshift(...objs), items),
  clear: (items) => ((items.length = 0), items),
  reverse: (items) => [...items].reverse(),
  zip: (items, ...others: Items[]) => items.map((x, i) => [x, ...others.map((o) => o[i] ?? null)]),
  each: async (items, block: ElementBlock) => {
    for (const fn of items) await block(fn as string);
    return items;
  },
  eachWithIndex: async (items, block: (fn: string, i: number) => unknown) => {
    for (const [i, fn] of items.entries()) await block(fn as string, i);
    return items;
  },
  rejectBang: async (items, block: ElementBlock) => {
    const kept = await _filterBy(items, block, false);
    if (kept.length === items.length) return null;
    items.splice(0, items.length, ...kept);
    return items;
  },
  sortBang: (items) => items.sort(),
  uniqBang: (items) => {
    const kept = uniq(items);
    if (kept.length === items.length) return null;
    items.splice(0, items.length, ...kept);
    return items;
  },
  map: async (items, block: ElementBlock) => {
    const result: Items = [];
    for (const fn of items) result.push(await block(fn as string));
    return result;
  },
  collect: async (items, block: ElementBlock) => {
    const result: Items = [];
    for (const fn of items) result.push(await block(fn as string));
    return result;
  },
  sort: (items) => [...items].sort(),
  sortBy: (items, block: ElementBlock) => sortBy(items as string[], block),
  select: (items, block: ElementBlock) => _filterBy(items, block, true),
  findAll: (items, block: ElementBlock) => _filterBy(items, block, true),
  reject: (items, block: ElementBlock) => _filterBy(items, block, false),
  grep: (items, pattern: RegExp) => items.filter((fn) => (fn as string).search(pattern) !== -1),
  compact: (items) => items.filter((fn) => fn != null),
  flatten: (items) => flatten(items),
  uniq: (items) => uniq(items),
  valuesAt: (items, ...selectors: number[]) => selectors.map((i) => items.at(i) ?? null),
  partition: async (items, block: ElementBlock) => {
    const result: [Items, Items] = [[], []];
    for (const fn of items) result[rtest(await block(fn as string)) ? 0 : 1].push(fn);
    return result;
  },
  toA: (items) => items,
  toAry: (items) => items,
  multiply: (items) => items,
  append: (items, obj: unknown) => (items.push(obj), items),
  inject: async (items, memo: unknown, block: (res: unknown, fn: string) => unknown) => {
    for (const fn of items) memo = await block(memo, fn as string);
    return memo;
  },
  find: async (items, block: ElementBlock) => {
    for (const fn of items) if (rtest(await block(fn as string))) return fn;
    return null;
  },
  count: async (items, obj?: unknown) => {
    if (obj === undefined) return items.length;
    if (typeof obj !== "function") return items.filter((fn) => fn === obj).length;
    return (await _filterBy(items, obj as ElementBlock, true)).length;
  },
  isAny: async (items, block?: ElementBlock) =>
    block ? (await _filterBy(items, block, true)).length > 0 : items.some(rtest),
  min: (items, block?: (a: string, b: string) => number) =>
    [...items].sort(block as never)[0] ?? null,
  max: (items, block?: (a: string, b: string) => number) =>
    [...items].sort(block as never).at(-1) ?? null,
  index: (items, obj: unknown) => (items.includes(obj) ? items.indexOf(obj) : null),
  delete: (items, obj: unknown) => {
    const found = items.includes(obj) ? obj : null;
    items.splice(0, items.length, ...items.filter((fn) => fn !== obj));
    return found;
  },
  take: (items, n: number) => items.slice(0, n),
  drop: (items, n: number) => items.slice(n),
  plus: (items, other: Items) => [...items, ...other],
  minus: (items, other: Items) => items.filter((fn) => !other.includes(fn)),
  and: (items, other: Items) => uniq(items.filter((fn) => other.includes(fn))),
  or: (items, other: Items) => uniq([...items, ...other]),
};

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
    return this.inject(new (this.constructor as new () => this)(), (res, fn) =>
      (res as this).append(rbStrSub({ string: fn }, pat, rep)),
    ) as Promise<this>;
  }

  gsub(pat: RegExp | string, rep: string): Promise<this> {
    return this.inject(new (this.constructor as new () => this)(), (res, fn) =>
      (res as this).append(strGsub({ string: fn }, [pat, rep], false)),
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

  /** @missingRailsCall any? — CONVERGEABLE rake-task-prerequisites-awaiting-map */
  async isExcludedFromList(fn: string): Promise<boolean> {
    for (const pat of this.excludePatterns) {
      let hit: boolean;
      if (pat instanceof RegExp) {
        hit = fn != null && pat.test(fn);
      } else if (typeof pat === "string" && FileList.GLOB_PATTERN.test(pat)) {
        hit = File.fnmatch(pat, fn, File.FNM_PATHNAME | File.FNM_EXTGLOB);
      } else {
        hit = fn === pat;
      }
      if (hit) return true;
    }
    for (const p of this.excludeProcs) if (rtest(await p(fn))) return true;
    return false;
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
  size(): Promise<number>;
  length(): Promise<number>;
  first(n?: number): Promise<string | null | Items>;
  last(n?: number): Promise<string | null | Items>;
  get(i: number): Promise<string | null>;
  set(i: number, value: unknown): Promise<unknown>;
  isEmpty(): Promise<boolean>;
  isInclude(obj: unknown): Promise<boolean>;
  isMember(obj: unknown): Promise<boolean>;
  join(sep?: string): Promise<string>;
  concat(other: unknown): Promise<this>;
  push(...objs: unknown[]): Promise<this>;
  pop(n?: number): Promise<string | null | Items>;
  shift(n?: number): Promise<string | null | Items>;
  unshift(...objs: unknown[]): Promise<this>;
  clear(): Promise<this>;
  reverse(): Promise<Items>;
  zip(...others: unknown[]): Promise<Items>;
  each(block: ElementBlock): Promise<this>;
  eachWithIndex(block: (fn: string, i: number) => unknown): Promise<this>;
  rejectBang(block: ElementBlock): Promise<this | null>;
  sortBang(): Promise<this>;
  uniqBang(): Promise<this | null>;
  inspect(): Promise<string>;
  compare(other: unknown): Promise<number | null>;
  map(block: ElementBlock): Promise<this>;
  collect(block: ElementBlock): Promise<this>;
  sort(): Promise<this>;
  sortBy(block: ElementBlock): Promise<this>;
  select(block: ElementBlock): Promise<this>;
  findAll(block: ElementBlock): Promise<this>;
  reject(block: ElementBlock): Promise<this>;
  grep(pattern: RegExp): Promise<this>;
  compact(): Promise<this>;
  flatten(): Promise<this>;
  uniq(): Promise<this>;
  valuesAt(...selectors: number[]): Promise<this>;
  inject(memo: unknown, block: (res: unknown, fn: string) => unknown): Promise<unknown>;
  find(block: ElementBlock): Promise<string | null>;
  count(obj?: unknown): Promise<number>;
  isAny(block?: ElementBlock): Promise<boolean>;
  min(block?: (a: string, b: string) => number): Promise<string | null>;
  max(block?: (a: string, b: string) => number): Promise<string | null>;
  index(obj: unknown): Promise<number | null>;
  delete(obj: unknown): Promise<unknown>;
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
