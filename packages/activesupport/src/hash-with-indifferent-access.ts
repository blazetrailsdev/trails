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

import { deepSymbolizeKeysBang, isPlainObject, symbolizeKeysBang } from "./hash-utils.js";
import { nestedUnderIndifferentAccess } from "./core-ext/hash/indifferent-access.js";
import { type DefaultProc, Hash, KeyError, TypeError } from "@blazetrails/ruby-compat";

type AnyObject = Record<string, unknown>;

/**
 * `NOT_GIVEN = Object.new` (hash_with_indifferent_access.rb:336) — the sentinel
 * `transform_keys`/`transform_keys!` compare against so an explicitly-passed
 * `nil` is told apart from an omitted argument.
 */
const NOT_GIVEN: AnyObject = {};
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

/**
 * `CLASS_OF` (`vendor/ruby/object.c:3899`) over the values trails carries: one
 * JS `Number` seats both `Integer` and `Float`, so which it is is read off the
 * value, the way `rubyClassName` reads it in `array-utils.ts` and `cache/store.ts`.
 * The six copies converge onto one exported ruby-compat function in
 * `converge-rb-obj-class-copies-onto-ruby-compat`.
 */
function rubyClassName(value: unknown): string {
  if (value === null || value === undefined) return "NilClass";
  if (typeof value === "boolean") return value ? "TrueClass" : "FalseClass";
  if (typeof value === "bigint") return "Integer";
  if (typeof value === "number") return Number.isInteger(value) ? "Integer" : "Float";
  if (typeof value === "string") return "String";
  return (value as object).constructor?.name ?? "Object";
}

