/**
 * OrderedHash — a Map subclass that mirrors Rails ActiveSupport::OrderedHash.
 * In modern JS/TS, Map already preserves insertion order; this class provides
 * Rails-compatible API on top of Map.
 */
export class OrderedHash<K, V> extends Map<K, V> {
  constructor(entries?: Iterable<readonly [K, V]>) {
    super(entries);
  }

  /** from — creates an OrderedHash from an array of [key, value] pairs. */
  static from<K, V>(pairs: [K, V][]): OrderedHash<K, V> {
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new Error("Each element must be a [key, value] pair");
      }
    }
    return new OrderedHash(pairs);
  }

  /** toObject — converts to a plain JS object (string keys only). */
  toObject(): Record<string, V> {
    const obj: Record<string, V> = {};
    for (const [k, v] of this) {
      obj[String(k)] = v;
    }
    return obj;
  }

  /** toArray — converts to array of [key, value] pairs. */
  toArray(): [K, V][] {
    return [...this.entries()];
  }

  /** hasValue — returns true if any value equals the given value. */
  hasValue(value: V): boolean {
    for (const v of this.values()) {
      if (v === value) return true;
    }
    return false;
  }

  /** select — returns new OrderedHash with entries satisfying the predicate. */
  select(predicate: (key: K, value: V) => boolean): OrderedHash<K, V> {
    const result = new OrderedHash<K, V>();
    for (const [k, v] of this) {
      if (predicate(k, v)) result.set(k, v);
    }
    return result;
  }

  /** reject — returns new OrderedHash without entries satisfying the predicate. */
  reject(predicate: (key: K, value: V) => boolean): OrderedHash<K, V> {
    return this.select((k, v) => !predicate(k, v));
  }

  /** deleteIf — removes entries satisfying the predicate in-place. */
  deleteIf(predicate: (key: K, value: V) => boolean): this {
    for (const [k, v] of this) {
      if (predicate(k, v)) this.delete(k);
    }
    return this;
  }

  /** merge — returns a new OrderedHash with entries from both. Optional block resolves conflicts. */
  merge(
    other: OrderedHash<K, V>,
    block?: (key: K, v1: V, v2: V) => V
  ): OrderedHash<K, V> {
    const result = new OrderedHash<K, V>(this);
    for (const [k, v] of other) {
      if (block && result.has(k)) {
        result.set(k, block(k, result.get(k)!, v));
      } else {
        result.set(k, v);
      }
    }
    return result;
  }

  /** mergeInPlace — merges another hash into this one (update/merge!). */
  mergeInPlace(
    other: OrderedHash<K, V>,
    block?: (key: K, v1: V, v2: V) => V
  ): this {
    for (const [k, v] of other) {
      if (block && this.has(k)) {
        this.set(k, block(k, this.get(k)!, v));
      } else {
        this.set(k, v);
      }
    }
    return this;
  }

  /** update — alias for mergeInPlace (no conflict resolution). */
  update(other: OrderedHash<K, V>): this {
    return this.mergeInPlace(other);
  }

  /** replace — replaces all entries with entries from another OrderedHash. */
  replace(other: OrderedHash<K, V>): this {
    this.clear();
    for (const [k, v] of other) {
      this.set(k, v);
    }
    return this;
  }

  /** shift — removes and returns the first entry as a [key, value] pair. */
  shift(): [K, V] | undefined {
    const first = this[Symbol.iterator]().next().value;
    if (!first) return undefined;
    const [k, v] = first;
    this.delete(k);
    return [k, v];
  }

  /** invert — returns a new OrderedHash with keys and values swapped. */
  invert(): OrderedHash<V, K> {
    const result = new OrderedHash<V, K>();
    for (const [k, v] of this) {
      result.set(v, k);
    }
    return result;
  }

  /** inspect — returns a string representation. */
  inspect(): string {
    const parts = [...this.entries()].map(([k, v]) => `${JSON.stringify(k)}=>${JSON.stringify(v)}`);
    return `{${parts.join(", ")}}`;
  }
}
