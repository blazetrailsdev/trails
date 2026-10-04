import { rtest } from "./object.js";

/**
 * `Enumerator` (`vendor/ruby/v3.3.11/enumerator.c:411` `enumerator_init`): the
 * receiver, method and arguments a block-less `to_enum` records.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Enumerator<T = unknown> {
  /** @noRailsEquivalent PERMANENT */
  constructor(
    private obj: object,
    private meth: string,
    private args: unknown[],
  ) {}

  /**
   * `enumerator_each` (`vendor/ruby/v3.3.11/enumerator.c:613`), without its
   * appending-arguments arm.
   *
   * @noRailsEquivalent PERMANENT
   */
  each(block?: (...args: never[]) => unknown): unknown {
    if (!block) return this;
    const meth = (this.obj as Record<string, (...args: unknown[]) => unknown>)[this.meth];
    return meth.call(this.obj, ...this.args, block);
  }

  /**
   * `Enumerable#all?` (`vendor/ruby/v3.3.11/enum.c:1799` `enum_all`), which
   * stops iterating at the first element the block rejects.
   *
   * @noRailsEquivalent PERMANENT
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
   * `enumerator_each` (`vendor/ruby/v3.3.11/enumerator.c:613`) run to completion
   * into a snapshot, which a `for…of` then walks.
   *
   * @noRailsEquivalent PERMANENT
   */
  *[Symbol.iterator](): Generator<T> {
    const buffer: T[] = [];
    this.each((value: T) => buffer.push(value));
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
