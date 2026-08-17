/**
 * Mirrors: ActiveSupport::HashWithIndifferentAccess
 * (activesupport/lib/active_support/hash_with_indifferent_access.rb).
 *
 * Rails' class subclasses `Hash`, so its readers and writers are spelled with
 * the `[]` / `[]=` operators. Those two have no parity:api counterpart — see
 * the Operators table in docs/ruby-ts-conventions.md, which maps them to
 * `get()` / `set()` — so this class keeps that spelling and the `key?` family
 * hangs off it under the conventions' predicate names. Everything else keeps
 * Rails' own name.
 */

import {
  deepMerge as deepMergeObj,
  deepSymbolizeKeysBang,
  isPlainObject,
  symbolizeKeysBang,
} from "./hash-utils.js";
import { nestedUnderIndifferentAccess } from "./core-ext/hash/indifferent-access.js";
import { KeyError } from "./core-ext/key-error.js";

type AnyObject = Record<string, unknown>;

/**
 * `NOT_GIVEN = Object.new` (hash_with_indifferent_access.rb:336) — the sentinel
 * `transform_keys`/`transform_keys!` compare against so an explicitly-passed
 * `nil` is told apart from an omitted argument.
 */
const NOT_GIVEN: AnyObject = {};

/**
 * Mirror of Ruby's `TypeError` — what `Hash#transform_keys!` raises for a `nil`
 * hash. Its throw site carries an eslint-disable because `rails-error-parity`
 * matches on the native name.
 * @internal
 */
class TypeError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeError";
  }
}

/**
 * The `update`/`merge!` duplicate-key block (hash_with_indifferent_access.rb:127-131):
 * called with the key, the receiver's value and the other hash's value.
 */
type BlockFn<V> = (key: string, oldValue: V, newValue: V) => V;

/**
 * The `fetch`/`fetch_values` block (hash_with_indifferent_access.rb:195, :253):
 * called with the converted key when it is not in the hash.
 */
type DefaultBlock<V> = (key: string) => V;

export class HashWithIndifferentAccess<V = unknown> {
  private data: Map<string, V>;

  constructor(constructor?: AnyObject | HashWithIndifferentAccess<V>) {
    this.data = new Map();
    // Mirrors `initialize` (hash_with_indifferent_access.rb:70-83): the
    // populated arm goes through `update`, so every key gets `convert_key` and
    // every value `convert_value`. Rails' `else super(constructor)` arm sets a
    // Hash default value, which this class does not model.
    if (constructor != null) {
      this.update(constructor);
    }
  }

  /**
   * Returns +true+ so that `Array#extract_options!` finds members of
   * this class.
   */
  isExtractableOptions(): boolean {
    return true;
  }

  /**
   * Mirrors `[]` (hash_with_indifferent_access.rb:166-168) — the reader that
   * takes either spelling of the key.
   */
  get(key: string): V | undefined {
    return this.data.get(this.convertKey(key));
  }

  /**
   * Mirrors `[]=` (hash_with_indifferent_access.rb:98-100).
   */
  set(key: string, value: V): this {
    return this.regularWriter(this.convertKey(key), this.convertValue(value, "assignment"));
  }

  /** `alias_method :store, :[]=` (hash_with_indifferent_access.rb:102). */
  store(key: string, value: V): this {
    return this.set(key, value);
  }

  /**
   * `alias_method :regular_writer, :[]=` (hash_with_indifferent_access.rb:91)
   * — the un-converting `Hash#[]=` the converting writer delegates to.
   */
  regularWriter(key: string, value: V): this {
    this.data.set(key, value);
    return this;
  }

  /**
   * `alias_method :regular_update, :update` (hash_with_indifferent_access.rb:92)
   * — the un-converting `Hash#update`.
   */
  regularUpdate(other: HashWithIndifferentAccess<V>, block?: BlockFn<V>): this {
    for (const [k, v] of other.entries()) {
      this.data.set(k, block && this.data.has(k) ? block(k, this.data.get(k)!, v) : v);
    }
    return this;
  }

  delete(key: string): boolean {
    return this.data.delete(this.convertKey(key));
  }

  /**
   * Mirrors `key?` (hash_with_indifferent_access.rb:150-152) — checks the hash
   * for a key in either spelling.
   */
  key(key: string): boolean {
    return this.data.has(this.convertKey(key));
  }