export class HashWithIndifferentAccess<V = unknown> extends Hash<string, V> {
  /**
   * Mirrors `initialize` (hash_with_indifferent_access.rb:70-83). The
   * `respond_to?(:to_hash)` arm goes through `update`, so every key gets
   * `convert_key` and every value `convert_value`, then carries the source
   * hash's `default` / `default_proc` over — both under Ruby truthiness, so a
   * stored `false` default is left behind exactly as `if hash.default` does;
   * the `else` arm is `Hash.new(obj)`, which sets the default value.
   *
   * `Hash.new { |hash, key| ... }` takes its default_proc as a block. A block
   * is a single trailing function argument here, the same spelling `fetch`
   * uses (:195).
   */
  constructor(
    constructor?: AnyObject | HashWithIndifferentAccess<V> | DefaultProc<string, V> | NoInfer<V>,
  ) {
    super();
    if (constructor instanceof HashWithIndifferentAccess || isPlainObject(constructor)) {
      this.update(constructor);

      const hash = constructor;
      if (hash instanceof HashWithIndifferentAccess) {
        if (hash.default() != null && (hash.default() as unknown) !== false) {
          this.setDefault(hash.default());
        }
        if (hash.defaultProc()) this.setDefaultProc(hash.defaultProc());
      }
    } else if (constructor == null) {
      // super()
    } else if (typeof constructor === "function") {
      this.setDefaultProc(constructor as DefaultProc<string, V>);
    } else {
      this.setDefault(constructor as V);
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
   * takes either spelling of the key. On a miss `Hash#[]` yields to the
   * default_proc, else returns the default.
   */
  override get(key: string): V | undefined {
    return super.get(this.convertKey(key));
  }

  /**
   * Mirrors `default` (hash_with_indifferent_access.rb:223-229) — with no
   * argument it is `Hash#default`, the plain default value; with one it is
   * `Hash#default(key)` over the converted key, which runs the default_proc.
   */
  override default(...key: [] | [string]): V | undefined {
    if (key.length === 0) {
      return super.default();
    } else {
      return super.default(this.convertKey(key[0]));
    }
  }

  /**
   * Mirrors `[]=` (hash_with_indifferent_access.rb:98-100).
   */
  override set(key: string, value: V): this {
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
    super.set(key, value);
    return this;
  }

  /**
   * `alias_method :regular_update, :update` (hash_with_indifferent_access.rb:92)
   * — the un-converting `Hash#update`.
   */
  regularUpdate(otherHashes: HashWithIndifferentAccess<V>, block?: BlockFn<V>): this {
    for (const [k, v] of otherHashes.entries()) {
      super.set(k, block && super.has(k) ? block(k, super.get(k)!, v) : v);
    }
    return this;
  }

  /**
   * Mirrors `delete` (hash_with_indifferent_access.rb:303-305) — `Hash#delete`
   * through `convert_key`, so the removed value comes back (`undefined` when
   * the key was absent), not `Map#delete`'s boolean. It keeps the inherited
   * declaration's return type so this class stays assignable to the `Map`
   * spelling a Ruby `Hash` parameter takes.
   */
  override delete(key: string): ReturnType<Hash<string, V>["delete"]> {
    const convertedKey = this.convertKey(key);
    const value = super.get(convertedKey);
    super.delete(convertedKey);
    return value;
  }

  /**
   * Mirrors `key?` (hash_with_indifferent_access.rb:150-152) — checks the hash
   * for a key in either spelling.
   */
  key(key: string): boolean {
    return this.has(key);
  }

  /**
   * `key?` again under the operator spelling `Map#has` gives this class — the
   * inherited `Hash` storage answers it, so it has to convert the key the way
   * `key?` (hash_with_indifferent_access.rb:150-152) does.
   */
  override has(key: string): boolean {
    return super.has(this.convertKey(key));
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
    if (super.has(key)) return super.get(key)!;
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
    return keys.map((key) => super.get(this.convertKey(key)));
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

  /**
   * Mirrors `merge` (hash_with_indifferent_access.rb:274-276) — the same
   * semantics as `update`, but returns a new hash instead of modifying the
   * receiver.
   */
  merge(
    ...hashes: (AnyObject | HashWithIndifferentAccess<V> | BlockFn<V>)[]
  ): HashWithIndifferentAccess<V> {
    return this.dup().update(...hashes);
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
      for (const [key, given] of Object.entries(otherHash) as [string, V][]) {
        let value = given;
        if (block && this.key(key)) {
          value = block(this.convertKey(key), this.get(key)!, value);
        }
        this.regularWriter(this.convertKey(key), this.convertValue(value));
      }
    }
  }

  /**
   * Mirrors `dup` (hash_with_indifferent_access.rb:264-268) — a shallow copy
   * that carries the receiver's defaults over.
   */
  dup(): HashWithIndifferentAccess<V> {
    const newHash = new HashWithIndifferentAccess<V>(this);
    this.setDefaults(newHash);
    return newHash;
  }

  /**
   * Mirrors `reverse_merge` (hash_with_indifferent_access.rb:283-285) — like
   * `merge` but the other way around: merges the receiver into the argument
   * and returns a new hash with indifferent access as result.
   */
  reverseMerge(otherHash: AnyObject | HashWithIndifferentAccess<V>): HashWithIndifferentAccess<V> {
    return new HashWithIndifferentAccess<V>(otherHash).merge(this);
  }

  /** `alias_method :with_defaults, :reverse_merge` (hash_with_indifferent_access.rb:286). */
  withDefaults(otherHash: AnyObject | HashWithIndifferentAccess<V>): HashWithIndifferentAccess<V> {
    return this.reverseMerge(otherHash);
  }

  /**
   * Mirrors `reverse_merge!` (hash_with_indifferent_access.rb:288-290) — same
   * semantics as `reverseMerge` but modifies the receiver in-place.
   */
  reverseMergeBang(otherHash: AnyObject | HashWithIndifferentAccess<V>): this {
    return this.replace(this.reverseMerge(new HashWithIndifferentAccess<V>(otherHash)));
  }

  /** `alias_method :with_defaults!, :reverse_merge!` (hash_with_indifferent_access.rb:291). */
  withDefaultsBang(otherHash: AnyObject | HashWithIndifferentAccess<V>): this {
    return this.reverseMergeBang(otherHash);
  }

  /**
   * Mirrors `replace` (hash_with_indifferent_access.rb:298-300) — replaces the
   * contents of this hash with `otherHash`, under indifferent access.
   */
  replace(otherHash: AnyObject | HashWithIndifferentAccess<V>): this {
    super.clear();
    return this.update(new HashWithIndifferentAccess<V>(otherHash));
  }

  /**
   * Deep merge, recursively merging nested objects — `Hash#deep_merge`
   * (core_ext/hash/deep_merge.rb:5-6) comes from
   * `ActiveSupport::DeepMergeable#deep_merge` (deep_mergeable.rb:29-31), a
   * `dup.deep_merge!`, and `deep_merge!` (:34-44) is `merge!` with the block
   * that recurses whenever `deep_merge?` (deep_merge.rb:40-42) holds. `update`
   * converts every value, so the receiver's side is a
   * `HashWithIndifferentAccess` wherever Ruby's is a Hash.
   */
  deepMerge(other: AnyObject | HashWithIndifferentAccess<V>): HashWithIndifferentAccess<V> {
    return this.dup().update(other, (_key, thisVal, otherVal) => {
      if (
        thisVal instanceof HashWithIndifferentAccess &&
        (isPlainObject(otherVal) || otherVal instanceof HashWithIndifferentAccess)
      ) {
        return thisVal.deepMerge(otherVal as AnyObject) as V;
      }
      return otherVal;
    });
  }

  /**
   * Return a new HashWithIndifferentAccess with only the specified keys.
   */
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

  /**
   * Mirrors `slice!` (hash_with_indifferent_access.rb:366-369) — the keys are
   * converted, then `Hash#slice!` (core_ext/hash/slice.rb:10-17) replaces the
   * hash with the given keys and returns the removed pairs.
   */
  sliceBang(...keys: string[]): HashWithIndifferentAccess<V> {
    keys = keys.map((key) => this.convertKey(key));
    const omit = this.slice(...[...this.keys()].filter((key) => !keys.includes(key)));
    const hash = this.slice(...keys);
    hash.setDefault(this.default());
    if (this.defaultProc()) hash.setDefaultProc(this.defaultProc());
    this.replace(hash);
    return omit;
  }

  /**
   * Return a new HashWithIndifferentAccess without the specified keys.
   */
  except(...keys: string[]): HashWithIndifferentAccess<V> {
    return this.dup().exceptBang(...keys);
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
  select(...args: [(key: string, value: V) => boolean]): HashWithIndifferentAccess<V> {
    const block = args[args.length - 1];
    const result = new HashWithIndifferentAccess<V>();
    for (const [k, v] of this) {
      if (block(k, v)) {
        result.set(k, v);
      }
    }
    return result;
  }

  /**
   * Mirror Rails `reject` (hash_with_indifferent_access.rb:328-331), which
   * delegates to `Hash#reject!` and so yields `|key, value|`.
   */
  reject(...args: [(key: string, value: V) => boolean]): HashWithIndifferentAccess<V> {
    const block = args[args.length - 1];
    return this.select((k, v) => !block(k, v));
  }

  /**
   * Mirrors `transform_keys` (hash_with_indifferent_access.rb:338-341) —
   * `dup.tap { |h| h.transform_keys!(hash, &block) }`, so the mapping hash and
   * the block arms are the ones `transform_keys!` documents below.
   */
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

  /**
   * Mirrors `transform_keys!` (hash_with_indifferent_access.rb:345-357). Ruby's
   * block is syntactically separate from the optional `hash`; JS has no such
   * separation, so a function passed in the `hash` slot is read as the block —
   * the same reading `fetch` above gives a trailing function.
   *
   * Ruby's no-argument arm (`return to_enum(:transform_keys!) if
   * NOT_GIVEN.equal?(hash) && !block_given?`, :346) has no JS analogue — there
   * is no Enumerator to return — so, as at `Deprecators#each`
   * (deprecators.rb:41), the overloads require either the block or the hash and
   * a bare call is a compile-time error rather than an enumerator.
   */
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
      // `super` — `Hash#transform_keys!` takes no implicit conversion of nil.
      // eslint-disable-next-line blazetrails/rails-error-parity
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

  /**
   * Transform values — returns new HWIA with transformed values.
   */
  transformValues<W = V>(fn: (value: V) => W): HashWithIndifferentAccess<W> {
    const result = new HashWithIndifferentAccess<W>();
    for (const [k, v] of this) {
      result.set(k, fn(v));
    }
    return result;
  }

  /**
   * Compact — removes null and undefined values, returning a new HWIA.
   */
  compact(): HashWithIndifferentAccess<NonNullable<V>> {
    const result = new HashWithIndifferentAccess<NonNullable<V>>();
    for (const [k, v] of this) {
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
    if (!fn) return this.size > 0;
    for (const pair of this) {
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
    for (const pair of this) {
      if (!fn(pair)) return false;
    }
    return true;
  }

  /**
   * `Enumerable#none?` — with no block, true when the hash is empty; with one,
   * true when it matches no `[key, value]` pair.
   */
  none(fn?: (pair: [string, V]) => boolean): boolean {
    if (!fn) return this.size === 0;
    return !this.any(fn);
  }

  /**
   * Ruby `Enumerable#count` over a Hash: the block is yielded the `[key, value]`
   * pair, not two arguments.
   */
  count(fn?: (pair: [string, V]) => boolean): number {
    if (!fn) return this.size;
    let n = 0;
    for (const pair of this) {
      if (fn(pair)) n++;
    }
    return n;
  }

  /**
   * Ruby `Enumerable#find` over a Hash: the block is yielded the `[key, value]`
   * pair, and the matching pair is returned.
   */
  find(fn: (pair: [string, V]) => boolean): [string, V] | undefined {
    for (const pair of this) {
      if (fn(pair)) return pair;
    }
    return undefined;
  }

  /**
   * Ruby `Hash#each` / `each_pair`: the block is yielded the `[key, value]`
   * pair.
   */
  each(fn: (pair: [string, V]) => void): this {
    for (const pair of this) {
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
    for (const pair of this) {
      result.push(fn(pair));
    }
    return result;
  }

  /**
   * assoc — returns [key, value] pair for the given key, or undefined.
   */
  assoc(key: string): [string, V] | undefined {
    key = this.convertKey(key);
    if (super.has(key)) {
      return [key, super.get(key)!];
    }
    return undefined;
  }

  /**
   * invert — swaps keys and values, returning a new HWIA.
   */
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
   * through `rb_ary_at`, an object that answers `dig` is handed the rest, and
   * anything else is `no_dig_method`'s TypeError (`object.c:3897-3900`).
   */
  dig(key: string, ...identifiers: (string | number)[]): unknown {
    let obj: unknown = this.get(key);
    for (let i = 0; i < identifiers.length; i++) {
      const identifier = identifiers[i];
      if (obj == null) return undefined;
      if (Array.isArray(obj)) {
        const index = Number(identifier);
        obj = obj[index < 0 ? obj.length + index : index];
        continue;
      }
      const dig = (obj as { dig?: unknown }).dig;
      if (typeof dig === "function") {
        return (dig as (...args: (string | number)[]) => unknown).apply(obj, identifiers.slice(i));
      }
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new TypeError(`${rubyClassName(obj)} does not have #dig method`);
    }
    return obj;
  }

  /**
   * toParam / toQuery — encode as URL query string.
   */
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

  /**
   * withIndifferentAccess — returns a dup of self (already HWIA).
   */
  withIndifferentAccess(): HashWithIndifferentAccess<V> {
    return this.dup();
  }

  /**
   * `hash_with_indifferent_access.rb` leaves `stringify_keys` to `Hash`
   * (core_ext/hash/keys.rb:10-12), whose `transform_keys` reaches the override
   * at :339-342 — so the answer is another `HashWithIndifferentAccess`. Its
   * `Symbol === k` arm cannot fire: `convert_key` (:388-390) has already made
   * every stored key a String.
   */
  stringifyKeys(): HashWithIndifferentAccess<V> {
    return this.transformKeys((key) => String(key));
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
   * Mirrors `to_hash` (hash_with_indifferent_access.rb:375-381) — a regular
   * Hash with string keys, each value deep-converted by `convert_value_to_hash`.
   * `Hash[self]` (:377) is `@blazetrails/ruby-compat`'s `Hash`, the trails
   * spelling of a Ruby Hash that carries `default` / `default_proc`, so
   * `set_defaults(copy)` (:379) has the seat Rails writes to.
   */
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
   * Ruby's `Symbol === key` guard passes every other object through untouched,
   * so the parameter is `unknown`: a non-string key (Ruby lets `h.fetch(0, 0)`
   * through) must not be coerced or reach `String#start_with?`. It is returned
   * as-is, and the string return type describes the only keys the backing map
   * can match — a non-string simply misses.
   */
  private convertKey(key: unknown): string {
    return typeof key === "string" && key.startsWith(":") ? key.slice(1) : (key as string);
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
   * Mirrors `set_defaults` (hash_with_indifferent_access.rb:416-422) — copies
   * the receiver's default_proc, else its default value, onto `target`.
   *
   * Both targets are a `@blazetrails/ruby-compat` `Hash` — `dup`'s a
   * `HashWithIndifferentAccess`, `to_hash`'s the bare one — and differ only in
   * the value type their `default_proc` is yielded, which the proc Rails hands
   * straight over never reads.
   */
  private setDefaults(target: Hash<string, V> | Hash<string, unknown>): void {
    const seat = target as Hash<string, V>;
    if (this.defaultProc()) {
      seat.setDefaultProc(this.defaultProc());
    } else {
      seat.setDefault(this.default());
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
