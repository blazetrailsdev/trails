import { first } from "@blazetrails/ruby-compat/array";
import { map } from "@blazetrails/ruby-compat/enumerable";
import { Hash } from "@blazetrails/ruby-compat/hash";
import { rbObjDup } from "@blazetrails/ruby-compat/include";
import { YAML } from "@blazetrails/ruby-compat/yaml";

YAML.addBuiltinType("omap", (_type, val) => {
  return OrderedHash.from(
    (val as (Map<unknown, unknown> | Record<string, unknown>)[]).map(
      (v) => first(v instanceof Map ? v : Object.entries(v)) as [unknown, unknown],
    ),
  );
});

export class OrderedHash<K, V> extends Hash<K, V> {
  constructor(entries?: Iterable<readonly [K, V]>) {
    super();
    if (entries) for (const [k, v] of entries) this.set(k, v);
  }

  toYamlType(): string {
    return "!tag:yaml.org,2002:omap";
  }

  encodeWith(coder: YAML.Coder): void {
    coder.representSeq(
      "!omap",
      map(this, (k: K, v: V) => new Hash<K, V>().set(k, v)),
    );
  }

  static from<K, V>(pairs: [K, V][]): OrderedHash<K, V> {
    for (const pair of pairs) {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new Error("Each element must be a [key, value] pair");
      }
    }
    return new OrderedHash(pairs);
  }

  toArray(): [K, V][] {
    return [...this.entries()];
  }

  select(...args: [(key: K, value: V) => boolean]): OrderedHash<K, V> {
    const hash = rbObjDup(this);
    hash.selectBang(...args);
    return hash;
  }

  reject(...args: [(key: K, value: V) => boolean]): OrderedHash<K, V> {
    const hash = rbObjDup(this);
    hash.rejectBang(...args);
    return hash;
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

  /**
   * Ruby core `Hash#select!` (`vendor/ruby/v3.3.11/hash.c:2813` `rb_hash_select_bang`).
   *
   * @noRailsEquivalent PERMANENT
   */
  selectBang(...args: [(key: K, value: V) => boolean]): this | null {
    const block = args[args.length - 1];
    const n = this.size;
    if (!n) return null;
    this.deleteIf((k, v) => !block(k, v));
    if (n === this.size) return null;
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

  update(other: OrderedHash<K, V>, block?: (key: K, v1: V, v2: V) => V): this {
    for (const [k, v] of other) {
      if (block && this.has(k)) {
        this.set(k, block(k, this.get(k)!, v));
      } else {
        this.set(k, v);
      }
    }
    return this;
  }

  /**
   * Ruby core `Hash#invert` (`vendor/ruby/v3.3.11/hash.c:3900`), inherited by `OrderedHash < ::Hash`.
   *
   * @noRailsEquivalent PERMANENT
   */
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
   * Ruby core `Hash#each_value` (`vendor/ruby/v3.3.11/hash.c:3060`), inherited by `OrderedHash < ::Hash`.
   *
   * @noRailsEquivalent PERMANENT
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
   * Ruby core `Hash#each_key` (`vendor/ruby/v3.3.11/hash.c:3098`), inherited by `OrderedHash < ::Hash`.
   *
   * @noRailsEquivalent PERMANENT
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
   * Ruby core `Hash#each_pair` (`vendor/ruby/v3.3.11/hash.c:3149`), inherited by `OrderedHash < ::Hash`.
   *
   * @noRailsEquivalent PERMANENT
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
   * Ruby core `Hash#each`, defined as `rb_hash_each_pair` (`vendor/ruby/v3.3.11/hash.c:7219`).
   *
   * @noRailsEquivalent PERMANENT
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
