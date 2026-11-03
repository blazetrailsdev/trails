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

/** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/gc.c:4364 */
export const ObjectSpace = {
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/gc.c:4364 */
  defineFinalizer(obj: object, aProc: () => void): [number, () => void] {
    if (finalizerTable === undefined) {
      const table = (finalizerTable = new Set());
      // `rb_objspace_call_finalizer` (`vendor/ruby/v3.3.11/gc.c:4635`) runs every
      const callFinalizers = () => {
        for (const entry of table) {
          table.delete(entry);
          entry.aProc();
        }
      };
      onSignal("exit", callFinalizers);
      // finalizers and then re-raises it (`vendor/ruby/v3.3.11/eval.c:260-272`).
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
