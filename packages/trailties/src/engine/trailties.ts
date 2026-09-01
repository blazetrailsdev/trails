// Port of railties/lib/rails/engine/railties.rb. Iterable collection of
// instantiated Trailtie + Engine subclasses (excluding the abstract bases).
import { Trailtie } from "../trailtie.js";
import { Engine } from "../engine.js";

export class Trailties implements Iterable<Trailtie> {
  /**
   * Mirrors `Railties#initialize` (`engine/railties.rb:9-12`):
   * `::Rails::Railtie.subclasses + ::Rails::Engine.subclasses`. Ruby's
   * `Class#subclasses` is DIRECT children, which is what keeps an
   * `Application` subclass out of the collection — trails' registry-backed
   * `Trailtie.subclasses()` is transitive, so the two Ruby sets are recovered
   * by matching each class's immediate superclass.
   */
  readonly all: Trailtie[] = [
    ...Trailtie.subclasses().filter((k) => Object.getPrototypeOf(k) === Trailtie),
    ...Trailtie.subclasses().filter((k) => Object.getPrototypeOf(k) === Engine),
  ].map((k) => k.instance());

  /**
   * @noRailsEquivalent PERMANENT (`use-site:vendor/rails/railties/lib/rails/engine/railties.rb:6, :14` —
   *   `include Enumerable` plus `def each`).
   * JS iteration protocol — Ruby reaches iteration through Enumerable#each
   */
  [Symbol.iterator](): Iterator<Trailtie> {
    return this.all[Symbol.iterator]();
  }
  /** Mirrors Ruby `Enumerable#each`. */
  each(args: (t: Trailtie) => void): this {
    for (const t of this.all) args(t);
    return this;
  }
  /** Mirrors Ruby `Array#-`. */
  minus(others: Trailtie[]): Trailtie[] {
    const drop = new Set(others);
    return this.all.filter((t) => !drop.has(t));
  }
}
