// Port of railties/lib/rails/engine/railties.rb. Iterable collection of
// instantiated Trailtie + Engine subclasses (excluding the abstract bases).
import { Trailtie } from "../trailtie.js";

export class Trailties implements Iterable<Trailtie> {
  readonly all: Trailtie[] = Trailtie.subclasses().map((k) => k.instance());

  [Symbol.iterator](): Iterator<Trailtie> {
    return this.all[Symbol.iterator]();
  }
  /** Mirrors Ruby `Enumerable#each`. */
  each(fn: (t: Trailtie) => void): this {
    for (const t of this.all) fn(t);
    return this;
  }
  /** Mirrors Ruby `Array#-`. */
  minus(others: Trailtie[]): Trailtie[] {
    const drop = new Set(others);
    return this.all.filter((t) => !drop.has(t));
  }
}
