import { deepSymbolizeKeysBang, isPlainObject, symbolizeKeysBang } from "./hash-utils.js";
import { nestedUnderIndifferentAccess } from "./core-ext/hash/indifferent-access.js";
import {
  ArgumentError,
  type DefaultProc,
  Hash,
  KeyError,
  TypeError,
  eachPair,
  isSymbol,
  rbObjClass,
  rbObjRespondTo,
  symbolToS,
} from "@blazetrails/ruby-compat";

type AnyObject = Record<string, unknown>;

const NOT_GIVEN: AnyObject = {};
type BlockFn<V> = (key: string, oldValue: V, newValue: V) => V;

type DefaultBlock<V> = (key: string) => V;

type ToHash = { toHash(): AnyObject | Hash<unknown, unknown> };

export class HashWithIndifferentAccess<V = unknown> extends Hash<string, V> {
  constructor(
    constructor?: AnyObject | HashWithIndifferentAccess<V> | DefaultProc<string, V> | NoInfer<V>,
  ) {
    super();
    if (
      isPlainObject(constructor) ||
      constructor instanceof Hash ||
      rbObjRespondTo(constructor, "toHash")
    ) {
      this.update(constructor as AnyObject);

      const hash =
        isPlainObject(constructor) || constructor instanceof Hash
          ? constructor
          : (constructor as ToHash).toHash();
      if (hash instanceof Hash) {
        if (hash.default() != null && hash.default() !== false) {
          this.setDefault(hash.default() as V);
        }
        if (hash.defaultProc()) this.setDefaultProc(hash.defaultProc() as DefaultProc<string, V>);
      }
    } else if (constructor == null) {
    } else if (typeof constructor === "function") {
      this.setDefaultProc(constructor as DefaultProc<string, V>);
    } else {
      this.setDefault(constructor as V);
    }
  }

  static get<V = unknown>(...args: unknown[]): HashWithIndifferentAccess<V> {
    let hash: AnyObject | Hash<unknown, unknown>;
    if (args.length === 1 && (isPlainObject(args[0]) || args[0] instanceof Hash)) {
      hash = args[0] as AnyObject | Hash<unknown, unknown>;
    } else if (args.length === 1 && Array.isArray(args[0])) {
      hash = new Hash<unknown, unknown>();
      for (const [key, value] of args[0] as [unknown, unknown][]) hash.set(key, value);
    } else {
      if (args.length % 2 !== 0) throw new ArgumentError("odd number of arguments for Hash");
      hash = new Hash<unknown, unknown>();
      for (let i = 0; i < args.length; i += 2) hash.set(args[i], args[i + 1]);
    }
    return new this<V>().mergeBang(hash as AnyObject);
  }

  isExtractableOptions(): boolean {
    return true;
  }

  override get(key: string): V | undefined {
    return super.get(this.convertKey(key));
  }

  override default(...key: [] | [string]): V | undefined {
    if (key.length === 0) {
      return super.default();
    } else {
      return super.default(this.convertKey(key[0]));
    }
  }

  override set(key: string, value: V): this {
    return this.regularWriter(this.convertKey(key), this.convertValue(value, "assignment"));
  }

  store(key: string, value: V): this {
    return this.set(key, value);
  }

  regularWriter(key: string, value: V): this {
    super.set(key, value);
    return this;
  }

  regularUpdate(otherHashes: HashWithIndifferentAccess<V>, block?: BlockFn<V>): this {
    for (const [k, v] of otherHashes.entries()) {
      super.set(k, block && super.has(k) ? block(k, super.get(k)!, v) : v);
    }
    return this;
  }

  override delete(key: string): ReturnType<Hash<string, V>["delete"]> {
    const convertedKey = this.convertKey(key);
    const value = super.get(convertedKey);
    super.delete(convertedKey);
    return value;
  }

  key(key: string): boolean {
    return this.has(key);
  }

  override has(key: string): boolean {
    return super.has(this.convertKey(key));
  }

  include(key: string): boolean {
    return this.key(key);
  }

  hasKey(key: string): boolean {
    return this.key(key);
  }

  member(key: string): boolean {
    return this.key(key);
  }

