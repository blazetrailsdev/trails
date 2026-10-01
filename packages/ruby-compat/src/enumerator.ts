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
   * `enumerator_next` (`vendor/ruby/v3.3.11/enumerator.c:921`), the external
   * iteration a `for…of` drives.
   *
   * @noRailsEquivalent PERMANENT
   */
  *[Symbol.iterator](): Generator<T> {
    const buffer: T[] = [];
    this.each(((value: T) => buffer.push(value)) as (...args: never[]) => unknown);
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
