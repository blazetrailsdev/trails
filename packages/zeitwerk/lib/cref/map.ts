import { Mutex } from "@blazetrails/ruby-compat";
import { Cref } from "../cref.js";

export class Map<V = unknown> {
  private _map = new globalThis.Map<object, globalThis.Map<string, V>>();
  private _mutex = new Mutex();

  /** @noRailsEquivalent PERMANENT */
  set(cref: Cref, value: V): V {
    return this._mutex.synchronize(() => {
      let cnames = this._map.get(cref.mod);
      if (cnames === undefined) this._map.set(cref.mod, (cnames = new globalThis.Map()));
      cnames.set(cref.cname, value);
      return value;
    }) as V;
  }

  /** @noRailsEquivalent PERMANENT */
  get(cref: Cref): V | null {
    return this._mutex.synchronize(() => {
      return this._map.get(cref.mod)?.get(cref.cname) ?? null;
    }) as V | null;
  }

  getOrSet(cref: Cref, block: () => V): V {
    return this._mutex.synchronize(() => {
      let cnames = this._map.get(cref.mod);
      if (cnames === undefined) this._map.set(cref.mod, (cnames = new globalThis.Map()));
      if (cnames.has(cref.cname)) return cnames.get(cref.cname) as V;
      const value = block();
      cnames.set(cref.cname, value);
      return value;
    }) as V;
  }

  delete(cref: Cref): V | null {
    return this.deleteModCname(cref.mod, cref.cname);
  }

  deleteModCname(mod: object, cname: string): V | null {
    return this._mutex.synchronize(() => {
      const cnames = this._map.get(mod);
      if (cnames !== undefined) {
        const value = cnames.get(cname) ?? null;
        cnames.delete(cname);
        if (cnames.size === 0) this._map.delete(mod);
        return value;
      }
      return null;
    }) as V | null;
  }

  deleteByValue(value: V): void {
    this._mutex.synchronize(() => {
      for (const [mod, cnames] of this._map) {
        for (const [cname, v] of cnames) if (v === value) cnames.delete(cname);
        if (cnames.size === 0) this._map.delete(mod);
      }
    });
  }

  eachKey(block: (cref: Cref) => void): void {
    this._mutex.synchronize(() => {
      for (const [mod, cnames] of this._map) {
        for (const cname of cnames.keys()) block(new Cref(mod, cname));
      }
    });
  }

  clear(): void {
    this._mutex.synchronize(() => {
      this._map.clear();
    });
  }

  isEmpty(): boolean {
    return this._mutex.synchronize(() => this._map.size === 0) as boolean;
  }
}