  fetch(key: string, ...extras: (V | DefaultBlock<V>)[]): V {
    key = this.convertKey(key);
    if (super.has(key)) return super.get(key)!;
    if (extras.length > 0) {
      const extra = extras[0];
      return typeof extra === "function" ? (extra as DefaultBlock<V>)(key) : extra;
    }
    throw new KeyError(`key not found: "${key}"`);
  }

  valuesAt(...keys: string[]): (V | undefined)[] {
    return keys.map((key) => super.get(this.convertKey(key)));
  }

  fetchValues(...args: (string | DefaultBlock<V>)[]): V[] {
    const indices = [...args];
    const block =
      typeof indices[indices.length - 1] === "function"
        ? (indices.pop() as DefaultBlock<V>)
        : undefined;
    return (indices as string[]).map((key) => (block ? this.fetch(key, block) : this.fetch(key)));
  }

  merge(
    ...hashes: (AnyObject | HashWithIndifferentAccess<V> | BlockFn<V>)[]
  ): HashWithIndifferentAccess<V> {
    return this.dup().update(...hashes);
  }

  update(...args: (AnyObject | HashWithIndifferentAccess<V> | BlockFn<V>)[]): this {
    const rest = [...args];
    const block =
      typeof rest[rest.length - 1] === "function" ? (rest.pop() as BlockFn<V>) : undefined;
    const otherHashes = rest as (AnyObject | HashWithIndifferentAccess<V>)[];
    if (otherHashes.length === 1) {
      this.updateWithSingleArgument(otherHashes[0], block);
    } else {
      for (const otherHash of otherHashes) {
        this.updateWithSingleArgument(otherHash, block);
      }
    }
    return this;
  }

  mergeBang(...args: (AnyObject | HashWithIndifferentAccess<V> | BlockFn<V>)[]): this {
    return this.update(...args);
  }

  /** @missingRailsArgs each_pair — PERMANENT */
  private updateWithSingleArgument(
    otherHash: AnyObject | HashWithIndifferentAccess<V>,
    block?: BlockFn<V>,
  ): void {
    if (otherHash instanceof HashWithIndifferentAccess) {
      this.regularUpdate(otherHash, block);
    } else {
      const hash =
        isPlainObject(otherHash) || (otherHash as unknown) instanceof Hash
          ? otherHash
          : (otherHash as unknown as ToHash).toHash();
      const eachPairBlock = (key: string, value: V) => {
        if (block && this.key(key)) {
          value = block(this.convertKey(key), this.get(key)!, value);
        }
        this.regularWriter(this.convertKey(key), this.convertValue(value));
      };
      if (hash instanceof Map) {
        for (const [key, value] of hash) eachPairBlock(key as string, value as V);
      } else {
        eachPair(hash as Record<string, V>, eachPairBlock);
      }
    }
  }

  dup(): HashWithIndifferentAccess<V> {
    const newHash = new (this.constructor as typeof HashWithIndifferentAccess<V>)(this);
    this.setDefaults(newHash);
    return newHash;
  }

  reverseMerge(otherHash: AnyObject | HashWithIndifferentAccess<V>): HashWithIndifferentAccess<V> {
    return new HashWithIndifferentAccess<V>(otherHash).merge(this);
  }

  withDefaults(otherHash: AnyObject | HashWithIndifferentAccess<V>): HashWithIndifferentAccess<V> {
    return this.reverseMerge(otherHash);
  }

  reverseMergeBang(otherHash: AnyObject | HashWithIndifferentAccess<V>): this {
    return this.replace(this.reverseMerge(new HashWithIndifferentAccess<V>(otherHash)));
  }

  withDefaultsBang(otherHash: AnyObject | HashWithIndifferentAccess<V>): this {
    return this.reverseMergeBang(otherHash);
  }

  replace(otherHash: AnyObject | HashWithIndifferentAccess<V>): this {
    super.clear();
    return this.update(new HashWithIndifferentAccess<V>(otherHash));
  }

  deepMerge(
    other: AnyObject | HashWithIndifferentAccess<V>,
    block?: BlockFn<V>,
  ): HashWithIndifferentAccess<V> {
    return this.dup().deepMergeBang(other, block);
  }

