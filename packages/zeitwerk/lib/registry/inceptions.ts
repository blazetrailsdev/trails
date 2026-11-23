import type { Cref } from "../cref.js";
import { Map } from "../cref/map.js";

export class Inceptions {
  private _inceptions: Map<string>;

  constructor() {
    this._inceptions = new Map<string>();
  }

  register(cref: Cref, abspath: string): void {
    this._inceptions.set(cref, abspath);
  }

  isRegistered(cref: Cref): string | null {
    return this._inceptions.get(cref);
  }

  unregister(cref: Cref): void {
    this._inceptions.delete(cref);
  }

  clear(): void {
    this._inceptions.clear();
  }
}
