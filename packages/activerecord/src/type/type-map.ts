import { ArgumentError, Type, ValueType } from "@blazetrails/activemodel";

export class TypeMap {
  private _mapping: Map<string | RegExp, (...args: string[]) => Type> = new Map();
  private _parent?: TypeMap;
  private _cache: Map<string | null, Type> = new Map();

  constructor(parent?: TypeMap) {
    this._parent = parent;
  }

  lookup(lookupKey: string | null): Type {
    return this.fetch(lookupKey, () => new ValueType());
  }

  fetch(lookupKey: string | null, fallback?: (key: string) => Type): Type {
    const cached = this._cache.get(lookupKey);
    if (cached) return cached;
    const result = this.performFetch(lookupKey, fallback);
    this._cache.set(lookupKey, result);
    return result;
  }

  registerType(key: string | RegExp, value?: Type, block?: (...args: string[]) => Type): void {
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

  /** @missingRailsCall call — PERMANENT */
  protected performFetch(lookupKey: string | null, fallback?: (key: string) => Type): Type {
    const matchingPair = [...this._mapping.entries()]
      .reverse()
      .find(([key]) =>
        typeof key === "string"
          ? key === lookupKey
          : lookupKey !== null && ((key.lastIndex = 0), key.test(lookupKey)),
      );

    if (matchingPair) {
      return matchingPair[1](lookupKey as string);
    } else if (this._parent) {
      return this._parent.performFetch(lookupKey, fallback);
    } else if (fallback) {
      return fallback(lookupKey as string);
    }
    return new ValueType();
  }
}