  deepMergeBang(other: AnyObject | HashWithIndifferentAccess<V>, block?: BlockFn<V>): this {
    return this.mergeBang(other, (key: string, thisVal: V, otherVal: V) => {
      if (
        thisVal instanceof HashWithIndifferentAccess &&
        this.isDeepMerge.call(thisVal, otherVal)
      ) {
        return thisVal.deepMerge(otherVal as AnyObject, block) as V;
      } else if (block) {
        return block(key, thisVal, otherVal);
      } else {
        return otherVal;
      }
    });
  }

  isDeepMerge(other: unknown): boolean {
    return isPlainObject(other) || other instanceof Hash;
  }

  slice(...keys: string[]): HashWithIndifferentAccess<V> {
    keys = keys.map((key) => this.convertKey(key));
    const result = new HashWithIndifferentAccess<V>();
    for (const key of keys) {
      if (super.has(key)) {
        result.set(key, super.get(key)!);
      }
    }
    return result;
  }

  sliceBang(...keys: string[]): HashWithIndifferentAccess<V> {
    keys = keys.map((key) => this.convertKey(key));
    const omit = this.slice(...[...this.keys()].filter((key) => !keys.includes(key)));
    const hash = this.slice(...keys);
    hash.setDefault(this.default());
    if (this.defaultProc()) hash.setDefaultProc(this.defaultProc());
    this.replace(hash);
    return omit;
  }

  except(...keys: string[]): HashWithIndifferentAccess<V> {
    return this.dup().exceptBang(...keys);
  }

  exceptBang(...keys: string[]): HashWithIndifferentAccess<V> {
    keys.forEach((key) => this.delete(key));
    return this;
  }

  without(...keys: string[]): HashWithIndifferentAccess<V> {
    return this.except(...keys);
  }

  select(...args: [(key: string, value: V) => boolean]): HashWithIndifferentAccess<V> {
    const block = args[args.length - 1];
    const hash = this.dup();
    hash.selectBang(block);
    return hash;
  }

  selectBang(block: (key: string, value: V) => boolean): this | null {
    let changed = false;
    for (const [k, v] of [...this]) {
      if (!block(k, v)) {
        super.delete(k);
        changed = true;
      }
    }
    return changed ? this : null;
  }

  reject(...args: [(key: string, value: V) => boolean]): HashWithIndifferentAccess<V> {
    const block = args[args.length - 1];
    const hash = this.dup();
    hash.rejectBang(block);
    return hash;
  }

  rejectBang(block: (key: string, value: V) => boolean): this | null {
    return this.selectBang((k, v) => !block(k, v));
  }

  transformKeys(block: (key: string) => string): HashWithIndifferentAccess<V>;
  transformKeys(
    hash: AnyObject | null,
    block?: (key: string) => string,
  ): HashWithIndifferentAccess<V>;
  transformKeys(
    hash: AnyObject | null | ((key: string) => string),
    block?: (key: string) => string,
  ): HashWithIndifferentAccess<V> {
    const dup = new HashWithIndifferentAccess<V>(this);
    dup.transformKeysBang(hash as AnyObject | null, block);
    return dup;
  }

  transformKeysBang(block: (key: string) => string): this;
  transformKeysBang(hash: AnyObject | null, block?: (key: string) => string): this;
  transformKeysBang(
    hash: AnyObject | null | ((key: string) => string),
    block?: (key: string) => string,
  ): this {
    if (typeof hash === "function") {
      block = hash;
      hash = NOT_GIVEN;
    }

    if (hash === null) {
      throw new TypeError("no implicit conversion of nil into Hash");
    } else if (NOT_GIVEN === hash) {
      for (const key of [...this.keys()]) this.set(block!(key), this.delete(key));
    } else if (block) {
      for (const key of [...this.keys()]) {
        this.set((hash[key] as string) || block(key), this.delete(key));
      }
    } else {
      for (const key of [...this.keys()]) this.set((hash[key] as string) || key, this.delete(key));
    }

    return this;
  }

  transformValues<W = V>(block: (value: V) => W): HashWithIndifferentAccess<W> {
    const hash = this.dup() as unknown as HashWithIndifferentAccess<W>;
    (hash as unknown as HashWithIndifferentAccess<V>).transformValuesBang(block as never);
    return hash;
  }

  transformValuesBang(block: (value: V) => V): this {
    for (const [k, v] of [...this]) super.set(k, block(v));
    return this;
  }

