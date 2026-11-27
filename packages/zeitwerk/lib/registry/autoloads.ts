import { deleteIf } from "@blazetrails/ruby-compat/hash";
import type { Loader } from "../loader.js";

export class Autoloads {
  #autoloads: Record<string, Loader>;

  constructor() {
    this.#autoloads = {};
  }

  register(abspath: string, loader: Loader): Loader {
    return (this.#autoloads[abspath] = loader);
  }

  isRegistered(path: string): Loader | null {
    return Object.hasOwn(this.#autoloads, path) ? this.#autoloads[path] : null;
  }

  unregister(abspath: string): Loader | null {
    const loader = this.isRegistered(abspath);
    delete this.#autoloads[abspath];
    return loader;
  }

  unregisterLoader(loader: Loader): void {
    deleteIf(this.#autoloads, (_1, _2) => _2 === loader);
  }

  isEmpty(): boolean {
    return Object.keys(this.#autoloads).length === 0;
  }

  clear(): void {
    for (const k of Object.keys(this.#autoloads)) delete this.#autoloads[k];
  }
}
