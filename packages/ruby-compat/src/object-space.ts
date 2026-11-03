import { toEnum } from "./enumerator.js";
import { IO, ioObjects } from "./io.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { getProcessAdapter, onSignal } from "./process-adapter.js";

type FinalizerEntry = { obj: WeakRef<object>; aProc: () => void };

let finalizerTable: Set<FinalizerEntry> | undefined;
const finalizers = new FinalizationRegistry<FinalizerEntry>((entry) => {
  finalizerTable!.delete(entry);
  entry.aProc();
});

type WeakmapEntry<K extends object> = { key: WeakRef<K>; val: unknown };

/** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/weakmap.c:1125 */
class WeakMap<K extends object, V = unknown> {
  readonly #table = new globalThis.WeakMap<K, WeakmapEntry<K>>();
  readonly #entries = new Set<WeakmapEntry<K>>();
  readonly #dead = new FinalizationRegistry<WeakmapEntry<K>>((entry) => {
    this.#entries.delete(entry);
  });

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/weakmap.c:454 */
  set(key: K, val: V): V {
    const held =
      (typeof val === "object" && val !== null) || typeof val === "function"
        ? new WeakRef(val)
        : val;
    const entry = this.#table.get(key);
    if (entry) {
      entry.val = held;
      return val;
    }
    const added = { key: new WeakRef(key), val: held };
    this.#table.set(key, added);
    this.#entries.add(added);
    this.#dead.register(key, added);
    return val;
  }

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/weakmap.c:315 */
  async eachKey(block: (key: K) => unknown): Promise<this> {
    for (const entry of this.#entries) {
      const key = entry.key.deref();
      if (key === undefined) {
        this.#entries.delete(entry);
        continue;
      }
      await block(key);
    }
    return this;
  }
}

/** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/gc.c:4364 */
export const ObjectSpace = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/gc.c:4364 */
  defineFinalizer(obj: object, aProc: () => void): [number, () => void] {
    if (finalizerTable === undefined) {
      const table = (finalizerTable = new Set());
      const callFinalizers = () => {
        for (const entry of table) {
          table.delete(entry);
          entry.aProc();
        }
      };
      onSignal("exit", callFinalizers);
      for (const signo of ["SIGINT", "SIGTERM"] as const) {
        const off = onSignal(signo, () => {
          off();
          callFinalizers();
          const adapter = getProcessAdapter();
          adapter.kill?.(adapter.pid(), signo);
        });
      }
    }
    const entry = { obj: new WeakRef(obj), aProc };
    finalizerTable.add(entry);
    finalizers.register(obj, entry, entry);
    return [0, aProc];
  },
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/gc.c:4227 */
  undefineFinalizer(obj: object): object {
    for (const entry of finalizerTable ?? []) {
      if (entry.obj.deref() !== obj) continue;
      finalizerTable!.delete(entry);
      finalizers.unregister(entry);
    }
    return obj;
  },
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/gc.c:4209 */
  eachObject(of: { prototype: object; name: string }, block?: (obj: object) => unknown) {
    if (!block) return toEnum(ObjectSpace, "eachObject", of);
    if ((of as unknown) !== IO && !(of.prototype instanceof IO)) {
      throw new NotImplementedError(`ObjectSpace.each_object(${of.name}) is not supported`);
    }
    let num = 0;
    for (const ref of ioObjects) {
      const obj = ref.deref();
      if (obj === undefined) {
        ioObjects.delete(ref);
        continue;
      }
      if (!Object.prototype.isPrototypeOf.call(of.prototype, obj)) continue;
      block(obj);
      num++;
    }
    return num;
  },
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/weakmap.c:1125 */
  WeakMap,
};