  compact(): HashWithIndifferentAccess<NonNullable<V>> {
    const hash = this.dup();
    hash.compactBang();
    return hash as HashWithIndifferentAccess<NonNullable<V>>;
  }

  compactBang(): this | null {
    return this.rejectBang((_k, v) => v == null);
  }

  extractBang(...keys: string[]): HashWithIndifferentAccess<V> {
    const result = new (this.constructor as typeof HashWithIndifferentAccess<V>)();
    for (const key of keys) if (this.hasKey(key)) result.set(key, this.delete(key));
    return result;
  }

  deepTransformKeys(block: (key: string) => string): HashWithIndifferentAccess<V> {
    return this._deepTransformKeysInObject(this, block) as HashWithIndifferentAccess<V>;
  }

  deepTransformKeysBang(block: (key: string) => string): this {
    return this._deepTransformKeysInObjectBang(this, block) as this;
  }

  deepStringifyKeys(): HashWithIndifferentAccess<V> {
    return this.deepTransformKeys((k) => (isSymbol(k) ? symbolToS(k) : String(k)));
  }

  deepStringifyKeysBang(): this {
    return this.deepTransformKeysBang((k) => (isSymbol(k) ? symbolToS(k) : String(k)));
  }

  any(fn?: (pair: [string, V]) => boolean): boolean {
    if (!fn) return this.size > 0;
    for (const pair of this) {
      if (fn(pair)) return true;
    }
    return false;
  }

  all(fn?: (pair: [string, V]) => boolean): boolean {
    if (!fn) return true;
    for (const pair of this) {
      if (!fn(pair)) return false;
    }
    return true;
  }

  none(fn?: (pair: [string, V]) => boolean): boolean {
    if (!fn) return this.size === 0;
    return !this.any(fn);
  }

  count(fn?: (pair: [string, V]) => boolean): number {
    if (!fn) return this.size;
    let n = 0;
    for (const pair of this) {
      if (fn(pair)) n++;
    }
    return n;
  }

  find(fn: (pair: [string, V]) => boolean): [string, V] | undefined {
    for (const pair of this) {
      if (fn(pair)) return pair;
    }
    return undefined;
  }

  each(fn: (pair: [string, V]) => void): this {
    for (const pair of this) {
      fn(pair);
    }
    return this;
  }

  map<T>(fn: (pair: [string, V]) => T): T[] {
    const result: T[] = [];
    for (const pair of this) {
      result.push(fn(pair));
    }
    return result;
  }

  assoc(key: string): [string, V] | undefined {
    key = this.convertKey(key);
    if (super.has(key)) {
      return [key, super.get(key)!];
    }
    return undefined;
  }

  invert(): HashWithIndifferentAccess<string> {
    const result = new HashWithIndifferentAccess<string>();
    for (const [k, v] of this) {
      result.set(String(v), k);
    }
    return result;
  }

  /**
   * Mirrors `dig` (hash_with_indifferent_access.rb:208-211) — the first key is
   * converted, then `super` is `rb_hash_dig` (`vendor/ruby/hash.c:4627`),
   * whose `rb_hash_aref` yields to the default_proc on a miss the way `[]`
   * does, and whose remaining keys go to `rb_obj_dig`
   * (`vendor/ruby/object.c:3906`): `nil` ends the walk, an Array is indexed
   * through `rb_ary_at` — whose index goes through `NUM2LONG`
   * (`vendor/ruby/array.c:1881-1883`), so a String identifier is a TypeError
   * there and not an index — an object that answers `dig` is handed the rest, and
   * anything else is `no_dig_method`'s TypeError (`object.c:3897-3900`).
   */
  dig(key: string, ...identifiers: (string | number)[]): unknown {
    let obj: unknown = this.get(key);
    for (let i = 0; i < identifiers.length; i++) {
      const identifier = identifiers[i];
      if (obj == null) return undefined;
      if (Array.isArray(obj)) {
        if (typeof identifier !== "number") {
          throw new TypeError(`no implicit conversion of ${rbObjClass(identifier)} into Integer`);
        }
        obj = obj[identifier < 0 ? obj.length + identifier : identifier];
        continue;
      }
      const dig = (obj as { dig?: unknown }).dig;
      if (typeof dig === "function") {
        return (dig as (...args: (string | number)[]) => unknown).apply(obj, identifiers.slice(i));
      }

      throw new TypeError(`${rbObjClass(obj)} does not have #dig method`);
    }
    return obj;
  }

