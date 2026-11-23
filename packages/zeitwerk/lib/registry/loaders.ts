import { aryDelete } from "@blazetrails/ruby-compat";
import type { Loader } from "../loader.js";

export class Loaders {
  private _loaders: Loader[];

  constructor() {
    this._loaders = [];
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.iterator](): Iterator<Loader> {
    return this._loaders[Symbol.iterator]();
  }

  each(block: (loader: Loader) => void): void {
    this._loaders.forEach(block);
  }

  register(loader: Loader): void {
    this._loaders.push(loader);
  }

  unregister(loader: Loader): Loader | null {
    return aryDelete(this._loaders, loader) ?? null;
  }

  isRegistered(loader: Loader): boolean {
    return this._loaders.includes(loader);
  }

  clear(): void {
    this._loaders.length = 0;
  }
}
