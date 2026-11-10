import type { Cref } from "../cref.js";
import { Map } from "../cref/map.js";

const inceptions = new Map<string>();

export const Inceptions = {
  /** @internal */
  register(cref: Cref, autoloadPath: string): void {
    inceptions.set(cref, autoloadPath);
  },

  /** @internal */
  isRegistered(cref: Cref): string | null {
    return inceptions.get(cref);
  },

  /** @internal */
  unregister(cref: Cref): void {
    inceptions.delete(cref);
  },

  /** @internal */
  clear(): void {
    inceptions.clear();
  },
};
