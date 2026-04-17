import { Type, ValueType } from "@blazetrails/activemodel";

/**
 * A type map that uses exact string keys (hash lookup) rather than
 * regex matching. More efficient for known type names.
 *
 * Mirrors: ActiveRecord::Type::HashLookupTypeMap
 */
export class HashLookupTypeMap {
  private _mapping: Map<string | number, (lookupKey: string | number, ...args: unknown[]) => Type> =
    new Map();
  private _cache: Map<string | number, Map<string, Type>> = new Map();

  lookup(lookupKey: string | number, ...args: unknown[]): Type {
    return this.fetch(lookupKey, ...args, () => new ValueType());
  }

  fetch(lookupKey: string | number, ...rest: unknown[]): Type {
    let fallback: ((lookupKey: string | number, ...args: unknown[]) => Type) | undefined;
    let args: unknown[];

    // Last arg is the fallback if it's a function
    if (rest.length > 0 && typeof rest[rest.length - 1] === "function") {
      fallback = rest[rest.length - 1] as (lookupKey: string | number, ...a: unknown[]) => Type;
      args = rest.slice(0, -1);
    } else {
      args = rest;
    }
    let cacheable = true;
    const parts: string[] = [];
    for (const a of args) {
      if (a === undefined) {
        parts.push("\x00undef");
        continue;
      }
      if (a === null) {
        parts.push("\x00null");
        continue;
      }
      if (typeof a === "bigint") {
        parts.push(`\x00bigint:${a}`);
        continue;
      }
      if (typeof a === "symbol") {
        parts.push(`\x00symbol:${a.toString()}`);
        continue;
      }
      if (typeof a === "function") {
        parts.push(`\x00fn:${a.name || "anon"}`);
        continue;
      }
      try {
        parts.push(JSON.stringify(a) ?? `\x00${typeof a}`);
      } catch {
        cacheable = false;
        break;
      }
    }

    if (!cacheable) {
      return this._performFetch(lookupKey, args, fallback);
    }

    const argsKey = parts.join("\x01");

    let keyCache = this._cache.get(lookupKey);
    if (!keyCache) {
      keyCache = new Map();
      this._cache.set(lookupKey, keyCache);
    }

    const cached = keyCache.get(argsKey);
    if (cached) return cached;

    const result = this._performFetch(lookupKey, args, fallback);
    keyCache.set(argsKey, result);
    return result;
  }

  registerType(
    key: string | number,
    value?: Type | ((lookupKey: string | number, ...args: unknown[]) => Type),
  ): void {
    if (value == null) throw new Error("registerType requires a value or block");
    if (typeof value === "function") {
      this._mapping.set(key, value as (...args: unknown[]) => Type);
    } else {
      this._mapping.set(key, () => value as Type);
    }
    this._cache.clear();
  }

  clear(): void {
    this._mapping.clear();
    this._cache.clear();
  }

  aliasType(type: string | number, targetType: string | number): void {
    this.registerType(type, (_lookupKey: unknown, ...args: unknown[]) =>
      this.lookup(targetType, ...args),
    );
  }

  has(key: string | number): boolean {
    return this._mapping.has(key);
  }

  keys(): Array<string | number> {
    return [...this._mapping.keys()];
  }

  private _performFetch(
    type: string | number,
    args: unknown[],
    fallback?: (lookupKey: string | number, ...args: unknown[]) => Type,
  ): Type {
    const factory = this._mapping.get(type);
    if (factory) return factory(type, ...args);
    if (fallback) return fallback(type, ...args);
    return new ValueType();
  }
}
