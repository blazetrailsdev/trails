import type { Cref } from "../cref.js";
import { Map } from "../cref/map.js";
import type { Loader } from "../loader.js";

export const ExplicitNamespaces = {
  /** @internal */
  loaders: new Map<Loader>(),

  /** @noRailsEquivalent PERMANENT */
  register(cref: Cref, loader: Loader): void {
    this.loaders.set(cref, loader);
  },

  /** @noRailsEquivalent PERMANENT */
  loaderFor(mod: object, cname: string): Loader | null {
    return this.loaders.deleteModCname(mod, cname);
  },

  /** @noRailsEquivalent PERMANENT */
  unregisterLoader(loader: Loader): void {
    this.loaders.deleteByValue(loader);
  },

  /** @noRailsEquivalent PERMANENT */
  isRegistered(cref: Cref): Loader | null {
    return this.loaders.get(cref);
  },

  /** @noRailsEquivalent PERMANENT */
  clear(): void {
    this.loaders.clear();
  },
};
