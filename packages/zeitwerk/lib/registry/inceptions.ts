import type { Cref } from "../cref.js";
import { Map } from "../cref/map.js";

export const Inceptions = {
  /** @internal */
  inceptions: new Map<string>(),

  /** @internal */
  register(cref: Cref, autoloadPath: string): void {
    this.inceptions.set(cref, autoloadPath);
  },

  /** @internal */
  isRegistered(cref: Cref): string | null {
    return this.inceptions.get(cref);
  },

  /** @internal */
  unregister(cref: Cref): void {
    this.inceptions.delete(cref);
  },

  /** @internal */
  clear(): void {
    this.inceptions.clear();
  },
};
