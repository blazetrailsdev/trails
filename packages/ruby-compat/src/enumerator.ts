import { Fiber } from "./fiber.js";
import { rbBlockGivenP } from "./hash.js";
import { rbFSend, rtest } from "./object.js";
import { StopIteration } from "./stop-iteration.js";

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
export class Enumerator<T = unknown> {
  private obj: object;
  private fib: Fiber<unknown> | null = null;
  private stopExc: StopIteration | null = null;

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
  ) {
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
   * `Enumerable#to_a` (`vendor/ruby/v3.3.11/enum.c:711` `enum_to_a`).
   *
   * @noRailsEquivalent PERMANENT
   */
  toA(): T[] {
    return [...this];
  }

  /**
   * `enumerator_each` (`vendor/ruby/v3.3.11/enumerator.c:613`) run to completion
   * into a snapshot, which a `for…of` then walks. A multi-value yield is packed
   * into one Array (`vendor/ruby/v3.3.11/enum.c:53` `rb_enum_values_pack`).
   *
   * @noRailsEquivalent PERMANENT
   */
  *[Symbol.iterator](): globalThis.Generator<T> {
    const buffer: T[] = [];
    this.each((...values: T[]) => buffer.push(values.length <= 1 ? values[0] : (values as T)));
    yield* buffer;
  }
}

/**
 * `Kernel#to_enum` (`vendor/ruby/v3.3.11/enumerator.c:383` `obj_to_enum`), without the
 * size block.
 *
 * @noRailsEquivalent PERMANENT
 */
export function toEnum<T = unknown>(
  obj: object,
  meth: string = "each",
  ...args: unknown[]
): Enumerator<T> {
  return new Enumerator<T>(obj, meth, args);
}
