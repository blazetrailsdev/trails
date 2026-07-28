/**
 * Mirrors: ActiveRecord::Type::TypeMap
 */
import { ArgumentError, Type, ValueType } from "@blazetrails/activemodel";

export class TypeMap {
  private _mapping: Map<string | RegExp, (lookupKey: string) => Type> = new Map();
  private _parent?: TypeMap;
  private _cache: Map<string | null, Type> = new Map();

  constructor(parent?: TypeMap) {
    this._parent = parent;
  }

  // `lookupKey` is nullable because Rails reaches here with a nil `sql_type`
  // (`lookup_cast_type(column.sql_type)`, abstract/quoting.rb:125-127); as with
  // `Regexp#===(nil)`, a nil key matches nothing and falls to the default type.
  lookup(lookupKey: string | null): Type {
    return this.fetch(lookupKey, () => new ValueType());
  }

  fetch(lookupKey: string | null, fallback?: (key: string) => Type): Type {
    const cached = this._cache.get(lookupKey);
    if (cached) return cached;
    const result = this._performFetch(lookupKey, fallback);
    this._cache.set(lookupKey, result);
    return result;
  }

  registerType(key: string | RegExp, value?: Type, block?: (lookupKey: string) => Type): void {
    if (!value && !block) throw new ArgumentError("registerType requires a value or block");
    if (block) {
      this._mapping.set(key, block);
    } else {
      this._mapping.set(key, () => value!);
    }
    this._cache.clear();
  }

  aliasType(key: string | RegExp, targetKey: string): void {
    this.registerType(key, undefined, (sqlType: string) => {
      const metadata = sqlType.match(/\(.*\)/)?.[0] ?? "";
      return this.lookup(`${targetKey}${metadata}`);
    });
  }

  protected _performFetch(lookupKey: string | null, fallback?: (key: string) => Type): Type {
    const entries = [...this._mapping.entries()].reverse();
    for (const [key, factory] of entries) {
      const matches =
        typeof key === "string"
          ? key === lookupKey
          : lookupKey !== null && ((key.lastIndex = 0), key.test(lookupKey));
      if (matches) return factory(lookupKey as string);
    }
    if (this._parent) {
      return this._parent._performFetch(lookupKey, fallback);
    }
    if (fallback) return fallback(lookupKey as string);
    return new ValueType();
  }
}

/**
 * Walk the mapping in reverse-registration order looking for a key match.
 * Falls back to parent TypeMap, then to the block/fallback if provided.
 *
 * Mirrors: ActiveRecord::Type::TypeMap#perform_fetch (protected)
 *
 * @internal
 */
export function performFetch(
  typeMap: TypeMap,
  lookupKey: string | null,
  fallback?: (key: string) => Type,
): Type {
  return (typeMap as any)._performFetch(lookupKey, fallback);
}
