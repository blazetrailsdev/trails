import { ArgumentError } from "./argument-error.js";
import { Hash, dup, update } from "./hash.js";
import { rbDefineAllocFunc, rbObjDup } from "./include.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { registerConstant } from "./variable.js";
import { rbDeclareIvar, rbModName, rbObjClass, rbObjRespondTo } from "./object.js";

const JsSet = globalThis.Set;

interface HashRelop {
  greaterThanOrEqual(other: unknown): boolean;
  lessThanOrEqual(other: unknown): boolean;
}

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
  _hash = new Hash<T, boolean>(false);

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
    if (rbObjRespondTo(this._hash, "compareByIdentity")) {
      this._hash.compareByIdentity();
      return this;
    } else {
      throw new NotImplementedError(
        `${rbModName(this.constructor as typeof Set)}#compare_by_identity is not implemented`,
      );
    }
  }

  /**
   * `Set#compare_by_identity?` (`vendor/ruby/v3.3.11/lib/set.rb:268`).
   * @noRailsEquivalent PERMANENT
   */
  isCompareByIdentity(): boolean {
    return rbObjRespondTo(this._hash, "isCompareByIdentity") && this._hash.isCompareByIdentity();
  }

  /**
   * `Set#initialize_dup` (`vendor/ruby/v3.3.11/lib/set.rb:284`).
   * @noRailsEquivalent PERMANENT
   */
  initializeDup(orig: Set<T>): void {
    this._hash = dup(orig._hash);
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
   * `Set#superset?` (`vendor/ruby/v3.3.11/lib/set.rb:399`), under the name of
   * the JS `Set` method it replaces.
   * @noRailsEquivalent PERMANENT
   */
  isSupersetOf(set: Set<unknown>): boolean {
    if (rbObjClass(set) === rbObjClass(this) && rbObjRespondTo(this._hash, "greaterThanOrEqual")) {
      return (this._hash as unknown as HashRelop).greaterThanOrEqual(set._hash);
    } else if (set instanceof Set) {
      return this.size >= set.size && [...set].every((o) => this.has(o as T));
    } else {
      throw new ArgumentError("value must be a set");
    }
  }

  /**
   * `Set#subset?` (`vendor/ruby/v3.3.11/lib/set.rb:425`), under the name of
   * the JS `Set` method it replaces.
   * @noRailsEquivalent PERMANENT
   */
  isSubsetOf(set: Set<unknown>): boolean {
    if (rbObjClass(set) === rbObjClass(this) && rbObjRespondTo(this._hash, "lessThanOrEqual")) {
      return (this._hash as unknown as HashRelop).lessThanOrEqual(set._hash);
    } else if (set instanceof Set) {
      return this.size <= set.size && [...this].every((o) => set.has(o));
    } else {
      throw new ArgumentError("value must be a set");
    }
  }

  /**
   * `Set#intersect?` (`vendor/ruby/v3.3.11/lib/set.rb:470`).
   * @noRailsEquivalent PERMANENT
   */
  isIntersect(set: Iterable<unknown>): boolean {
    if (set instanceof Set) {
      if (this.size < set.size) {
        return [...this].some((o) => set.has(o));
      } else {
        return [...set].some((o) => this.has(o as T));
      }
    } else if (
      typeof (set as Partial<Iterable<unknown>> | null)?.[Symbol.iterator] === "function"
    ) {
      return [...set].some((o) => this.has(o as T));
    } else {
      throw new ArgumentError("value must be enumerable");
    }
  }

  /**
   * `Set#disjoint?` (`vendor/ruby/v3.3.11/lib/set.rb:492`), under the name of
   * the JS `Set` method it replaces.
   * @noRailsEquivalent PERMANENT
   */
  isDisjointFrom(set: Iterable<unknown>): boolean {
    return !this.isIntersect(set);
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
   * `Set#merge` (`vendor/ruby/v3.3.11/lib/set.rb:595`).
   * @noRailsEquivalent PERMANENT
   */
  merge(...enums: Iterable<T>[]): this {
    for (const enumerable of enums) {
      if (rbObjClass(enumerable) === rbObjClass(this)) {
        update(
          this._hash as unknown as Map<string, boolean>,
          (enumerable as Set<T>)._hash as unknown as Map<string, boolean>,
        );
      } else {
        for (const o of enumerable) this.add(o);
      }
    }

    return this;
  }

  /**
   * `Set#subtract` (`vendor/ruby/v3.3.11/lib/set.rb:609`).
   * @noRailsEquivalent PERMANENT
   */
  subtract(enumerable: Iterable<T>): this {
    for (const o of enumerable) this.delete(o);
    return this;
  }

  /**
   * `Set#|` (`vendor/ruby/v3.3.11/lib/set.rb:619`), under its `union` alias.
   * @noRailsEquivalent PERMANENT
   */
  union(enumerable: Iterable<T>): Set<T> {
    return rbObjDup(this).merge(enumerable);
  }

  /**
   * `Set#-` (`vendor/ruby/v3.3.11/lib/set.rb:630`), under its `difference` alias.
   * @noRailsEquivalent PERMANENT
   */
  difference(enumerable: Iterable<T>): Set<T> {
    return rbObjDup(this).subtract(enumerable);
  }

  /**
   * `Set#&` (`vendor/ruby/v3.3.11/lib/set.rb:640`), under its `intersection` alias.
   * @noRailsEquivalent PERMANENT
   */
  intersection(enumerable: Iterable<T>): Set<T> {
    const n = new (this.constructor as new () => Set<T>)();
    if (enumerable instanceof Set) {
      if (enumerable.size > this.size) {
        for (const o of this) if (enumerable.has(o)) n.add(o);
      } else {
        for (const o of enumerable) if (this.has(o)) n.add(o);
      }
    } else {
      for (const o of enumerable) if (this.has(o)) n.add(o);
    }
    return n;
  }

  /**
   * `Set#^` (`vendor/ruby/v3.3.11/lib/set.rb:661`), under the name of the JS
   * `Set` method it replaces.
   * @noRailsEquivalent PERMANENT
   */
  symmetricDifference(enumerable: Iterable<T>): Set<T> {
    const n = new Set<T>(enumerable);
    for (const o of this) if (!n.delete(o)) n.add(o);
    return n;
  }
}

rbDeclareIvar(Set, "@hash", "_hash");
rbDefineAllocFunc(Set, (klass) => Reflect.construct(JsSet, [], klass) as Set<unknown>);
registerConstant("Set", Set);
