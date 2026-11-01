import { Trailtie } from "../trailtie.js";
import { Engine } from "../engine.js";

export class Trailties implements Iterable<Trailtie> {
  readonly _all: Trailtie[];

  constructor() {
    this._all = [...Trailtie.subclasses(), ...Engine.subclasses()].map((k) => k.instance());
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): Iterator<Trailtie> {
    return this._all[Symbol.iterator]();
  }
  each(args: (t: Trailtie) => void): this {
    for (const t of this._all) args(t);
    return this;
  }
  minus(others: Trailtie[]): Trailtie[] {
    const drop = new Set(others);
    return this._all.filter((t) => !drop.has(t));
  }
}
