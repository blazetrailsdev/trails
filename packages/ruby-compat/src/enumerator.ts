import { Fiber } from "./fiber.js";
import { rbBlockGivenP } from "./hash.js";
import { rbFSend, rbInspect, rbObjRespondTo, rtest } from "./object.js";
import { ArgumentError } from "./argument-error.js";
import { rbEql, rbEqq } from "./rb-equal.js";
import type { Enumerated } from "./enumerable.js";
import { StopIteration } from "./stop-iteration.js";
import { FloatDomainError } from "./float-domain-error.js";
import { num2long } from "./string/support.js";

/**
 * `Enumerator::Yielder` (`vendor/ruby/v3.3.11/enumerator.c:1335` `yielder_init`).
 *
 * @noRailsEquivalent PERMANENT
 */
class Yielder<T> {
  /** @noRailsEquivalent PERMANENT */
  constructor(private proc: (value: T) => unknown) {}

  /**
   * `yielder_yield` (`vendor/ruby/v3.3.11/enumerator.c:1361`).
   *
   * @noRailsEquivalent PERMANENT
   */
  yield(value: T): unknown {
    return this.proc(value);
  }
}

/**
 * `Enumerator::Generator` (`vendor/ruby/v3.3.11/enumerator.c:1467` `generator_init`).
 *
 * @noRailsEquivalent PERMANENT
 */
class Generator<T> {
  /** @noRailsEquivalent PERMANENT */
  constructor(private proc: (yielder: Yielder<T>) => unknown) {}

  /**
   * `generator_each` (`vendor/ruby/v3.3.11/enumerator.c:1533`).
   *
   * @noRailsEquivalent PERMANENT
   */
  each(block: (value: T) => unknown): unknown {
    return this.proc(new Yielder(block));
  }
}

