import { ArgumentError, type ValueType } from "@blazetrails/activemodel";
import * as Type from "../type.js";
import { Concurrent, block as blockPass, compact, fetch } from "@blazetrails/ruby-compat";

type Key = string | number;
type Callable = (lookupKey: Key, ...args: unknown[]) => ValueType;

export class HashLookupTypeMap {
  private mapping: Map<Key, Callable> = new Map();
  private _cache = new Concurrent.Map<
    Key,
    InstanceType<typeof Concurrent.Map<unknown[], ValueType>>
  >(null, (h, key) => h.fetchOrStore(key, new Concurrent.Map()));
  constructor(_parent: HashLookupTypeMap | null = null) {}

  lookup(lookupKey: Key, ...args: unknown[]): ValueType {
    return this.fetch(lookupKey, ...args, () => Type.defaultValue());
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
      this.mapping.set(key, block);
    } else {
      this.mapping.set(key, () => value!);
    }
    this._cache.clear();
  }

  clear(): void {
    this.mapping.clear();
    this._cache.clear();
  }

  aliasType(type: string | number, aliasType: string | number): void {
    this.registerType(type, undefined, (_lookupKey, ...args: unknown[]) =>
      this.lookup(aliasType, ...args),
    );
  }

  isKey(key: string | number): boolean {
    return this.mapping.has(key);
  }

  keys(): Array<string | number> {
    return [...this.mapping.keys()];
  }

  private performFetch(type: Key, block?: Callable): ValueType;
  private performFetch(type: Key, ...args: unknown[]): ValueType;
  private performFetch(type: Key, ...args: unknown[]): ValueType {
    const block = typeof args[args.length - 1] === "function" ? args.pop() : undefined;
    return (fetch(this.mapping, type, block) as Callable)(type, ...args);
  }
}
