import { Hash } from "./hash.js";

const JsSet = globalThis.Set;

/**
 * Ruby's `Set` (`vendor/ruby/v3.3.11/lib/set.rb:228`), which keeps its members
 * as the keys of a `Hash` and so compares them by `eql?`: `[1, 2]` added twice
 * is one member. It extends the JS `Set`, which holds the same members for
 * `size` and iteration.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Set<T> extends JsSet<T> {
  #hash = new Hash<T, T>();

  /**
   * `Set#initialize` (`vendor/ruby/v3.3.11/lib/set.rb:243`).
   * @noRailsEquivalent PERMANENT
   */
  constructor(enumerable: Iterable<T> | null = null) {
    super();
    if (enumerable == null) return;
    for (const o of enumerable) this.add(o);
  }

  /**
   * `Set#include?` (`vendor/ruby/v3.3.11/lib/set.rb:393`).
   * @noRailsEquivalent PERMANENT
   */
  override has(o: T): boolean {
    return this.#hash.has(o);
  }

  /**
   * `Set#add` (`vendor/ruby/v3.3.11/lib/set.rb:511`).
   * @noRailsEquivalent PERMANENT
   */
  override add(o: T): this {
    if (!this.#hash.has(o)) {
      this.#hash.set(o, o);
      super.add(o);
    }
    return this;
  }

  /**
   * `Set#delete` (`vendor/ruby/v3.3.11/lib/set.rb:529`). It answers the JS
   * `Set#delete` boolean, which is `Set#delete?`'s truthiness.
   * @noRailsEquivalent PERMANENT
   */
  override delete(o: T): boolean {
    if (!this.#hash.has(o)) return false;
    const member = this.#hash.get(o) as T;
    this.#hash.delete(o);
    return super.delete(member);
  }

  /**
   * `Set#clear` (`vendor/ruby/v3.3.11/lib/set.rb:316`).
   * @noRailsEquivalent PERMANENT
   */
  override clear(): void {
    this.#hash.clear();
    super.clear();
  }

  /**
   * `Set#subtract` (`vendor/ruby/v3.3.11/lib/set.rb:609`).
   * @noRailsEquivalent PERMANENT
   */
  subtract(enumerable: Iterable<T>): this {
    for (const o of enumerable) this.delete(o);
    return this;
  }
}
