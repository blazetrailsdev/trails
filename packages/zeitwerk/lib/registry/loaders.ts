import { aryDelete } from "@blazetrails/ruby-compat";
import type { Loader } from "../loader.js";

export class Loaders {
  #loaders: Loader[];

  constructor() {
    this.#loaders = [];
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): Iterator<Loader> {
    return this.#loaders[Symbol.iterator]();
  }

  each(block: (loader: Loader) => void): void {
    this.#loaders.forEach(block);
  }

  register(loader: Loader): void {
    this.#loaders.push(loader);
  }

  unregister(loader: Loader): Loader | null {
    return aryDelete(this.#loaders, loader) ?? null;
  }

  isRegistered(loader: Loader): boolean {
    return this.#loaders.includes(loader);
  }

  clear(): void {
    this.#loaders.length = 0;
  }
}
