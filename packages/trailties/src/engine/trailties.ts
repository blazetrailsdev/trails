import { Trailtie } from "../trailtie.js";
import { Engine } from "../engine.js";

export class Trailties implements Iterable<Trailtie> {
  readonly all: Trailtie[] = [
    ...Trailtie.subclasses().filter((k) => Object.getPrototypeOf(k) === Trailtie),
    ...Trailtie.subclasses().filter((k) => Object.getPrototypeOf(k) === Engine),
  ].map((k) => k.instance());

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): Iterator<Trailtie> {
    return this.all[Symbol.iterator]();
  }
  each(args: (t: Trailtie) => void): this {
    for (const t of this.all) args(t);
    return this;
  }
  minus(others: Trailtie[]): Trailtie[] {
    const drop = new Set(others);
    return this.all.filter((t) => !drop.has(t));
  }
}