/**
 * `Enumerator` (`vendor/ruby/v3.3.11/enumerator.c:411` `enumerator_init`): the
 * receiver, method and arguments a block-less `to_enum` records.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Enumerator<T = unknown, E = unknown> {
  /** @noRailsEquivalent PERMANENT */
  static Lazy: typeof Lazy;
  /** @noRailsEquivalent PERMANENT */
  static Chain: typeof Chain;

  private obj: object;
  private fib: Fiber<unknown> | null = null;
  private stopExc: StopIteration | null = null;
  #size: ((...args: unknown[]) => unknown) | null;

  /**
   * `enumerator_init`, and `Enumerator.new`
   * (`vendor/ruby/v3.3.11/enumerator.c:480` `enumerator_initialize`), whose
   * block becomes a `Generator` the enumerator sends `each`.
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(
    obj: object,
    private meth: string = "each",
    private args: unknown[] = [],
    size: ((...args: unknown[]) => unknown) | null = null,
  ) {
    this.#size = size;
    this.obj = rbBlockGivenP(obj)
      ? new Generator(obj as unknown as (yielder: Yielder<T>) => unknown)
      : obj;
  }

  /**
   * `enumerator_next` (`vendor/ruby/v3.3.11/enumerator.c:921`), over
   * `get_next_values` (`:786`): the enumeration runs in a `Fiber` of its own,
   * resumed once per element. A JS body suspends only at an `await`, so the
   * generator awaits `yielder.yield` and `next` answers a promise. `peek`'s
   * lookahead and `rewind` are not ported.
   *
   * @noRailsEquivalent PERMANENT
   */
  async next(): Promise<T> {
    if (this.stopExc) throw this.stopExc;
    if (!this.fib || !this.fib.isAlive()) {
      this.fib = new Fiber(() => this.nextI());
    }
    const vs = await this.fib.resume();
    if (this.stopExc) {
      this.fib = null;
      throw this.stopExc;
    }
    return vs as T;
  }

  /** `next_i` (`vendor/ruby/v3.3.11/enumerator.c:764`). */
  private async nextI(): Promise<void> {
    await this.each((value: T) => Fiber.yield(value));
    this.stopExc = new StopIteration("iteration reached an end");
    return Fiber.yield(null);
  }

  /**
   * `enumerator_each` (`vendor/ruby/v3.3.11/enumerator.c:613`), without its
   * appending-arguments arm.
   *
   * @noRailsEquivalent PERMANENT
   */
  each(block?: (...args: never[]) => unknown): unknown {
    if (!block) return this;
    return rbFSend(this.obj, this.meth, ...this.args, block);
  }

  /**
   * `Enumerable#all?` (`vendor/ruby/v3.3.11/enum.c:1799` `enum_all`), which
   * stops iterating at the first element the block rejects.
   *
   * @noRailsEquivalent CONVERGEABLE system-call-error-instanceof-reads-an-errno-table-and-all-takes-a-pattern
   */
  isAll(block: (value: T) => unknown): boolean {
    const stop = {};
    try {
      this.each((value: T) => {
        if (!rtest(block(value))) throw stop;
      });
    } catch (error) {
      if (error !== stop) throw error;
      return false;
    }
    return true;
  }

  /**
   * `enumerator_with_index` (`vendor/ruby/v3.3.11/enumerator.c:676`), over
   * `enumerator_with_index_i` (`:642`), which packs a multi-value yield into
   * one Array before the index. Block-less, it answers an enumerator over
   * itself sized by `enumerator_enum_size`. The offset goes through `rb_to_int`,
   * whose Float arm (`flo_to_i`) raises `FloatDomainError` for a non-finite value.
   *
   * @noRailsEquivalent PERMANENT
   */
  withIndex(offset?: null): Enumerator<[T, number], E>;
  /** @noRailsEquivalent PERMANENT */
  withIndex(offset: number): Enumerator<[T, number | bigint], E>;
  /** @noRailsEquivalent PERMANENT */
  withIndex(offset: bigint): Enumerator<[T, bigint], E>;
  /** @noRailsEquivalent PERMANENT */
  withIndex(offset: null, block: (value: T, idx: number) => unknown): unknown;
  /** @noRailsEquivalent PERMANENT */
  withIndex(offset: number, block: (value: T, idx: number | bigint) => unknown): unknown;
  /** @noRailsEquivalent PERMANENT */
  withIndex(offset: bigint, block: (value: T, idx: bigint) => unknown): unknown;
  /** @noRailsEquivalent PERMANENT */
  withIndex(
    offset: number | bigint | null = null,
    block?: (value: T, idx: never) => unknown,
  ): unknown {
    if (!block)
      return new Enumerator<[T, number | bigint], E>(this, "withIndex", [offset], () =>
        this.size(),
      );
    let memo: number | bigint;
    if (offset == null) memo = 0;
    else if (typeof offset === "bigint") memo = offset;
    else if (typeof offset === "number") {
      if (!Number.isFinite(offset)) throw new FloatDomainError(String(offset));
      memo = Math.trunc(offset);
      if (!Number.isSafeInteger(memo)) memo = BigInt(memo);
    } else memo = num2long(offset);
    return this.each((...argv: unknown[]) => {
      const idx = memo;
      memo =
        typeof memo === "bigint"
          ? memo + 1n
          : Number.isSafeInteger(memo + 1)
            ? memo + 1
            : BigInt(memo) + 1n;
      if (argv.length <= 1) return block(argv[0] as T, idx as never);
      return block(argv as T, idx as never);
    });
  }

  /**
   * `enumerator_size` (`vendor/ruby/v3.3.11/enumerator.c:1245`): the size block
   * `to_enum` was given, called with the recorded arguments, else `nil`.
   *
   * @noRailsEquivalent PERMANENT
   */
  size(): unknown {
    return this.#size ? this.#size(...this.args) : null;
  }

  /**
   * `Enumerable#to_a` (`vendor/ruby/v3.3.11/enum.c:711` `enum_to_a`): what
   * `each` yields, packed as `rb_enum_values_pack` (`enum.c:53`) packs a
   * multi-value yield. Over an `each` that answers a promise, a promise of them.
   *
   * @noRailsEquivalent PERMANENT
   */
  toA(): Enumerated<E, T[]> {
    const ary: T[] = [];
    const each = this.each((...values: T[]) =>
      ary.push(values.length <= 1 ? values[0] : (values as T)),
    );
    if (each != null && typeof (each as PromiseLike<unknown>).then === "function") {
      return Promise.resolve(each as PromiseLike<unknown>).then(() => ary) as Enumerated<E, T[]>;
    }
    return ary as Enumerated<E, T[]>;
  }

  /**
   * `enumerable_lazy` (`vendor/ruby/v3.3.11/enumerator.c:1937`).
   *
   * @noRailsEquivalent PERMANENT
   */
  lazy(): Lazy<T> {
    return enumerableLazy<T>(this, () => this.size());
  }

  /**
   * `enum_chain` (`vendor/ruby/v3.3.11/enumerator.c:3371`).
   *
   * @noRailsEquivalent PERMANENT
   */
  chain(...enums: object[]): Enumerator<T> {
    return enumChain<T>(this, ...enums);
  }

  /**
   * `enumerator_plus` (`vendor/ruby/v3.3.11/enumerator.c:3389`).
   *
   * @noRailsEquivalent PERMANENT
   */
  plus(eobj: object): Enumerator<T> {
    return enumChain<T>(this, eobj);
  }

  /**
   * `enumerator_each` (`vendor/ruby/v3.3.11/enumerator.c:613`) run to completion
   * into a snapshot, which a `for…of` then walks.
   *
   * @noRailsEquivalent PERMANENT
   */
  *[Symbol.iterator](): globalThis.Generator<T> {
    yield* this.toA() as T[];
  }

  /** @noRailsEquivalent PERMANENT */
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    yield* await this.toA();
  }
}

