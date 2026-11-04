import type { Cref } from "../cref.js";
import { Map } from "../cref/map.js";
import type { Loader } from "../loader.js";

export const ExplicitNamespaces = {
  /** @internal */
  loaders: new Map<Loader>(),

  /** @internal */
  register(cref: Cref, loader: Loader): void {
    this.loaders.set(cref, loader);
  },

  /** @internal */
  loaderFor(mod: object, cname: string): Loader | null {
    return this.loaders.deleteModCname(mod, cname);
  },

  /** @internal */
  unregisterLoader(loader: Loader): void {
    this.loaders.deleteByValue(loader);
  },

  /** @internal */
  isRegistered(cref: Cref): Loader | null {
    return this.loaders.get(cref);
  },

  /** @internal */
  clear(): void {
    this.loaders.clear();
  },
};