  /** `alias_method :include?, :key?` (hash_with_indifferent_access.rb:154). */
  include(key: string): boolean {
    return this.key(key);
  }

  /** `alias_method :has_key?, :key?` (hash_with_indifferent_access.rb:155). */
  hasKey(key: string): boolean {
    return this.key(key);
  }

  /** `alias_method :member?, :key?` (hash_with_indifferent_access.rb:156). */
  member(key: string): boolean {
    return this.key(key);
  }

  /**
   * Mirrors `fetch` (hash_with_indifferent_access.rb:195-197) — `Hash#fetch`
   * semantics over the converted key: a stored value wins over the default
   * (including a stored `null`), an absent key with neither a default nor a
   * block raises `KeyError`.
   *
   * Ruby's block is syntactically separate from `*extras`; JS has no such
   * separation, so a single trailing function argument is read as the block —
   * `Hash#fetch` accepts at most one extra anyway, and `counters.fetch(:bar) { 0 }`
   * has no other spelling here.
   */
  fetch(key: string, ...extras: (V | DefaultBlock<V>)[]): V {
    key = this.convertKey(key);
    if (this.data.has(key)) return this.data.get(key)!;
    if (extras.length > 0) {
      const extra = extras[0];
      return typeof extra === "function" ? (extra as DefaultBlock<V>)(key) : extra;
    }
    throw new KeyError(`key not found: "${key}"`);
  }

  /**
   * Mirrors `values_at` (hash_with_indifferent_access.rb:239-242).
   */
  valuesAt(...keys: string[]): (V | undefined)[] {
    return keys.map((key) => this.data.get(this.convertKey(key)));
  }

  /**
   * Mirrors `fetch_values` (hash_with_indifferent_access.rb:251-254) — like
   * `values_at`, but raises for a key that is not there.
   */
  fetchValues(...args: (string | DefaultBlock<V>)[]): V[] {
    const indices = [...args];
    const block =
      typeof indices[indices.length - 1] === "function"
        ? (indices.pop() as DefaultBlock<V>)
        : undefined;
    return (indices as string[]).map((key) => (block ? this.fetch(key, block) : this.fetch(key)));
  }

  get size(): number {
    return this.data.size;
  }

  keys(): IterableIterator<string> {
    return this.data.keys();
  }

  values(): IterableIterator<V> {
    return this.data.values();
  }

  entries(): IterableIterator<[string, V]> {
    return this.data.entries();
  }

  forEach(fn: (value: V, key: string) => void): void {
    this.data.forEach(fn);
  }

  /**
   * Mirrors `merge` (hash_with_indifferent_access.rb:274-276) — the same
   * semantics as `update`, but returns a new hash instead of modifying the
   * receiver.
   */
  merge(
    ...hashes: (AnyObject | HashWithIndifferentAccess<V> | BlockFn<V>)[]
  ): HashWithIndifferentAccess<V> {
    return new HashWithIndifferentAccess<V>(this).update(...hashes);
  }

  /**
   * Mirrors `update` (hash_with_indifferent_access.rb:132-141) — merges the
   * given hashes in place, respecting indifferent access; a block resolves
   * duplicated keys.
   */
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

  /** `alias_method :merge!, :update` (hash_with_indifferent_access.rb:143). */
  mergeBang(...args: (AnyObject | HashWithIndifferentAccess<V> | BlockFn<V>)[]): this {
    return this.update(...args);
  }

  /**
   * Mirrors `update_with_single_argument`
   * (hash_with_indifferent_access.rb:424-434).
   */
  private updateWithSingleArgument(
    otherHash: AnyObject | HashWithIndifferentAccess<V>,
    block?: BlockFn<V>,
  ): void {
    if (otherHash instanceof HashWithIndifferentAccess) {
      this.regularUpdate(otherHash, block);
    } else {
      for (const [key, value] of Object.entries(otherHash)) {
        let v = value as V;
        if (block && this.key(key)) {
          v = block(this.convertKey(key), this.get(key)!, v);
        }
        this.regularWriter(this.convertKey(key), this.convertValue(v));
      }
    }
  }

