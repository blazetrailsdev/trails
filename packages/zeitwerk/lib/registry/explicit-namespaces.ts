import type { Cref } from "../cref.js";
import { Map } from "../cref/map.js";
import type { Loader } from "../loader.js";

export class ExplicitNamespaces {
  private _loaders: Map<Loader>;

  constructor() {
    this._loaders = new Map<Loader>();
  }

  register(cref: Cref, loader: Loader): void {
    this._loaders.set(cref, loader);
  }

  loaderFor(mod: object, cname: string): Loader | null {
    return this._loaders.deleteModCname(mod, cname);
  }

  unregisterLoader(loader: Loader): void {
    this._loaders.deleteByValue(loader);
  }

  isRegistered(cref: Cref): Loader | null {
    return this._loaders.get(cref);
  }

  clear(): void {
    this._loaders.clear();
  }
}
