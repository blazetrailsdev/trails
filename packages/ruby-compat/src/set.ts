import { Hash } from "./hash.js";
import { rbDeclareIvar } from "./object.js";

const JsSet = globalThis.Set;

/**
 * Ruby's `Set` (`vendor/ruby/v3.3.11/lib/set.rb:228`), which keeps its members
 * as the keys of the `Hash` in `@hash` and so compares them by `eql?`:
 * `[1, 2]` added twice is one member. It extends the JS `Set` for `instanceof`
 * and answers every read from `@hash`, the one ivar `Marshal` dumps.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Set<T> extends JsSet<T> {
  /** @noRailsEquivalent PERMANENT */
  _hash = new Hash<T, true>(false as true);

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
   * `Set#compare_by_identity` (`vendor/ruby/v3.3.11/lib/set.rb:257`).
   * @noRailsEquivalent PERMANENT
   */
  compareByIdentity(): this {
    this._hash.compareByIdentity();
    return this;
  }

  /**
   * `Set#compare_by_identity?` (`vendor/ruby/v3.3.11/lib/set.rb:268`).
   * @noRailsEquivalent PERMANENT
   */
  isCompareByIdentity(): boolean {
    return this._hash.isCompareByIdentity();
  }

  /**
   * `Set#size` (`vendor/ruby/v3.3.11/lib/set.rb:301`).
   * @noRailsEquivalent PERMANENT
   */
  override get size(): number {
    return this._hash.size;
  }

  /**
   * `Set#clear` (`vendor/ruby/v3.3.11/lib/set.rb:316`).
   * @noRailsEquivalent PERMANENT
   */
  override clear(): void {
    this._hash.clear();
  }

  /**
   * `Set#include?` (`vendor/ruby/v3.3.11/lib/set.rb:393`).
   * @noRailsEquivalent PERMANENT
   */
  override has(o: T): boolean {
    return this._hash.has(o);
  }

  /**
   * `Set#each` (`vendor/ruby/v3.3.11/lib/set.rb:499`), `@hash.each_key`.
   * @noRailsEquivalent PERMANENT
   */
  override *[Symbol.iterator](): Generator<T, undefined, unknown> {
    for (const [o] of this._hash) yield o;
  }

  /**
   * `Set#values`, the walk of `Set#each` (`vendor/ruby/v3.3.11/lib/set.rb:499`).
   * @noRailsEquivalent PERMANENT
   */
  override values(): Generator<T, undefined, unknown> {
    return this[Symbol.iterator]();
  }

  /**
   * `Set#keys`, the walk of `Set#each` (`vendor/ruby/v3.3.11/lib/set.rb:499`).
   * @noRailsEquivalent PERMANENT
   */
  override keys(): Generator<T, undefined, unknown> {
    return this[Symbol.iterator]();
  }

  /**
   * `Set#entries`, the walk of `Set#each` (`vendor/ruby/v3.3.11/lib/set.rb:499`).
   * @noRailsEquivalent PERMANENT
   */
  override *entries(): Generator<[T, T], undefined, unknown> {
    for (const o of this) yield [o, o];
  }

  /**
   * `Set#forEach`, the walk of `Set#each` (`vendor/ruby/v3.3.11/lib/set.rb:499`).
   * @noRailsEquivalent PERMANENT
   */
  override forEach(
    callbackfn: (value: T, value2: T, set: globalThis.Set<T>) => void,
    thisArg?: unknown,
  ): void {
    for (const o of this) callbackfn.call(thisArg, o, o, this);
  }

  /**
   * `Set#add` (`vendor/ruby/v3.3.11/lib/set.rb:511`).
   * @noRailsEquivalent PERMANENT
   */
  override add(o: T): this {
    this._hash.set(o, true);
    return this;
  }

  /**
   * `Set#delete` (`vendor/ruby/v3.3.11/lib/set.rb:529`). It answers the JS
   * `Set#delete` boolean, which is `Set#delete?`'s truthiness.
   * @noRailsEquivalent PERMANENT
   */
  override delete(o: T): boolean {
    if (!this.has(o)) return false;
    this._hash.delete(o);
    return true;
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

rbDeclareIvar(Set, "@hash", "_hash");
