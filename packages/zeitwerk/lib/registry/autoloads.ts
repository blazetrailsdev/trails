import { deleteIf } from "@blazetrails/ruby-compat";
import type { Loader } from "../loader.js";

export class Autoloads {
  private _autoloads: Record<string, Loader>;

  constructor() {
    this._autoloads = {};
  }

  register(abspath: string, loader: Loader): Loader {
    return (this._autoloads[abspath] = loader);
  }

  isRegistered(path: string): Loader | null {
    return Object.hasOwn(this._autoloads, path) ? this._autoloads[path] : null;
  }

  unregister(abspath: string): Loader | null {
    const loader = this.isRegistered(abspath);
    delete this._autoloads[abspath];
    return loader;
  }

  /** @missingRailsName autoloads — PERMANENT */
  unregisterLoader(loader: Loader): void {
    deleteIf(this._autoloads, (_1, _2) => _2 === loader);
  }

  isEmpty(): boolean {
    return Object.keys(this._autoloads).length === 0;
  }

  clear(): void {
    for (const k of Object.keys(this._autoloads)) delete this._autoloads[k];
  }
}