/**
 * `Kernel#to_enum` (`vendor/ruby/v3.3.11/enumerator.c:383` `obj_to_enum`). A
 * trailing `block()`-marked function is the size block.
 *
 * @noRailsEquivalent PERMANENT
 */
export function toEnum<T = unknown>(
  obj: object,
  meth: string = "each",
  ...args: unknown[]
): Enumerator<T> {
  const size = rbBlockGivenP(args.at(-1)) ? (args.pop() as (...args: unknown[]) => unknown) : null;
  return new Enumerator<T>(obj, meth, args, size);
}

type _LazyYielder = { yield(value: unknown): unknown };
type _LazyProc = (yielder: _LazyYielder, value: never, memos: Record<string, unknown>) => unknown;

/** `LAZY_MEMO_BREAK` (`vendor/ruby/v3.3.11/enumerator.c:125`). */
const _LAZY_BREAK = {};

/**
 * `Enumerator::Lazy` (`vendor/ruby/v3.3.11/enumerator.c:1804` `lazy_initialize`).
 * MRI folds a chain of operations into one `procs` array as an optimization; here
 * each operation is a `Lazy` over the one before, the shape `Lazy.new` documents,
 * and its `memos` are created per `each`. `block` is `(yielder, value, memos)`.
 * `each` and every block are synchronous: an async block's promise is read as a
 * value, as `next` is the only member that suspends.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Lazy<T = unknown> extends Enumerator<T> {
  private _source: object;
  private _block: _LazyProc;

  /** @noRailsEquivalent PERMANENT */
  constructor(obj: object, block?: _LazyProc, size: (() => unknown) | null = null) {
    if (!block) throw new ArgumentError("tried to call lazy new without a block");
    super(obj, "each", [], size);
    this._source = obj;
    this._block = block;
  }

  /**
   * `lazy_init_block` (`vendor/ruby/v3.3.11/enumerator.c:1661`). A break raised
   * by this or a later operation unwinds the source's `each`.
   *
   * @noRailsEquivalent PERMANENT
   */
  override each(block?: (...args: never[]) => unknown): unknown {
    if (!block) return this;
    const yielder = new Yielder<unknown>(block as (value: unknown) => unknown);
    const memos = {};
    try {
      rbFSend(this._source, "each", (...values: unknown[]) =>
        this._block(yielder, (values.length <= 1 ? values[0] : values) as never, memos),
      );
    } catch (error) {
      if (error !== _LAZY_BREAK) throw error;
    }
    return this;
  }

  /**
   * `lazy_map` (`vendor/ruby/v3.3.11/enumerator.c:2068`).
   *
   * @noRailsEquivalent PERMANENT
   */
  map<U>(block: (value: T) => U): Lazy<U> {
    if (!block) throw new ArgumentError("tried to call lazy map without a block");
    return new Lazy<U>(
      this,
      (y, v) => y.yield(block(v)),
      () => this.size(),
    );
  }

  /**
   * `lazy_flat_map` (`vendor/ruby/v3.3.11/enumerator.c:2153`).
   *
   * @noRailsEquivalent PERMANENT
   */
  flatMap<U = unknown>(block: (value: T) => unknown): Lazy<U> {
    if (!block) throw new ArgumentError("tried to call lazy flat_map without a block");
    return new Lazy<U>(this, (y, v) => {
      const value = block(v);
      if (Array.isArray(value)) {
        for (const x of value) y.yield(x);
      } else if (rbObjRespondTo(value, "force") && rbObjRespondTo(value, "each")) {
        rbFSend(value, "each", (x: unknown) => y.yield(x));
      } else {
        y.yield(value);
      }
    });
  }

  /**
   * `lazy_select` (`vendor/ruby/v3.3.11/enumerator.c:2183`).
   *
   * @noRailsEquivalent PERMANENT
   */
  select(block: (value: T) => unknown): Lazy<T> {
    if (!block) throw new ArgumentError("tried to call lazy select without a block");
    return new Lazy<T>(this, (y, v) => {
      if (rtest(block(v))) y.yield(v);
    });
  }

  /**
   * `lazy_filter_map` (`vendor/ruby/v3.3.11/enumerator.c:2217`).
   *
   * @noRailsEquivalent PERMANENT
   */
  filterMap<U = unknown>(block: (value: T) => unknown): Lazy<U> {
    if (!block) throw new ArgumentError("tried to call lazy filter_map without a block");
    return new Lazy<U>(this, (y, v) => {
      const value = block(v);
      if (rtest(value)) y.yield(value);
    });
  }

  /**
   * `lazy_reject` (`vendor/ruby/v3.3.11/enumerator.c:2246`).
   *
   * @noRailsEquivalent PERMANENT
   */
  reject(block: (value: T) => unknown): Lazy<T> {
    if (!block) throw new ArgumentError("tried to call lazy reject without a block");
    return new Lazy<T>(this, (y, v) => {
      if (!rtest(block(v))) y.yield(v);
    });
  }

  /**
   * `lazy_grep` (`vendor/ruby/v3.3.11/enumerator.c:2295`).
   *
   * @noRailsEquivalent PERMANENT
   */
  grep(pattern: unknown, block?: (value: T) => unknown): Lazy {
    return new Lazy(this, (y, v) => {
      if (rtest(rbEqq(pattern, v))) y.yield(block ? block(v) : v);
    });
  }

  /**
   * `lazy_grep_v` (`vendor/ruby/v3.3.11/enumerator.c:2342`).
   *
   * @noRailsEquivalent PERMANENT
   */
  grepV(pattern: unknown, block?: (value: T) => unknown): Lazy {
    return new Lazy(this, (y, v) => {
      if (!rtest(rbEqq(pattern, v))) y.yield(block ? block(v) : v);
    });
  }

  /**
   * `lazy_zip` (`vendor/ruby/v3.3.11/enumerator.c:2422`). `Enumerator#next` is
   * async here, so a non-Array argument is read whole with `to_a` at the call.
   *
   * @noRailsEquivalent PERMANENT
   */
  zip(...args: unknown[]): Lazy<unknown[]> {
    const ary = args.map((arg) => {
      if (Array.isArray(arg)) return arg as unknown[];
      if (!rbObjRespondTo(arg, "each")) {
        const klass = (arg as object | null)?.constructor?.name ?? "NilClass";
        throw new TypeError(`wrong argument type ${klass} (must respond to :each)`);
      }
      return new Enumerator<unknown>(arg as object).toA();
    });
    return new Lazy<unknown[]>(
      this,
      (y, v, memos) => {
        const i = (memos.index as number | undefined) ?? 0;
        memos.index = i + 1;
        y.yield([v, ...ary.map((a) => a[i] ?? null)]);
      },
      () => this.size(),
    );
  }

  /**
   * `lazy_take` (`vendor/ruby/v3.3.11/enumerator.c:2497`).
   *
   * @noRailsEquivalent PERMANENT
   */
  take(n: number): Lazy<T> {
    if (n < 0) throw new ArgumentError("attempt to take negative size");
    const size = () => {
      const receiver = this.size();
      return receiver == null ? null : Math.min(n, receiver as number);
    };
    if (n === 0) return new Lazy<T>([], (y, v) => y.yield(v), size);
    return new Lazy<T>(
      this,
      (y, v, memos) => {
        const remain = ((memos.remain as number | undefined) ?? n) - 1;
        memos.remain = remain;
        y.yield(v);
        if (remain === 0) throw _LAZY_BREAK;
      },
      size,
    );
  }

  /**
   * `lazy_take_while` (`vendor/ruby/v3.3.11/enumerator.c:2533`).
   *
   * @noRailsEquivalent PERMANENT
   */
  takeWhile(block: (value: T) => unknown): Lazy<T> {
    if (!block) throw new ArgumentError("tried to call lazy take_while without a block");
    return new Lazy<T>(this, (y, v) => {
      if (!rtest(block(v))) throw _LAZY_BREAK;
      y.yield(v);
    });
  }

  /**
   * `lazy_drop` (`vendor/ruby/v3.3.11/enumerator.c:2587`).
   *
   * @noRailsEquivalent PERMANENT
   */
  drop(n: number): Lazy<T> {
    if (n < 0) throw new ArgumentError("attempt to drop negative size");
    return new Lazy<T>(
      this,
      (y, v, memos) => {
        const remain = (memos.remain as number | undefined) ?? n;
        if (remain > 0) memos.remain = remain - 1;
        else y.yield(v);
      },
      () => {
        const receiver = this.size();
        return receiver == null ? null : Math.max((receiver as number) - n, 0);
      },
    );
  }

  /**
   * `lazy_drop_while` (`vendor/ruby/v3.3.11/enumerator.c:2631`).
   *
   * @noRailsEquivalent PERMANENT
   */
  dropWhile(block: (value: T) => unknown): Lazy<T> {
    if (!block) throw new ArgumentError("tried to call lazy drop_while without a block");
    return new Lazy<T>(this, (y, v, memos) => {
      if (!memos.dropped) {
        if (rtest(block(v))) return;
        memos.dropped = true;
      }
      y.yield(v);
    });
  }

  /**
   * `lazy_uniq` (`vendor/ruby/v3.3.11/enumerator.c:2686`).
   *
   * @noRailsEquivalent PERMANENT
   */
  uniq(block?: (value: T) => unknown): Lazy<T> {
    return new Lazy<T>(this, (y, v, memos) => {
      const seen = (memos.seen ??= []) as unknown[];
      const key = block ? block(v) : v;
      if (seen.some((other) => rbEql(other, key))) return;
      seen.push(key);
      y.yield(v);
    });
  }

  /**
   * `lazy_compact` (`vendor/ruby/v3.3.11/enumerator.c:2712`).
   *
   * @noRailsEquivalent PERMANENT
   */
  compact(): Lazy<NonNullable<T>> {
    return new Lazy<NonNullable<T>>(this, (y, v) => {
      if (v != null) y.yield(v);
    });
  }

  /**
   * `lazy_with_index` (`vendor/ruby/v3.3.11/enumerator.c:2770`).
   *
   * @noRailsEquivalent PERMANENT
   */
  override withIndex(offset?: unknown, block?: unknown): never {
    const memo = (offset as number | null | undefined) ?? 0;
    return new Lazy(
      this,
      (y, v, memos) => {
        const idx = (memos.idx as number | undefined) ?? memo;
        memos.idx = idx + 1;
        if (block) {
          (block as (value: unknown, idx: number) => unknown)(v, idx);
          y.yield(v);
        } else {
          y.yield([v, idx]);
        }
      },
      () => this.size(),
    ) as never;
  }

  /**
   * `Enumerable#first` (`vendor/ruby/v3.3.11/enum.c:1095` `enum_first`).
   *
   * @noRailsEquivalent PERMANENT
   */
  first(): T | null;
  /** @noRailsEquivalent PERMANENT */
  first(n: number): T[];
  /** @noRailsEquivalent PERMANENT */
  first(n?: number): T | T[] | null {
    if (n !== undefined) return this.take(n).toA();
    return this.take(1).toA()[0] ?? null;
  }

  /**
   * `lazy_to_a` (`vendor/ruby/v3.3.11/enumerator.c:1835`), aliased `force`.
   *
   * @noRailsEquivalent PERMANENT
   */
  force(): T[] {
    return this.toA();
  }

  /**
   * `lazy_eager` (`vendor/ruby/v3.3.11/enumerator.c:2008`).
   *
   * @noRailsEquivalent PERMANENT
   */
  eager(): Enumerator<T> {
    return new Enumerator<T>(this, "each", [], () => this.size());
  }

  /**
   * `lazy_lazy` (`vendor/ruby/v3.3.11/enumerator.c:2855`).
   *
   * @noRailsEquivalent PERMANENT
   */
  override lazy(): Lazy<T> {
    return this;
  }
}

