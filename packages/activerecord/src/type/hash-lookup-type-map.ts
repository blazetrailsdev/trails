import { ArgumentError, ValueType } from "@blazetrails/activemodel";

export class HashLookupTypeMap {
  private _mapping: Map<
    string | number,
    (lookupKey: string | number, ...args: unknown[]) => ValueType
  > = new Map();
  private _cache: Map<string | number, Map<string, ValueType>> = new Map();
  constructor(_parent: HashLookupTypeMap | null = null) {}

  lookup(lookupKey: string | number, ...args: unknown[]): ValueType {
    return this.fetch(lookupKey, ...args, () => new ValueType());
  }

  fetch(lookupKey: string | number, ...rest: unknown[]): ValueType {
    let fallback: ((lookupKey: string | number, ...args: unknown[]) => ValueType) | undefined;
    let args: unknown[];

    if (rest.length > 0 && typeof rest[rest.length - 1] === "function") {
      fallback = rest[rest.length - 1] as (
        lookupKey: string | number,
        ...a: unknown[]
      ) => ValueType;
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
      return this.performFetch(lookupKey, args, fallback);
    }

    const argsKey = parts.join("\x01");

    let keyCache = this._cache.get(lookupKey);
    if (!keyCache) {
      keyCache = new Map();
      this._cache.set(lookupKey, keyCache);
    }

    const cached = keyCache.get(argsKey);
    if (cached) return cached;

    const result = this.performFetch(lookupKey, args, fallback);
    keyCache.set(argsKey, result);
    return result;
  }

  registerType(
    key: string | number,
    value?: ValueType,
    block?: (lookupKey: string | number, ...args: unknown[]) => ValueType,
  ): void {
    if (value == null && block == null) {
      throw new ArgumentError("registerType requires a value or block");
    }
    if (block) {
      this._mapping.set(key, block);
    } else {
      this._mapping.set(key, () => value!);
    }
    this._cache.clear();
  }

  clear(): void {
    this._mapping.clear();
    this._cache.clear();
  }

  aliasType(type: string | number, aliasType: string | number): void {
    this.registerType(type, undefined, (_lookupKey, ...args: unknown[]) =>
      this.lookup(aliasType, ...args),
    );
  }

  isKey(key: string | number): boolean {
    return this._mapping.has(key);
  }

  keys(): Array<string | number> {
    return [...this._mapping.keys()];
  }

  /**
   * @missingRailsCall fetch — PERMANENT
   * @missingRailsCall call — PERMANENT
   */
  private performFetch(
    type: string | number,
    args: unknown[],
    fallback?: (lookupKey: string | number, ...args: unknown[]) => ValueType,
  ): ValueType {
    const factory = this._mapping.get(type);
    if (factory) return factory(type, ...args);
    if (fallback) return fallback(type, ...args);
    return new ValueType();
  }
}
