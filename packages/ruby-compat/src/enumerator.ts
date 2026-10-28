import { Fiber } from "./fiber.js";
import { rbBlockGivenP } from "./hash.js";
import { rbFSend, rtest } from "./object.js";
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
  withIndex(offset?: number | null): Enumerator<[T, number], E>;
  /** @noRailsEquivalent PERMANENT */
  withIndex(offset: bigint): Enumerator<[T, bigint], E>;
  /** @noRailsEquivalent PERMANENT */
  withIndex(offset: number | null, block: (value: T, idx: number) => unknown): unknown;
  /** @noRailsEquivalent PERMANENT */
  withIndex(offset: bigint, block: (value: T, idx: bigint) => unknown): unknown;
  /** @noRailsEquivalent PERMANENT */
  withIndex(
    offset: number | bigint | null = null,
    block?: (value: T, idx: never) => unknown,
  ): unknown {
    if (!block)
      return new Enumerator<[T, number], E>(this, "withIndex", [offset], () => this.size());
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
