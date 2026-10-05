import { ArgumentError, ValueType } from "@blazetrails/activemodel";
import { Concurrent, block as blockPass, compact } from "@blazetrails/ruby-compat";

type Key = string | number;
type Callable = (lookupKey: Key, ...args: unknown[]) => ValueType;

export class HashLookupTypeMap {
  private _mapping: Map<Key, Callable> = new Map();
  private _cache = new Concurrent.Map<
    Key,
    InstanceType<typeof Concurrent.Map<unknown[], ValueType>>
  >(null, (h, key) => h.fetchOrStore(key, new Concurrent.Map()));
  constructor(_parent: HashLookupTypeMap | null = null) {}

  lookup(lookupKey: Key, ...args: unknown[]): ValueType {
    return this.fetch(lookupKey, ...args, () => new ValueType());
  }

  fetch(lookupKey: Key, block: Callable): ValueType;
  fetch(lookupKey: Key, ...args: unknown[]): ValueType;
  fetch(lookupKey: Key, ...args: unknown[]): ValueType {
    const block = typeof args[args.length - 1] === "function" ? args.pop() : undefined;
    return this._cache.get(lookupKey)!.fetchOrStore(
      args,
      blockPass(() => this.performFetch(lookupKey, ...args, ...compact([block]))),
    );
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
  private performFetch(type: Key, block?: Callable): ValueType;
  private performFetch(type: Key, ...args: unknown[]): ValueType;
  private performFetch(type: Key, ...args: unknown[]): ValueType {
    const block = typeof args[args.length - 1] === "function" ? args.pop() : undefined;
    return (this._mapping.get(type) ?? (block as Callable))(type, ...args);
  }
}
