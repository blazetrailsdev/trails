import { Hash } from "@blazetrails/ruby-compat";

export class OrderedHash<K, V> extends Hash<K, V> {
  constructor(entries?: Iterable<readonly [K, V]>) {
    super();
    if (entries) for (const [k, v] of entries) this.set(k, v);
  }

  static from<K, V>(pairs: [K, V][]): OrderedHash<K, V> {
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new Error("Each element must be a [key, value] pair");
      }
    }
    return new OrderedHash(pairs);
  }

  toObject(): Record<string, V> {
    const obj: Record<string, V> = {};
    for (const [k, v] of this) {
      obj[String(k)] = v;
    }
    return obj;
  }

  toArray(): [K, V][] {
    return [...this.entries()];
  }

  hasValue(value: V): boolean {
    for (const v of this.values()) {
      if (v === value) return true;
    }
    return false;
  }

  select(...args: [(key: K, value: V) => boolean]): OrderedHash<K, V> {
    const block = args[args.length - 1];
    const result = new OrderedHash<K, V>();
    for (const [k, v] of this) {
      if (block(k, v)) result.set(k, v);
    }
    return result;
  }

  reject(...args: [(key: K, value: V) => boolean]): OrderedHash<K, V> {
    const block = args[args.length - 1];
    return this.select((k, v) => !block(k, v));
  }

  nestedUnderIndifferentAccess(): this {
    return this;
  }

  rejectBang(...args: [(key: K, value: V) => boolean]): this | null {
    const block = args[args.length - 1];
    const n = this.size;
    if (!n) return null;
    this.deleteIf(block);
    if (n === this.size) return null;
    return this;
  }

  deleteIf(predicate: (key: K, value: V) => boolean): this {
    for (const [k, v] of this) {
      if (predicate(k, v)) this.delete(k);
    }
    return this;
  }

  merge(other: OrderedHash<K, V>, block?: (key: K, v1: V, v2: V) => V): OrderedHash<K, V> {
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

  mergeInPlace(other: OrderedHash<K, V>, block?: (key: K, v1: V, v2: V) => V): this {
    for (const [k, v] of other) {
      if (block && this.has(k)) {
        this.set(k, block(k, this.get(k)!, v));
      } else {
        this.set(k, v);
      }
    }
    return this;
  }

  update(other: OrderedHash<K, V>): this {
    return this.mergeInPlace(other);
  }

  replace(other: OrderedHash<K, V>): this {
    this.clear();
    for (const [k, v] of other) {
      this.set(k, v);
    }
    return this;
  }

  shift(): [K, V] | undefined {
    const first = this[Symbol.iterator]().next().value;
    if (!first) return undefined;
    const [k, v] = first;
    this.delete(k);
    return [k, v];
  }

  invert(): OrderedHash<V, K> {
    const result = new OrderedHash<V, K>();
    for (const [k, v] of this) {
      result.set(v, k);
    }
    return result;
  }

  inspect(): string {
    const parts = [...this.entries()].map(([k, v]) => `${JSON.stringify(k)}=>${JSON.stringify(v)}`);
    return `{${parts.join(", ")}}`;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_value` (`vendor/ruby/v3.3.11/hash.c:3060`), inherited by `OrderedHash < ::Hash`.
   */
  eachValue(): MapIterator<V>;
  eachValue(block: (value: V) => void): this;
  eachValue(block?: (value: V) => void): this | MapIterator<V> {
    const values = Map.prototype.values.call(this) as MapIterator<V>;
    if (block === undefined) return values;
    for (const value of values) block(value);
    return this;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_key` (`vendor/ruby/v3.3.11/hash.c:3098`), inherited by `OrderedHash < ::Hash`.
   */
  eachKey(): MapIterator<K>;
  eachKey(block: (key: K) => void): this;
  eachKey(block?: (key: K) => void): this | MapIterator<K> {
    const keys = Map.prototype.keys.call(this) as MapIterator<K>;
    if (block === undefined) return keys;
    for (const key of keys) block(key);
    return this;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_pair` (`vendor/ruby/v3.3.11/hash.c:3149`), inherited by `OrderedHash < ::Hash`.
   */
  eachPair(): MapIterator<[K, V]>;
  eachPair(block: (key: K, value: V) => void): this;
  eachPair(block?: (key: K, value: V) => void): this | MapIterator<[K, V]> {
    const entries = Map.prototype.entries.call(this) as MapIterator<[K, V]>;
    if (block === undefined) return entries;
    for (const [key, value] of entries) block(key, value);
    return this;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#each`, defined as `rb_hash_each_pair` (`vendor/ruby/v3.3.11/hash.c:7219`).
   */
  each(): MapIterator<[K, V]>;
  each(block: (key: K, value: V) => void): this;
  each(block?: (key: K, value: V) => void): this | MapIterator<[K, V]> {
    return block === undefined ? this.eachPair() : this.eachPair(block);
  }

  isExtractableOptions(): boolean {
    return true;
  }
}