  /**
   * Mirrors `replace` (hash_with_indifferent_access.rb:298-300) — replaces the
   * contents of this hash with `otherHash`, under indifferent access.
   */
  replace(otherHash: AnyObject | HashWithIndifferentAccess<V>): this {
    this.data.clear();
    return this.update(new HashWithIndifferentAccess<V>(otherHash));
  }

  /**
   * Deep merge, recursively merging nested objects.
   */
  deepMerge(other: AnyObject | HashWithIndifferentAccess<V>): HashWithIndifferentAccess<V> {
    const selfObj = this.toHash();
    const otherObj = other instanceof HashWithIndifferentAccess ? other.toHash() : other;
    const merged = deepMergeObj(selfObj, otherObj);
    return new HashWithIndifferentAccess<V>(merged);
  }

  /**
   * Return a new HashWithIndifferentAccess with only the specified keys.
   */
  slice(...keys: string[]): HashWithIndifferentAccess<V> {
    keys = keys.map((key) => this.convertKey(key));
    const result = new HashWithIndifferentAccess<V>();
    for (const key of keys) {
      if (this.data.has(key)) {
        result.set(key, this.data.get(key)!);
      }
    }
    return result;
  }

  /**
   * Mirrors `slice!` (hash_with_indifferent_access.rb:366-369) — the keys are
   * converted, then `Hash#slice!` (core_ext/hash/slice.rb:10-17) replaces the
   * hash with the given keys and returns the removed pairs. The `default` /
   * `default_proc` lines have no counterpart here: this class does not model a
   * Hash default (see `initialize`).
   */
  sliceBang(...keys: string[]): HashWithIndifferentAccess<V> {
    keys = keys.map((key) => this.convertKey(key));
    const omit = this.slice(...[...this.keys()].filter((key) => !keys.includes(key)));
    const hash = this.slice(...keys);
    this.replace(hash);
    return omit;
  }

  /**
   * Return a new HashWithIndifferentAccess without the specified keys.
   */
  except(...keys: string[]): HashWithIndifferentAccess<V> {
    return new HashWithIndifferentAccess<V>(this.toHash()).exceptBang(...keys);
  }

  /**
   * Removes the given keys from the hash and returns it — the `Hash#except!`
   * (core_ext/hash/except.rb:8-11) `except` delegates to.
   */
  exceptBang(...keys: string[]): HashWithIndifferentAccess<V> {
    keys.forEach((key) => this.delete(key));
    return this;
  }

  /**
   * Alias for except — Rails without method.
   */
  without(...keys: string[]): HashWithIndifferentAccess<V> {
    return this.except(...keys);
  }

  /**
   * Mirror Rails `select` (hash_with_indifferent_access.rb:323-326), which
   * delegates to `Hash#select!` and so yields `|key, value|`.
   */
  select(fn: (key: string, value: V) => boolean): HashWithIndifferentAccess<V> {
    const result = new HashWithIndifferentAccess<V>();
    for (const [k, v] of this.data) {
      if (fn(k, v)) {
        result.set(k, v);
      }
    }
    return result;
  }

  /**
   * Mirror Rails `reject` (hash_with_indifferent_access.rb:328-331), which
   * delegates to `Hash#reject!` and so yields `|key, value|`.
   */
  reject(fn: (key: string, value: V) => boolean): HashWithIndifferentAccess<V> {
    return this.select((k, v) => !fn(k, v));
  }

  /**
   * Mirrors `transform_keys` (hash_with_indifferent_access.rb:338-341) —
   * `dup.tap { |h| h.transform_keys!(hash, &block) }`, so the mapping hash and
   * the block arms are the ones `transform_keys!` documents below.
   */
  transformKeys(
    hash: AnyObject | null | ((key: string) => string) = NOT_GIVEN,
    block?: (key: string) => string,
  ): HashWithIndifferentAccess<V> {
    const dup = new HashWithIndifferentAccess<V>(this);
    dup.transformKeysBang(hash, block);
    return dup;
  }

