/**
 * RFC-0022 association-cache fold. Rails keeps one per-record map,
 * `@association_cache` (name → `Association`, carrying target/proxy/loaded-nil
 * inside that one object). Trails historically split that into three separate
 * maps; this module folds them into one backing slot — a single
 * `Map<string, AssociationCacheSlot>` per record, with each former map exposed
 * as a `Map`-compatible {@link AssociationCacheFacet} view onto one field of
 * the shared slot. The three named accessors keep their exact read/write
 * surface (so the call sites are untouched) but now reach through one
 * memoization slot, converging toward Rails' single `@association_cache`.
 *
 * @internal
 */

/** One field of the unified per-record association cache. */
export type AssociationFacetKey = "instance" | "proxy" | "preloaded";

/**
 * A single name → cache entry. Each facet (`instance`/`proxy`/`preloaded`)
 * carries its value plus a presence flag, because a preloaded association may
 * legitimately be stored as `null` (preloaded-nil) and must be distinguished
 * from "absent".
 *
 * @internal
 */
export interface AssociationCacheSlot {
  instance?: unknown;
  proxy?: unknown;
  preloaded?: unknown;
  hasInstance: boolean;
  hasProxy: boolean;
  hasPreloaded: boolean;
}

const PRESENCE: Record<AssociationFacetKey, keyof AssociationCacheSlot> = {
  instance: "hasInstance",
  proxy: "hasProxy",
  preloaded: "hasPreloaded",
};

function emptySlot(): AssociationCacheSlot {
  return {
    hasInstance: false,
    hasProxy: false,
    hasPreloaded: false,
  };
}

function slotIsEmpty(slot: AssociationCacheSlot): boolean {
  return !slot.hasInstance && !slot.hasProxy && !slot.hasPreloaded;
}

/**
 * A `Map<string, V>`-compatible view onto one field of the shared
 * {@link AssociationCacheSlot} store. `get`/`set`/`has`/`delete`/`clear`/
 * iteration all scope to this facet, while every facet over the same store
 * shares one backing slot per name.
 *
 * @internal
 */
export class AssociationCacheFacet<V> implements Map<string, V> {
  private readonly presence: keyof AssociationCacheSlot;

  constructor(
    private readonly store: Map<string, AssociationCacheSlot>,
    private readonly field: AssociationFacetKey,
  ) {
    this.presence = PRESENCE[field];
  }

  private present(slot: AssociationCacheSlot): boolean {
    return slot[this.presence] as boolean;
  }

  get size(): number {
    let n = 0;
    for (const slot of this.store.values()) if (this.present(slot)) n++;
    return n;
  }

  get(name: string): V | undefined {
    const slot = this.store.get(name);
    return slot && this.present(slot) ? (slot[this.field] as V) : undefined;
  }

  has(name: string): boolean {
    const slot = this.store.get(name);
    return slot ? this.present(slot) : false;
  }

  set(name: string, value: V): this {
    let slot = this.store.get(name);
    if (!slot) {
      slot = emptySlot();
      this.store.set(name, slot);
    }
    slot[this.field] = value;
    (slot[this.presence] as boolean) = true;
    return this;
  }

  delete(name: string): boolean {
    const slot = this.store.get(name);
    if (!slot || !this.present(slot)) return false;
    delete slot[this.field];
    (slot[this.presence] as boolean) = false;
    if (slotIsEmpty(slot)) this.store.delete(name);
    return true;
  }

  clear(): void {
    for (const [name, slot] of this.store) {
      if (!this.present(slot)) continue;
      delete slot[this.field];
      (slot[this.presence] as boolean) = false;
      if (slotIsEmpty(slot)) this.store.delete(name);
    }
  }

  *keys(): MapIterator<string> {
    for (const [name, slot] of this.store) if (this.present(slot)) yield name;
  }

  *values(): MapIterator<V> {
    for (const slot of this.store.values()) {
      if (this.present(slot)) yield slot[this.field] as V;
    }
  }

  *entries(): MapIterator<[string, V]> {
    for (const [name, slot] of this.store) {
      if (this.present(slot)) yield [name, slot[this.field] as V];
    }
  }

  [Symbol.iterator](): MapIterator<[string, V]> {
    return this.entries();
  }

  forEach(cb: (value: V, key: string, map: Map<string, V>) => void, thisArg?: unknown): void {
    for (const [name, value] of this.entries()) cb.call(thisArg, value, name, this);
  }

  get [Symbol.toStringTag](): string {
    return "Map";
  }
}

/**
 * The three folded association-cache facets for one record, backed by one
 * shared {@link AssociationCacheSlot} store; `clear()` resets every facet.
 *
 * Implemented as a class (not an object literal) so its methods live on the
 * prototype: two empty caches on distinct records deep-equal under `toEqual`,
 * which matters because records are compared field-by-field in tests and an
 * own-property closure here would make otherwise-equal records compare unequal.
 *
 * @internal
 */
export class AssociationCache {
  readonly store = new Map<string, AssociationCacheSlot>();
  readonly instances = new AssociationCacheFacet<unknown>(this.store, "instance");
  readonly proxies = new AssociationCacheFacet<unknown>(this.store, "proxy");
  readonly preloaded = new AssociationCacheFacet<unknown>(this.store, "preloaded");

  clear(): void {
    this.store.clear();
  }
}

/** @internal */
export function createAssociationCache(): AssociationCache {
  return new AssociationCache();
}
