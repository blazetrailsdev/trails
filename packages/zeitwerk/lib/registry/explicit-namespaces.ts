import type { Cref } from "../cref.js";
import { Map } from "../cref/map.js";
import type { Loader } from "../loader.js";

export class ExplicitNamespaces {
  #loaders: Map<Loader>;

  constructor() {
    this.#loaders = new Map<Loader>();
  }

  register(cref: Cref, loader: Loader): void {
    this.#loaders.set(cref, loader);
  }

  loaderFor(mod: object, cname: string): Loader | null {
    return this.#loaders.deleteModCname(mod, cname);
  }

  unregisterLoader(loader: Loader): void {
    this.#loaders.deleteByValue(loader);
  }

  isRegistered(cref: Cref): Loader | null {
    return this.#loaders.get(cref);
  }

  clear(): void {
    this.#loaders.clear();
  }
}