  /**
   * Mirrors `transform_keys!` (hash_with_indifferent_access.rb:345-357). Ruby's
   * block is syntactically separate from the optional `hash`; JS has no such
   * separation, so a function passed in the `hash` slot is read as the block —
   * the same reading `fetch` above gives a trailing function.
   */
  transformKeysBang(
    hash: AnyObject | null | ((key: string) => string) = NOT_GIVEN,
    block?: (key: string) => string,
  ): this {
    if (typeof hash === "function") {
      block = hash;
      hash = NOT_GIVEN;
    }

    if (hash === null) {
      // `super` — `Hash#transform_keys!` takes no implicit conversion of nil.
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new TypeError("no implicit conversion of nil into Hash");
    } else if (NOT_GIVEN === hash) {
      for (const key of [...this.keys()]) {
        const value = this.get(key)!;
        this.delete(key);
        this.set(block!(key), value);
      }
    } else if (block) {
      for (const key of [...this.keys()]) {
        const value = this.get(key)!;
        this.delete(key);
        this.set((hash[key] as string) || block(key), value);
      }
    } else {
      for (const key of [...this.keys()]) {
        const value = this.get(key)!;
        this.delete(key);
        this.set((hash[key] as string) || key, value);
      }
    }

    return this;
  }

  /**
   * Transform values — returns new HWIA with transformed values.
   */
  transformValues<W = V>(fn: (value: V) => W): HashWithIndifferentAccess<W> {
    const result = new HashWithIndifferentAccess<W>();
    for (const [k, v] of this.data) {
      result.set(k, fn(v));
    }
    return result;
  }

  /**
   * Compact — removes null and undefined values, returning a new HWIA.
   */
  compact(): HashWithIndifferentAccess<NonNullable<V>> {
    const result = new HashWithIndifferentAccess<NonNullable<V>>();
    for (const [k, v] of this.data) {
      if (v !== null && v !== undefined) {
        result.set(k, v as NonNullable<V>);
      }
    }
    return result;
  }

  /**
   * `Enumerable#any?` — with no block, true when any entry exists; with one,
   * true when it matches at least one `[key, value]` pair.
   */
  any(fn?: (pair: [string, V]) => boolean): boolean {
    if (!fn) return this.data.size > 0;
    for (const pair of this.data) {
      if (fn(pair)) return true;
    }
    return false;
  }

  /**
   * `Enumerable#all?` — with no block, true when every entry is truthy (a
   * `[key, value]` pair always is); with one, true when it matches every pair.
   */
  all(fn?: (pair: [string, V]) => boolean): boolean {
    if (!fn) return true;
    for (const pair of this.data) {
      if (!fn(pair)) return false;
    }
    return true;
  }

  /**
   * `Enumerable#none?` — with no block, true when the hash is empty; with one,
   * true when it matches no `[key, value]` pair.
   */
  none(fn?: (pair: [string, V]) => boolean): boolean {
    if (!fn) return this.data.size === 0;
    return !this.any(fn);
  }

  /**
   * Ruby `Enumerable#count` over a Hash: the block is yielded the `[key, value]`
   * pair, not two arguments.
   */
  count(fn?: (pair: [string, V]) => boolean): number {
    if (!fn) return this.data.size;
    let n = 0;
    for (const pair of this.data) {
      if (fn(pair)) n++;
    }
    return n;
  }

  /**
   * Ruby `Enumerable#find` over a Hash: the block is yielded the `[key, value]`
   * pair, and the matching pair is returned.
   */
  find(fn: (pair: [string, V]) => boolean): [string, V] | undefined {
    for (const pair of this.data) {
      if (fn(pair)) return pair;
    }
    return undefined;
  }

  /**
   * Ruby `Hash#each` / `each_pair`: the block is yielded the `[key, value]`
   * pair.
   */
  each(fn: (pair: [string, V]) => void): this {
    for (const pair of this.data) {
      fn(pair);
    }
    return this;
  }

  /**
   * Ruby `Hash#map`: the block is yielded the `[key, value]` pair, so
   * `hash.map((pair) => pair[0])` is spellable as Ruby's `hash.map(&:first)` is.
   */
  map<T>(fn: (pair: [string, V]) => T): T[] {
    const result: T[] = [];
    for (const pair of this.data) {
      result.push(fn(pair));
    }
    return result;
  }

  /**
   * assoc — returns [key, value] pair for the given key, or undefined.
   */
  assoc(key: string): [string, V] | undefined {
    key = this.convertKey(key);
    if (this.data.has(key)) {
      return [key, this.data.get(key)!];
    }
    return undefined;
  }

