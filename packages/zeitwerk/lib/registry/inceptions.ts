import type { Cref } from "../cref.js";
import { Map } from "../cref/map.js";

export class Inceptions {
  #inceptions: Map<string>;

  constructor() {
    this.#inceptions = new Map<string>();
  }

  register(cref: Cref, abspath: string): void {
    this.#inceptions.set(cref, abspath);
  }

  isRegistered(cref: Cref): string | null {
    return this.#inceptions.get(cref);
  }

  unregister(cref: Cref): void {
    this.#inceptions.delete(cref);
  }

  clear(): void {
    this.#inceptions.clear();
  }
}
