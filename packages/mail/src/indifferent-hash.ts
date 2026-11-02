import { Hash } from "@blazetrails/ruby-compat";

function isHash(value: unknown): boolean {
  return (
    value instanceof Map || (value != null && Object.getPrototypeOf(value) === Object.prototype)
  );
}

export class IndifferentHash<V = unknown> extends Hash<string, V> {
  static newFromHashCopyingDefault<V>(
    hash: Hash<string, V> | Record<string, V>,
  ): IndifferentHash<V> {
    const newHash = new IndifferentHash<V>(hash);
    if (hash instanceof Hash) newHash.setDefault(hash.default());
    return newHash;
  }

  constructor(constructor: unknown = {}) {
    super();
    if (isHash(constructor)) {
      this.update(constructor as Map<string, V>);
    } else {
      this.setDefault(constructor as V);
    }
  }

  override set(key: string, value: V): this {
    return this.regularWriter(this.convertKey(key), this.convertValue(value) as V);
  }

  regularWriter(key: string, value: V): this {
    return super.set(key, value);
  }

  regularUpdate(otherHash: Map<string, V> | Record<string, V>): this {
    const pairs = otherHash instanceof Map ? otherHash : Object.entries(otherHash);
    for (const [key, value] of pairs) super.set(key, value);
    return this;
  }

  store(key: string, value: V): this {
    return this.set(key, value);
  }

  update(otherHash: Map<string, V> | Record<string, V>): this {
    const pairs = otherHash instanceof Map ? otherHash : Object.entries(otherHash);
    for (const [key, value] of pairs) {
      this.regularWriter(this.convertKey(key), this.convertValue(value) as V);
    }
    return this;
  }

  mergeBang(otherHash: Map<string, V> | Record<string, V>): this {
    return this.update(otherHash);
  }

  isKey(key: string): boolean {
    return super.has(this.convertKey(key));
  }

  valuesAt(...indices: string[]): (V | null)[] {
    return indices.map((key) => this.get(this.convertKey(key)) ?? null);
  }

  dup(): IndifferentHash<V> {
    return new IndifferentHash<V>(this);
  }

  override merge(hash: object): IndifferentHash<V> {
    return this.dup().update(hash as Record<string, V>);
  }

  reverseMerge(otherHash: Hash<string, V> | Record<string, V>): IndifferentHash<V> {
    return IndifferentHash.newFromHashCopyingDefault(otherHash).merge(this);
  }

  reverseMergeBang(otherHash: Hash<string, V> | Record<string, V>): this {
    return this.replace(this.reverseMerge(otherHash));
  }

  stringifyKeysBang(): this {
    return this;
  }

  stringifyKeys(): IndifferentHash<V> {
    return this.dup();
  }

  symbolizeKeys(): Hash<string, V> {
    return this.toHash();
  }

  toOptionsBang(): this {
    return this;
  }

  override toHash(): Hash<string, V> {
    const hash = new Hash<string, V>(this.default());
    for (const [key, value] of this) hash.set(key, value);
    return hash;
  }

  /** @internal */
  protected convertKey(key: string): string {
    return key;
  }

  /** @internal */
  protected convertValue(value: unknown): unknown {
    if (value != null && value.constructor === Hash) {
      return (this.constructor as typeof IndifferentHash).newFromHashCopyingDefault(
        value as Hash<string, unknown>,
      );
    } else if (value != null && value.constructor === Object) {
      return new (this.constructor as typeof IndifferentHash)(value);
    } else if (Array.isArray(value)) {
      return value.map((e) => this.convertValue(e));
    } else {
      return value;
    }
  }
}