  /**
   * invert — swaps keys and values, returning a new HWIA.
   */
  invert(): HashWithIndifferentAccess<string> {
    const result = new HashWithIndifferentAccess<string>();
    for (const [k, v] of this.data) {
      result.set(String(v), k);
    }
    return result;
  }

  /**
   * dig — nested access using multiple keys.
   * Each intermediate value must be a HashWithIndifferentAccess or support get().
   */
  dig(key: string, ...rest: string[]): unknown {
    const val = this.data.get(this.convertKey(key));
    if (rest.length === 0) return val;
    if (val === null || val === undefined) return undefined;
    if (val instanceof HashWithIndifferentAccess) {
      return val.dig(rest[0], ...rest.slice(1));
    }
    // For plain objects, fall through
    return undefined;
  }

  /**
   * toParam / toQuery — encode as URL query string.
   */
  toParam(): string {
    const parts: string[] = [];
    const sorted = [...this.data.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [k, v] of sorted) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.join("&").replace(/%20/g, "+");
  }

  toQuery(): string {
    return this.toParam();
  }

  /**
   * withIndifferentAccess — returns a dup of self (already HWIA).
   */
  withIndifferentAccess(): HashWithIndifferentAccess<V> {
    return new HashWithIndifferentAccess<V>(this);
  }

  /**
   * Return a plain object with all string keys (Rails' stringify_keys).
   * Returns a new HashWithIndifferentAccess since all keys are already strings.
   */
  stringifyKeys(): HashWithIndifferentAccess<V> {
    return new HashWithIndifferentAccess<V>(this.toHash());
  }

  /**
   * Return a plain object with all string keys (Rails' symbolize_keys).
   * In TS all keys are already strings; returns a plain object.
   */
  symbolizeKeys(): AnyObject {
    return symbolizeKeysBang(this.toHash());
  }

  /**
   * `alias_method :to_options, :symbolize_keys`
   * (hash_with_indifferent_access.rb:319).
   */
  toOptions(): AnyObject {
    return this.symbolizeKeys();
  }

  /**
   * Mirrors `deep_symbolize_keys` (hash_with_indifferent_access.rb:320).
   */
  deepSymbolizeKeys(): AnyObject {
    return deepSymbolizeKeysBang(this.toHash());
  }

  /**
   * Mirrors `to_options!` (hash_with_indifferent_access.rb:321) — this hash is
   * already indifferent, so it answers itself.
   */
  toOptionsBang(): this {
    return this;
  }

  /**
   * Mirrors `nested_under_indifferent_access`
   * (hash_with_indifferent_access.rb:66-68) — already indifferent, so a hash
   * nested under one being converted is returned as-is.
   */
  nestedUnderIndifferentAccess(): this {
    return this;
  }

  /**
   * Mirrors `to_hash` (hash_with_indifferent_access.rb:376-381) — the values
   * are converted back out of indifferent access too.
   */
  toHash(): AnyObject {
    const copy: AnyObject = {};
    for (const [k, v] of this.data) {
      copy[k] = this.convertValueToHash(v);
    }
    return copy;
  }

  /**
   * Mirrors `to_proc` (hash_with_indifferent_access.rb:383-385) — a Ruby proc
   * is a JS function, so the reader closure is returned as-is.
   */
  toProc(): (key: string) => V | undefined {
    return (key: string) => this.get(key);
  }

  /**
   * Mirrors `convert_key` (hash_with_indifferent_access.rb:388-390) —
   * `Symbol === key ? key.name : key`. A Ruby Symbol is a `":name"` string in
   * trails (see CLAUDE.md), so `Symbol#name` is the string without its colon.
   */
  private convertKey(key: string): string {
    return key.startsWith(":") ? key.slice(1) : key;
  }

  /**
   * Mirrors `convert_value` (hash_with_indifferent_access.rb:392-403) — a
   * nested Hash goes under indifferent access, an Array is mapped element by
   * element, anything else is stored as-is.
   */
  private convertValue(value: V, conversion?: string): V {
    if (value instanceof HashWithIndifferentAccess) {
      return value.nestedUnderIndifferentAccess() as V;
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

  /**
   * Mirrors `convert_value_to_hash` (hash_with_indifferent_access.rb:405-413).
   */
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