/**
 * `enumerable_lazy` (`vendor/ruby/v3.3.11/enumerator.c:1937`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function enumerableLazy<T = unknown>(
  obj: object,
  size: (() => unknown) | null = null,
): Lazy<T> {
  return new Lazy<T>(obj, (y, v) => y.yield(v), size);
}

/**
 * `Enumerator::Chain` (`vendor/ruby/v3.3.11/enumerator.c:3176` `enum_chain_initialize`).
 * `rewind` is not ported, as `Enumerator#rewind` is not.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Chain<T = unknown> extends Enumerator<T> {
  private _enums: readonly object[];

  /** @noRailsEquivalent PERMANENT */
  constructor(...enums: object[]) {
    super(enums);
    this._enums = Object.freeze(enums);
  }

  /**
   * `enum_chain_each` (`vendor/ruby/v3.3.11/enumerator.c:3287`).
   *
   * @noRailsEquivalent PERMANENT
   */
  override each(block?: (...args: never[]) => unknown): unknown {
    if (!block) return this;
    for (const e of this._enums) rbFSend(e, "each", block);
    return this;
  }

  /**
   * `enum_chain_total_size` (`vendor/ruby/v3.3.11/enumerator.c:3226`).
   *
   * @noRailsEquivalent PERMANENT
   */
  override size(): unknown {
    let total = 0;
    for (const e of this._enums) {
      const size = Array.isArray(e)
        ? e.length
        : rbObjRespondTo(e, "size")
          ? rbFSend(e, "size")
          : null;
      if (size == null || size === Infinity) return size ?? null;
      if (typeof size !== "number" || !Number.isInteger(size)) return null;
      total += size;
    }
    return total;
  }

  /**
   * `enum_chain_inspect` (`vendor/ruby/v3.3.11/enumerator.c:3355`).
   *
   * @noRailsEquivalent PERMANENT
   */
  inspect(): string {
    return `#<Enumerator::Chain: ${rbInspect([...this._enums])}>`;
  }
}

/**
 * `enum_chain` (`vendor/ruby/v3.3.11/enumerator.c:3371`), over `new_enum_chain` (`:3191`).
 *
 * @noRailsEquivalent PERMANENT
 */
export function enumChain<T = unknown>(obj: object, ...enums: object[]): Enumerator<T> {
  const all = [obj, ...enums];
  const chain = new Chain<T>(...all);
  if (all.some((e) => e instanceof Lazy)) return enumerableLazy<T>(chain, () => chain.size());
  return chain;
}

Enumerator.Lazy = Lazy;
Enumerator.Chain = Chain;
