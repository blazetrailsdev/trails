import { Mutex, ThreadError } from "@blazetrails/ruby-compat";
import { Cref } from "../cref.js";

export class Map<V = unknown> {
  private _map: globalThis.Map<object, globalThis.Map<string, V>>;
  private _mutex: Mutex;

  constructor() {
    this._map = new globalThis.Map();
    this._mutex = new Mutex();
  }

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

  /** @inventedArm if — PERMANENT */
  deleteByValue(value: V): void {
    const synchronized = this._mutex.synchronize(() => {
      for (const [mod, cnames] of this._map) {
        for (const [cname, v] of cnames) if (v === value) cnames.delete(cname);
        if (cnames.size === 0) this._map.delete(mod);
      }
    });
    if (synchronized instanceof Promise)
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
  }

  /** @inventedArm if — PERMANENT */
  eachKey(block: (cref: Cref) => void): void {
    const synchronized = this._mutex.synchronize(() => {
      for (const [mod, cnames] of this._map) {
        for (const cname of cnames.keys()) block(new Cref(mod, cname));
      }
    });
    if (synchronized instanceof Promise)
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
  }

  /** @inventedArm if — PERMANENT */
  clear(): void {
    const synchronized = this._mutex.synchronize(() => {
      this._map.clear();
    });
    if (synchronized instanceof Promise)
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
  }

  isEmpty(): boolean {
    return this._mutex.synchronize(() => this._map.size === 0) as boolean;
  }
}
