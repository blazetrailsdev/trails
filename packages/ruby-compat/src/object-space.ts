const finalizers = new FinalizationRegistry<() => void>((aProc) => aProc());

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
    finalizers.register(obj, aProc);
    return [0, aProc];
  },
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/weakmap.c:1125 */
  WeakMap,
};
