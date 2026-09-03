export class OrderedHash<K, V> extends Map<K, V> {
  constructor(entries?: Iterable<readonly [K, V]>) {
    super(entries);
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
}
