import type { Cref } from "../cref.js";
import { Map } from "../cref/map.js";

const inceptions = new Map<string>();

export const Inceptions = {
  register(cref: Cref, autoloadPath: string): void {
    inceptions.set(cref, autoloadPath);
  },

  isRegistered(cref: Cref): string | null {
    return inceptions.get(cref);
  },

  unregister(cref: Cref): void {
    inceptions.delete(cref);
  },

  clear(): void {
    inceptions.clear();
  },
};
