import { Mutex } from "@blazetrails/ruby-compat/mutex";
import { ThreadError } from "@blazetrails/ruby-compat/thread-error";
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
    let raised = false;
    let result!: V;
    const synchronized = this._mutex.synchronize(() => {
      if (raised) return;
      let cnames = this._map.get(cref.mod);
      if (cnames === undefined) this._map.set(cref.mod, (cnames = new globalThis.Map()));
      cnames.set(cref.cname, value);
      result = value;
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
    return result;
  }

  /** @noRailsEquivalent PERMANENT */
  get(cref: Cref): V | null {
    let raised = false;
    let result!: V | null;
    const synchronized = this._mutex.synchronize(() => {
      if (raised) return;
      result = this._map.get(cref.mod)?.get(cref.cname) ?? null;
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
    return result;
  }

  /** @inventedArm if — PERMANENT */
  getOrSet(cref: Cref, block: () => V): V {
    let raised = false;
    let result!: V;
    const synchronized = this._mutex.synchronize(() => {
      if (raised) return;
      let cnames = this._map.get(cref.mod);
      if (cnames === undefined) this._map.set(cref.mod, (cnames = new globalThis.Map()));
      if (cnames.has(cref.cname)) {
        result = cnames.get(cref.cname) as V;
        return;
      }
      const value = block();
      cnames.set(cref.cname, value);
      result = value;
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
    return result;
  }

  delete(cref: Cref): V | null {
    return this.deleteModCname(cref.mod, cref.cname);
  }

  /** @inventedArm if — PERMANENT */
  deleteModCname(mod: object, cname: string): V | null {
    let raised = false;
    let result!: V | null;
    const synchronized = this._mutex.synchronize(() => {
      if (raised) return;
      const cnames = this._map.get(mod);
      if (cnames !== undefined) {
        const value = cnames.get(cname) ?? null;
        cnames.delete(cname);
        if (cnames.size === 0) this._map.delete(mod);
        result = value;
        return;
      }
      result = null;
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
    return result;
  }

  /** @inventedArm if — PERMANENT */
  deleteByValue(value: V): void {
    let raised = false;
    const synchronized = this._mutex.synchronize(() => {
      if (raised) return;
      for (const [mod, cnames] of this._map) {
        for (const [cname, v] of cnames) if (v === value) cnames.delete(cname);
        if (cnames.size === 0) this._map.delete(mod);
      }
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
  }

  /** @inventedArm if — PERMANENT */
  eachKey(block: (cref: Cref) => void): void {
    let raised = false;
    const synchronized = this._mutex.synchronize(() => {
      if (raised) return;
      for (const [mod, cnames] of this._map) {
        for (const cname of cnames.keys()) block(new Cref(mod, cname));
      }
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
  }

  /** @inventedArm if — PERMANENT */
  clear(): void {
    let raised = false;
    const synchronized = this._mutex.synchronize(() => {
      if (raised) return;
      this._map.clear();
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
  }

  /** @inventedArm if — PERMANENT */
  isEmpty(): boolean {
    let raised = false;
    let result!: boolean;
    const synchronized = this._mutex.synchronize(() => {
      if (raised) return;
      result = this._map.size === 0;
    });
    if (synchronized instanceof Promise) {
      raised = true;
      throw new ThreadError("deadlock; synchronize contended in a synchronous caller");
    }
    return result;
  }
}
