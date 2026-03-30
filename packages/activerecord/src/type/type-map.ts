/**
 * Mirrors: ActiveRecord::Type::TypeMap
 */
import { Type, ValueType } from "@blazetrails/activemodel";

export class TypeMap {
  private _mapping: Map<string | RegExp, (lookupKey: string) => Type> = new Map();
  private _parent?: TypeMap;
  private _cache: Map<string, Type> = new Map();

  constructor(parent?: TypeMap) {
    this._parent = parent;
  }

  lookup(lookupKey: string): Type {
    return this.fetch(lookupKey, () => new ValueType());
  }

  fetch(lookupKey: string, fallback?: (key: string) => Type): Type {
    const cached = this._cache.get(lookupKey);
    if (cached) return cached;
    const result = this._performFetch(lookupKey, fallback);
    this._cache.set(lookupKey, result);
    return result;
  }

  registerType(key: string | RegExp, value?: Type, block?: (lookupKey: string) => Type): void {
    if (!value && !block) throw new Error("registerType requires a value or block");
    if (block) {
      this._mapping.set(key, block);
    } else {
      this._mapping.set(key, () => value!);
    }
    this._cache.clear();
  }

  aliasType(key: string, targetKey: string): void {
    this.registerType(key, undefined, (sqlType: string) => {
      const metadata = sqlType.match(/\(.*\)/)?.[0] ?? "";
      return this.lookup(`${targetKey}${metadata}`);
    });
  }

  protected _performFetch(lookupKey: string, fallback?: (key: string) => Type): Type {
    const entries = [...this._mapping.entries()].reverse();
    for (const [key, factory] of entries) {
      const matches =
        typeof key === "string" ? key === lookupKey : ((key.lastIndex = 0), key.test(lookupKey));
      if (matches) return factory(lookupKey);
    }
    if (this._parent) {
      return this._parent._performFetch(lookupKey, fallback);
    }
    if (fallback) return fallback(lookupKey);
    return new ValueType();
  }
}