  toParam(): string {
    const parts: string[] = [];
    const sorted = [...this.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [k, v] of sorted) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.join("&").replace(/%20/g, "+");
  }

  toQuery(): string {
    return this.toParam();
  }

  withIndifferentAccess(): HashWithIndifferentAccess<V> {
    return this.dup();
  }

  stringifyKeys(): HashWithIndifferentAccess<V> {
    return this.transformKeys((k) => (isSymbol(k) ? symbolToS(k) : String(k)));
  }

  stringifyKeysBang(): this {
    return this.transformKeysBang((k) => (isSymbol(k) ? symbolToS(k) : String(k)));
  }

  symbolizeKeys(): Hash<string, unknown> {
    return symbolizeKeysBang(this.toHash());
  }

  toOptions(): Hash<string, unknown> {
    return this.symbolizeKeys();
  }

  deepSymbolizeKeys(): Hash<string, unknown> {
    return deepSymbolizeKeysBang(this.toHash());
  }

  toOptionsBang(): this {
    return this;
  }

  nestedUnderIndifferentAccess(): this {
    return this;
  }

  toHash(): Hash<string, unknown> {
    const copy = new Hash<string, unknown>();
    for (const [key, value] of this) {
      copy.set(key, value);
    }
    for (const [key, value] of copy) {
      copy.set(key, this.convertValueToHash(value as V));
    }
    this.setDefaults(copy);
    return copy;
  }

  toProc(): (key: string) => V | undefined {
    return (key: string) => this.get(key);
  }

  private _deepTransformKeysInObject(object: unknown, block: (key: string) => string): unknown {
    if (object instanceof Hash) {
      const result = new (this.constructor as typeof HashWithIndifferentAccess<unknown>)();
      for (const [key, value] of object) {
        result.set(block(key as string), this._deepTransformKeysInObject(value, block));
      }
      return result;
    } else if (Array.isArray(object)) {
      return object.map((e) => this._deepTransformKeysInObject(e, block));
    } else {
      return object;
    }
  }

  private _deepTransformKeysInObjectBang(object: unknown, block: (key: string) => string): unknown {
    if (object instanceof Hash) {
      for (const key of [...object.keys()]) {
        const value = object.get(key);
        object.delete(key);
        object.set(block(key as string), this._deepTransformKeysInObjectBang(value, block));
      }
      return object;
    } else if (Array.isArray(object)) {
      object.forEach((e, i) => (object[i] = this._deepTransformKeysInObjectBang(e, block)));
      return object;
    } else {
      return object;
    }
  }

  private convertKey(key: unknown): string {
    return typeof key === "string" && key.startsWith(":") ? key.slice(1) : (key as string);
  }

  private convertValue(value: V, conversion?: string): V {
    if (value instanceof Hash && rbObjRespondTo(value, "nestedUnderIndifferentAccess")) {
      return (
        value as unknown as { nestedUnderIndifferentAccess(): V }
      ).nestedUnderIndifferentAccess();
    } else if (value instanceof Hash) {
      return new HashWithIndifferentAccess(value) as V;
    } else if (isPlainObject(value)) {
      return nestedUnderIndifferentAccess(value) as V;
    } else if (Array.isArray(value)) {
      let array = value as unknown[];
      if (conversion !== "assignment" || Object.isFrozen(array)) {
        array = [...array];
      }
      for (let i = 0; i < array.length; i++) {
        array[i] = this.convertValue(array[i] as V, conversion);
      }
      return array as V;
    } else {
      return value;
    }
  }

  private setDefaults(target: Hash<string, V> | Hash<string, unknown>): void {
    const seat = target as Hash<string, V>;
    if (this.defaultProc()) {
      seat.setDefaultProc(this.defaultProc());
    } else {
      seat.setDefault(this.default());
    }
  }

  private convertValueToHash(value: V): unknown {
    if (value instanceof HashWithIndifferentAccess) {
      return value.toHash();
    } else if (Array.isArray(value)) {
      return (value as unknown[]).map((e) => this.convertValueToHash(e as V));
    } else {
      return value;
    }
  }
}
