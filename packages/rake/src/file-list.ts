import {
  Dir,
  File,
  FrozenError,
  flatten,
  include,
  puts,
  rbBlockGivenP,
  rbCheckArrayType,
  rbInspect,
  rbStrSub,
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

function rtest(value: unknown): boolean {
  return value != null && value !== false;
}

const ARRAY_CALLS: Record<string, (items: Items, ...args: never[]) => unknown> = {
  size: (items) => items.length,
  length: (items) => items.length,
  first: (items) => items[0] ?? null,
  last: (items) => items.at(-1) ?? null,
  get: (items, i: number) => items.at(i) ?? null,
  set: (items, i: number, value: unknown) => (items[i < 0 ? items.length + i : i] = value),
  isEmpty: (items) => items.length === 0,
  isInclude: (items, obj: unknown) => items.includes(obj),
  isMember: (items, obj: unknown) => items.includes(obj),
  join: (items, sep: string = "") => items.join(sep),
  concat: (items, other: Items) => (items.push(...other), items),
  push: (items, ...objs: unknown[]) => (items.push(...objs), items),
  pop: (items) => items.pop() ?? null,
  shift: (items) => items.shift() ?? null,
  unshift: (items, ...objs: unknown[]) => (items.unshift(...objs), items),
  clear: (items) => ((items.length = 0), items),
  reverse: (items) => [...items].reverse(),
  zip: (items, other: Items) => items.map((x, i) => [x, other[i] ?? null]),
  each: async (items, block: ElementBlock) => {
    for (const fn of items) await block(fn as string);
    return items;
  },
  eachWithIndex: async (items, block: (fn: string, i: number) => unknown) => {
    for (const [i, fn] of items.entries()) await block(fn as string, i);
    return items;
  },
  rejectBang: (items, block: ElementBlock) => {
    const kept = items.filter((fn) => !rtest(block(fn as string)));
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
  inspect: (items) => rbInspect(items),
  compare: (items, other: Items) => {
    for (let i = 0; i < Math.min(items.length, other.length); i++) {
      if (items[i] !== other[i]) return (items[i] as string) < (other[i] as string) ? -1 : 1;
    }
    return Math.sign(items.length - other.length);
  },
  map: (items, block: ElementBlock) => items.map((fn) => block(fn as string)),
  collect: (items, block: ElementBlock) => items.map((fn) => block(fn as string)),
  sort: (items) => [...items].sort(),
  sortBy: (items, block: ElementBlock) => sortBy(items as string[], block),
  select: (items, block: ElementBlock) => items.filter((fn) => rtest(block(fn as string))),
  findAll: (items, block: ElementBlock) => items.filter((fn) => rtest(block(fn as string))),
  reject: (items, block: ElementBlock) => items.filter((fn) => !rtest(block(fn as string))),
  grep: (items, pattern: RegExp) => items.filter((fn) => pattern.test(fn as string)),
  compact: (items) => items.filter((fn) => fn != null),
  flatten: (items) => flatten(items),
  uniq: (items) => uniq(items),
  valuesAt: (items, ...selectors: number[]) => selectors.map((i) => items.at(i) ?? null),
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
  static readonly DEFAULT_IGNORE_PATTERNS: RegExp[] = [
    /(^|[/\\])CVS([/\\]|$)/,
    /(^|[/\\])\.svn([/\\]|$)/,
    /\.bak$/,
    /~$/,
  ];
  static readonly DEFAULT_IGNORE_PROCS: ElementBlock[] = [
    async (fn) => /(^|[/\\])core$/.test(fn) && !(await File.isDirectoryAsync(fn)),
  ];

  private pendingAdd: unknown[] = [];
  private pending = false;
  private excludePatterns: unknown[] = [...FileList.DEFAULT_IGNORE_PATTERNS];
  private excludeProcs: ElementBlock[] = [...FileList.DEFAULT_IGNORE_PROCS];
  private items: Items = [];

  static get<T extends typeof FileList>(this: T, ...args: unknown[]): InstanceType<T> {
    return new this(...args) as InstanceType<T>;
  }

  static async glob(pattern: string, ...args: [number?]): Promise<string[]> {
    return (await Dir.globAsync(pattern, ...args)).sort();
  }

  constructor(...patterns: unknown[]) {
    const yieldSelf = rbBlockGivenP(patterns.at(-1))
      ? (patterns.pop() as (fl: this) => void)
      : null;
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
    return (await this.compare(other as Items)) === 0;
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
        : Array.from({ length: other }, () => this.items).flat();
    return Array.isArray(result) ? this.newList().import(result) : result;
  }

  async append(obj: unknown): Promise<this> {
    await this.resolve();
    this.items.push(fromPathname(obj));
    return this;
  }

  async resolve(): Promise<this> {
    if (this.pending) {
      if (Object.isFrozen(this)) {
        throw new FrozenError("can't modify frozen Rake::FileList", { receiver: this });
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

  /**
   * @internal
   * @missingRailsCall order:isExcludedFromList,rejectBang — PERMANENT
   */
  private async resolveExclude(): Promise<this> {
    const excluded = new Set<unknown>();
    for (const fn of this.items) {
      if (await this.isExcludedFromList(fn as string)) excluded.add(fn);
    }
    await this.rejectBang((fn) => excluded.has(fn));
    return this;
  }

  async sub(pat: RegExp | string, rep: string): Promise<this> {
    const res = this.newList();
    for (const fn of await this.toA())
      await res.append(rbStrSub({ string: fn as string }, pat, rep));
    return res;
  }

  async gsub(pat: RegExp | string, rep: string): Promise<this> {
    const res = this.newList();
    for (const fn of await this.toA())
      await res.append(strGsub({ string: fn as string }, [pat, rep], false));
    return res;
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
          if (pattern.test(line)) {
            matched += 1;
            if (yieldBlock) {
              await yieldBlock(fn, count, line);
            } else {
              puts.call($stdout, `${fn}:${count}:${line}`);
            }
          }
        }
      } catch (ex) {
        puts.call($stderr, `Error while processing '${fn}': ${(ex as Error).message}`);
      }
    });
    return matched;
  }

  /** @missingRailsCall select — PERMANENT */
  async existing(): Promise<this> {
    return this.newList().import(await this.selectExisting());
  }

  /** @missingRailsCall select — PERMANENT */
  async existingBang(): Promise<this> {
    this.items = await this.selectExisting();
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  private async selectExisting(): Promise<Items> {
    const found: Items = [];
    for (const fn of await this.toA()) if (await File.isExistAsync(fn as string)) found.push(fn);
    return uniq(found);
  }

  async partition(block: ElementBlock): Promise<[this, this]> {
    await this.resolve();
    return [
      this.newList().import(this.items.filter((fn) => rtest(block(fn as string)))),
      this.newList().import(this.items.filter((fn) => !rtest(block(fn as string)))),
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

  import(array: Items): this {
    this.items = array;
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
  private newList(): this {
    return new (this.constructor as new () => this)();
  }
}

include(FileList, Cloneable);

type Delegated<R> = Promise<R>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface FileList {
  size(): Delegated<number>;
  length(): Delegated<number>;
  first(): Delegated<string | null>;
  last(): Delegated<string | null>;
  get(i: number): Delegated<string | null>;
  set(i: number, value: unknown): Delegated<unknown>;
  isEmpty(): Delegated<boolean>;
  isInclude(obj: unknown): Delegated<boolean>;
  isMember(obj: unknown): Delegated<boolean>;
  join(sep?: string): Delegated<string>;
  concat(other: unknown): Delegated<this>;
  push(...objs: unknown[]): Delegated<this>;
  pop(): Delegated<string | null>;
  shift(): Delegated<string | null>;
  unshift(...objs: unknown[]): Delegated<this>;
  clear(): Delegated<this>;
  reverse(): Delegated<Items>;
  zip(other: unknown): Delegated<Items>;
  each(block: ElementBlock): Delegated<this>;
  eachWithIndex(block: (fn: string, i: number) => unknown): Delegated<this>;
  rejectBang(block: ElementBlock): Delegated<this | null>;
  sortBang(): Delegated<this>;
  uniqBang(): Delegated<this | null>;
  inspect(): Delegated<string>;
  compare(other: unknown): Delegated<number>;
  map(block: ElementBlock): Delegated<this>;
  collect(block: ElementBlock): Delegated<this>;
  sort(): Delegated<this>;
  sortBy(block: ElementBlock): Delegated<this>;
  select(block: ElementBlock): Delegated<this>;
  findAll(block: ElementBlock): Delegated<this>;
  reject(block: ElementBlock): Delegated<this>;
  grep(pattern: RegExp): Delegated<this>;
  compact(): Delegated<this>;
  flatten(): Delegated<this>;
  uniq(): Delegated<this>;
  valuesAt(...selectors: number[]): Delegated<this>;
  plus(other: unknown): Delegated<this>;
  minus(other: unknown): Delegated<this>;
  and(other: unknown): Delegated<this>;
  or(other: unknown): Delegated<this>;
}

for (const sym of FileList.DELEGATING_METHODS) {
  const call = ARRAY_CALLS[sym] as (items: Items, ...args: unknown[]) => unknown;
  const special = FileList.SPECIAL_RETURN.includes(sym);
  Object.defineProperty(FileList.prototype, sym, {
    writable: true,
    configurable: true,
    async value(this: FileList, ...args: unknown[]) {
      const items = await this.toA();
      for (const [i, arg] of args.entries()) {
        if (arg instanceof FileList) args[i] = await arg.toAry();
      }
      const result = await call(items, ...args);
      if (special) return new (this.constructor as typeof FileList)().import(result as Items);
      return result === items ? this : result;
    },
  });
}
