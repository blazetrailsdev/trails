/**
 * `Enumerator` (`vendor/ruby/v3.3.11/enumerator.c:411` `enumerator_init`): the
 * receiver, method and arguments a block-less `to_enum` records.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Enumerator {
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
}

/**
 * `Kernel#to_enum` (`vendor/ruby/v3.3.11/enumerator.c:383` `obj_to_enum`), without the
 * size block.
 *
 * @noRailsEquivalent PERMANENT
 */
export function toEnum(obj: object, meth: string = "each", ...args: unknown[]): Enumerator {
  return new Enumerator(obj, meth, args);
}
