import { ArgumentError, ValueType } from "@blazetrails/activemodel";
import { Concurrent, block as blockPass, rbEqq } from "@blazetrails/ruby-compat";

export class TypeMap {
  private _mapping: Map<string | RegExp, (...args: string[]) => ValueType> = new Map();
  private _parent?: TypeMap;
  private _cache = new Concurrent.Map<string | null, ValueType>();

  constructor(parent?: TypeMap) {
    this._parent = parent;
  }

  lookup(lookupKey: string | null): ValueType {
    return this.fetch(lookupKey, () => new ValueType());
  }

  fetch(lookupKey: string | null, block?: (key: string) => ValueType): ValueType {
    return this._cache.fetchOrStore(
      lookupKey,
      blockPass(() => this.performFetch(lookupKey, block)),
    );
  }

  registerType(
    key: string | RegExp,
    value?: ValueType,
    block?: (...args: string[]) => ValueType,
  ): void {
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
  protected performFetch(lookupKey: string | null, block?: (key: string) => ValueType): ValueType {
    const matchingPair = [...this._mapping].reverse().find(([key]) => rbEqq(key, lookupKey));

    if (matchingPair) {
      return matchingPair[1](lookupKey as string);
    } else if (this._parent) {
      return this._parent.performFetch(lookupKey, block);
    } else {
      return block!(lookupKey as string);
    }
  }
}
