/** @internal */

export type AssociationFacetKey = "instance" | "proxy";

/** @internal */
export interface AssociationCacheSlot {
  instance?: unknown;
  proxy?: unknown;
  hasInstance: boolean;
  hasProxy: boolean;
}

const PRESENCE: Record<AssociationFacetKey, keyof AssociationCacheSlot> = {
  instance: "hasInstance",
  proxy: "hasProxy",
};

function emptySlot(): AssociationCacheSlot {
  return {
    hasInstance: false,
    hasProxy: false,
  };
}

function slotIsEmpty(slot: AssociationCacheSlot): boolean {
  return !slot.hasInstance && !slot.hasProxy;
}

/** @internal */
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

/** @internal */
export class AssociationCache {
  readonly store = new Map<string, AssociationCacheSlot>();
  readonly instances = new AssociationCacheFacet<unknown>(this.store, "instance");
  readonly proxies = new AssociationCacheFacet<unknown>(this.store, "proxy");

  clear(): void {
    this.store.clear();
  }
}
