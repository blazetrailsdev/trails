import { FrozenError } from "./frozen-error.js";
import { KeyError } from "./key-error.js";
import { rbInspect } from "./object.js";

const BLOCK = Symbol.for("@blazetrails/ruby-compat:block");

/** @noRailsEquivalent PERMANENT — Ruby's `&block`, read back by `rb_block_given_p` (`vendor/ruby/eval.c:866`); TypeScript has no such syntax, and a stored default may itself be callable, so the block carries a mark instead. */
export type Block<T> = ((key: string) => T) & { readonly [BLOCK]: true };

/** @noRailsEquivalent PERMANENT — Ruby's `&` block-pass, whose `rb_block_given_p` (`vendor/ruby/eval.c:866`) TypeScript has no equivalent of. */
export function block<T>(fn: (key: string) => T): Block<T>;
/** @noRailsEquivalent PERMANENT — Ruby's `&` block-pass, whose `rb_block_given_p` (`vendor/ruby/eval.c:866`) TypeScript has no equivalent of. */
export function block<T>(fn: (key: string, oldValue: T, newValue: T) => T): ConflictBlock<T>;
/** @noRailsEquivalent PERMANENT — Ruby's `&` block-pass, whose `rb_block_given_p` (`vendor/ruby/eval.c:866`) TypeScript has no equivalent of; one mark serves every yield signature. */
export function block(fn: (...args: never[]) => unknown): unknown {
  return Object.assign((...args: never[]) => fn(...args), { [BLOCK]: true as const });
}

function blockGivenP(value: unknown): value is Block<unknown> {
  return typeof value === "function" && (value as Partial<Block<unknown>>)[BLOCK] === true;
}

/**
 * Ruby `Hash#fetch` (`vendor/ruby/hash.c:2176` `rb_hash_fetch_m`), all three
 * arms: with one argument the stored value or a `KeyError`, with a second the
 * stored value or that default, and with a {@link block} the stored value or
 * what the block returns for the missing key.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/hash.c:2176`).
 */
export function fetch<T>(hash: Record<string, unknown>, key: string): T;
/**
 * The two-argument arm: the STORED value whenever the key exists — including a
 * stored `nil` or `false` — and otherwise `defaultValue`, which is what `??`
 * gets wrong.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/hash.c:2176`).
 */
export function fetch<T>(hash: Record<string, unknown>, key: string, defaultValue: T): T;
/**
 * The block arm: on a miss `rb_hash_fetch_m` yields the key and returns what
 * the block returns, which is what `Rack::Request::Env#fetch_header`
 * (`vendor/rack/lib/rack/request.rb:106-108`) installs a default through.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/hash.c:2176`).
 */
export function fetch<T>(hash: Record<string, unknown>, key: string, block: Block<T>): T;
/**
 * `rb_hash_fetch_m` dispatches on `argc` and `rb_block_given_p`, so the arms
 * share one body over a rest parameter: an absent second argument is the
 * raising arm, and an explicitly-passed `undefined` is a default, exactly as
 * Ruby's `nil` is.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/hash.c:2176`).
 */
export function fetch(hash: Record<string, unknown>, key: string, ...rest: unknown[]): unknown {
  const blockGiven = blockGivenP(rest[0]);
  if (!hasKey(hash, key)) {
    if (blockGiven) {
      return (rest[0] as Block<unknown>)(key);
    } else if (rest.length === 0) {
      throw new KeyError(`key not found: ${strEllipsize(rbInspect(key), 65)}`);
    } else {
      return rest[0];
    }
  }
  return hash[key];
}

/**
 * Ruby `Hash#key?` / `#has_key?` (`vendor/ruby/hash.c:3671`
 * `rb_hash_has_key`) — membership, which for a stored `nil` or `false` is the
 * question `hash[key] !== undefined` cannot answer.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#key?` (`vendor/ruby/hash.c:3671`).
 */
export function hasKey(hash: object, key: PropertyKey): boolean {
  /* `vendor/ruby/hash.c:3671` `rb_hash_has_key` reads the hash table through
     `hash_stlike_lookup`, never an ancestor: a Ruby Hash has no prototype
     chain, so `"toString" in {}` is an answer Ruby never gives. */
  return Object.hasOwn(hash, key);
}

const ELLIPSIS = "...";

/**
 * `rb_str_ellipsize` (`vendor/ruby/string.c:11027`), the ASCII-compatible arm
 * `rb_hash_fetch_m` reaches with `len` 65: a longer description keeps its first
 * `len - 3` characters and ends in the ellipsis, so the whole is `len` wide.
 */
function strEllipsize(str: string, len: number): string {
  if (len >= str.length) return str;
  if (len <= ELLIPSIS.length) return ELLIPSIS;
  return str.slice(0, len - ELLIPSIS.length) + ELLIPSIS;
}

/**
 * A Ruby block yielded a key and a value. `delete_if_i`
 * (`vendor/ruby/hash.c:2531`) tests its result with `RTEST` — false only for
 * `nil` and `false` — so `deleteIf` spells that test out rather than coercing
 * with `Boolean()`.
 */
type PairBlock<T> = (key: string, value: T) => unknown;

/**
 * The conflict block `rb_hash_update` and `rb_hash_merge` take
 * (`vendor/ruby/hash.c:4012-4022` `rb_hash_update_block_i`), yielded the key,
 * the RECEIVER's value and the argument's, in that order.
 */
export type ConflictBlock<T> = ((key: string, oldValue: T, newValue: T) => T) & {
  readonly [BLOCK]: true;
};

/**
 * Ruby `Hash#merge` (`vendor/ruby/hash.c:4144` `rb_hash_merge`), which is
 * `rb_hash_update` over `rb_hash_dup(self)` — a NEW hash, the receiver
 * untouched, and it inherits `rb_hash_update`'s conflict-block arm through
 * that call.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#merge` (`vendor/ruby/hash.c:4144`).
 */
export function merge<T>(
  hash: Record<string, T>,
  ...others: (Record<string, T> | ConflictBlock<T>)[]
): Record<string, T> {
  return update({ ...hash }, ...others);
}

/**
 * Ruby `Hash#update` (`vendor/ruby/hash.c:4028` `rb_hash_update`) — MUTATES
 * the receiver and returns it, which is the whole difference from `merge`.
 * Each argument is applied in turn, so a later one wins — unless a trailing
 * conflict block is given, which `rb_hash_update_block_i`
 * (`vendor/ruby/hash.c:4012-4022`) yields for a key already in the receiver,
 * storing what it returns.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#update` (`vendor/ruby/hash.c:4028`).
 */
export function update<T>(
  hash: Record<string, T>,
  ...others: (Record<string, T> | ConflictBlock<T>)[]
): Record<string, T> {
  const block = blockGivenP(others[others.length - 1])
    ? (others.pop() as ConflictBlock<T>)
    : undefined;
  for (const other of others as Record<string, T>[]) {
    for (const key of Object.keys(other)) {
      hash[key] =
        block !== undefined && hasKey(hash, key) ? block(key, hash[key], other[key]) : other[key];
    }
  }
  return hash;
}

/**
 * Ruby `Hash#merge!` (`vendor/ruby/hash.c:7247`), which MRI defines onto the
 * same `rb_hash_update` body as `update`, conflict-block arm included.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#merge!` (`vendor/ruby/hash.c:4028`).
 */
export const mergeBang = update;

/**
 * Ruby `Hash#delete_if` (`vendor/ruby/hash.c:2564` `rb_hash_delete_if`) —
 * MUTATES the receiver, dropping every pair the block answers truthily for,
 * and returns it.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#delete_if` (`vendor/ruby/hash.c:2564`).
 */
export function deleteIf<T>(hash: Record<string, T>, block: PairBlock<T>): Record<string, T> {
  for (const key of Object.keys(hash)) {
    const rejected = block(key, hash[key]);
    if (rejected != null && rejected !== false) delete hash[key];
  }
  return hash;
}

/**
 * Ruby `Hash#reject` (`vendor/ruby/hash.c:2626` `rb_hash_reject`) — the
 * non-mutating twin: `delete_if` over a dup.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#reject` (`vendor/ruby/hash.c:2626`).
 */
export function reject<T>(hash: Record<string, T>, block: PairBlock<T>): Record<string, T> {
  return deleteIf({ ...hash }, block);
}

/**
 * Ruby `Hash#each_pair` (`vendor/ruby/hash.c:3149` `rb_hash_each_pair`), which
 * `Hash#each` is also defined onto (`hash.c:7219`): yields each key and value
 * and returns the receiver.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_pair` (`vendor/ruby/hash.c:3149`).
 */
export function eachPair<T>(hash: Record<string, T>, block: PairBlock<T>): Record<string, T> {
  for (const key of Object.keys(hash)) {
    block(key, hash[key]);
  }
  return hash;
}

/**
 * Ruby `Hash#inspect` (`vendor/ruby/hash.c:3483` `rb_hash_inspect`): `"{}"` for
 * an empty hash, and otherwise `inspect_hash` (`hash.c:3459`) wrapping the
 * `inspect_i` (`hash.c:3439`) pairs — each `rb_inspect(key)`, `"=>"`,
 * `rb_inspect(value)`, joined by `", "`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#inspect` (`vendor/ruby/hash.c:3483`).
 */
export function inspect(hash: Record<string, unknown> | Map<unknown, unknown>): string {
  return rbInspect(hash);
}

/**
 * Ruby `Hash#each_value` (`vendor/ruby/hash.c:3060` `rb_hash_each_value`):
 * yields each value alone and returns the receiver.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_value` (`vendor/ruby/hash.c:3060`).
 */
export function eachValue<T>(
  hash: Record<string, T>,
  block: (value: T) => unknown,
): Record<string, T> {
  for (const key of Object.keys(hash)) {
    block(hash[key]);
  }
  return hash;
}

/**
 * Ruby `Hash#each_key` (`vendor/ruby/hash.c:3098` `rb_hash_each_key`): yields
 * each key alone and returns the receiver.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_key` (`vendor/ruby/hash.c:3098`).
 */
export function eachKey<T>(
  hash: Record<string, T>,
  block: (key: string) => unknown,
): Record<string, T> {
  for (const key of Object.keys(hash)) {
    block(key);
  }
  return hash;
}

/**
 * Ruby `Hash#transform_values` (`vendor/ruby/hash.c:3366`
 * `rb_hash_transform_values`) — a NEW hash with the same keys in the same
 * order and each value replaced by the block's result.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#transform_values` (`vendor/ruby/hash.c:3366`).
 */
export function transformValues<T, U>(
  hash: Record<string, T>,
  block: (value: T) => U,
): Record<string, U> {
  /* `rb_hash_transform_values` (`vendor/ruby/hash.c:3366`) builds the new hash
     with `rb_hash_new`, which has no ancestors: `__proto__` is an ordinary key
     there, where `result["__proto__"] = v` on a plain `{}` reaches
     Object.prototype's setter and stores nothing. */
  const result: Record<string, U> = Object.create(null) as Record<string, U>;
  for (const key of Object.keys(hash)) {
    result[key] = block(hash[key]);
  }
  return result;
}

/**
 * Ruby `Hash#slice` (`vendor/ruby/hash.c:2651` `rb_hash_slice`) — a NEW hash
 * of just the given keys, in ARGUMENT order, keys that are absent ignored.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#slice` (`vendor/ruby/hash.c:2651`).
 */
export function slice<T>(hash: Record<string, T>, ...keys: string[]): Record<string, T> {
  const result: Record<string, T> = Object.create(null) as Record<string, T>;
  for (const key of keys) {
    if (hasKey(hash, key)) result[key] = hash[key];
  }
  return result;
}

/**
 * Ruby `Hash#except` (`vendor/ruby/hash.c:2683` `rb_hash_except`) — a dup
 * with the given keys deleted, keys that are absent ignored.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#except` (`vendor/ruby/hash.c:2683`).
 */
export function except<T>(hash: Record<string, T>, ...keys: string[]): Record<string, T> {
  /* `rb_hash_except` (`vendor/ruby/hash.c:2683`) deletes from a
     `hash_dup_with_compare_by_id`, so the result is an ancestor-less Hash in
     which `__proto__` stays an ordinary key. */
  const result: Record<string, T> = Object.assign(Object.create(null) as Record<string, T>, hash);
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Ruby `Hash#values_at` (`vendor/ruby/hash.c:2713` `rb_hash_values_at`) — an
 * ARRAY of the values for the given keys, in argument order, `nil` for a key
 * the hash does not hold.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#values_at` (`vendor/ruby/hash.c:2713`).
 */
export function valuesAt<T>(hash: Record<string, T>, ...keys: string[]): (T | undefined)[];
/**
 * The Map arm: `rb_hash_aref` is the same lookup whichever hash it is given.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#values_at` (`vendor/ruby/hash.c:2713`).
 */
export function valuesAt<K, T>(hash: Map<K, T>, ...keys: K[]): (T | undefined)[];
/**
 * `rb_hash_values_at` pushes `rb_hash_aref(hash, argv[i])` for each key, so the
 * arms share one body over the rest parameter.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#values_at` (`vendor/ruby/hash.c:2713`).
 */
export function valuesAt(
  hash: Record<string, unknown> | Map<unknown, unknown>,
  ...keys: unknown[]
) {
  if (hash instanceof Map) return keys.map((key) => hash.get(key));
  return keys.map((key) => hash[key as string]);
}

/**
 * Ruby `Hash#dup` (`vendor/ruby/object.c:591` `rb_obj_dup`), which for a Hash
 * allocates through `rb_hash_dup` (`vendor/ruby/hash.c:1584`): a NEW hash with
 * the same pairs in the same order, carrying the receiver's `default` /
 * `default_proc` over — `hash_dup` passes `RHASH_IFNONE(hash)` and the
 * `RHASH_PROC_DEFAULT` flag through to the allocation, which a plain object
 * spread has nowhere to put. The flag is what decides which of the two seats
 * the value lands in, so the port reads the receiver's seat rather than
 * testing the value's type.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#dup` (`vendor/ruby/object.c:591`).
 */
export function dup<K, V>(hash: Hash<K, V>): Hash<K, V>;
/**
 * The plain-object arm: a Hash with no `default` seat is an object literal in
 * trails, and `rb_obj_dup` over it copies the pairs into a fresh
 * `rb_hash_dup` allocation, which has no ancestors — so `__proto__` stays an
 * ordinary key in the copy, as it does in `transformValues` and `except`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#dup` (`vendor/ruby/object.c:591`).
 */
export function dup<T>(hash: Record<string, T>): Record<string, T>;
/**
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#dup` (`vendor/ruby/object.c:591`).
 */
export function dup(
  hash: Hash<unknown, unknown> | Record<string, unknown>,
): Hash<unknown, unknown> | Record<string, unknown> {
  if (!(hash instanceof Hash)) {
    return Object.assign(Object.create(null) as Record<string, unknown>, hash);
  }
  const ret = new Hash<unknown, unknown>();
  const defaultProc = hash.defaultProc();
  if (defaultProc) ret.setDefaultProc(defaultProc);
  else ret.setDefault(hash.default());
  for (const [key, value] of hash) {
    ret.set(key, value);
  }
  return ret;
}

/**
 * A `Hash#default_proc` (`vendor/ruby/hash.c:2308` `rb_hash_set_default_proc`):
 * yielded the hash itself and the missing key.
 */
export type DefaultProc<K, V> = (hash: Hash<K, V>, key: K) => V;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapBoundaryReturn = any;

/**
 * A Ruby `Hash` carrying the `default` / `default_proc` seat a plain JS object
 * has nowhere to put: `Hash.new(obj)` stores a value returned for every miss,
 * `Hash.new { |hash, key| … }` stores a proc run on every miss — the one that
 * lets `hash[key]` populate the hash as it reads it. It subclasses `Map`
 * because Ruby's key equality is `eql?`, not string coercion.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Hash` (`vendor/ruby/hash.c:7182`).
 */
export class Hash<K, V> extends Map<K, V> {
  private _default?: V;
  private _defaultProc?: DefaultProc<K, V>;
  private _frozen = false;

  /**
   * `Hash.new` (`vendor/ruby/hash.c:1782` `rb_hash_initialize`): a block is
   * the default_proc, an argument the default value, neither is `nil`. A block
   * is a single trailing function argument, the spelling `fetch` uses.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash.new` (`vendor/ruby/hash.c:1782`).
   */
  constructor(ifnone?: DefaultProc<K, V> | V) {
    super();
    if (typeof ifnone === "function") {
      this.setDefaultProc(ifnone as DefaultProc<K, V>);
    } else if (ifnone !== undefined) {
      this.setDefault(ifnone);
    }
  }

  /**
   * `Hash#[]` (`vendor/ruby/hash.c:2121` `rb_hash_aref`) — a miss goes to
   * `rb_hash_default_value` (`hash.c:2068`), which runs the default_proc with
   * the missing key.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#[]` (`vendor/ruby/hash.c:2121`).
   */
  /**
   * `Object#freeze` (`vendor/ruby/object.c:1284` `rb_obj_freeze`), which
   * `Hash#freeze` (`vendor/ruby/hash.c:107`) is. `Object.freeze` cannot serve:
   * it seals a JS object's properties, and a `Map`'s entries are not
   * properties, so the seat is the `FL_FREEZE` flag `rb_hash_modify_check`
   * reads.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Object#freeze` (`vendor/ruby/object.c:1284`).
   */
  freeze(): this {
    this._frozen = true;
    return this;
  }

  /**
   * `Object#frozen?` (`vendor/ruby/object.c:1301` `rb_obj_frozen_p`). Ruby's
   * `?` predicate suffix is `is` here, per the conventions.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Object#frozen?` (`vendor/ruby/object.c:1301`).
   */
  isFrozen(): boolean {
    return this._frozen;
  }

  /**
   * `rb_hash_modify_check` (`vendor/ruby/hash.c:1602`), which every mutator
   * calls first: `rb_check_frozen` raises `FrozenError` naming the receiver's
   * class and `inspect`.
   */
  private modifyCheck(): void {
    if (this._frozen) {
      throw new FrozenError(`can't modify frozen ${this.constructor.name}: ${inspect(this)}`);
    }
  }

  /**
   * `Hash#[]=` (`vendor/ruby/hash.c:2018` `rb_hash_aset`), whose
   * `rb_hash_modify` goes through `rb_hash_modify_check` (`hash.c:1623`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#[]=` (`vendor/ruby/hash.c:2018`).
   */
  override set(key: K, value: V): this {
    this.modifyCheck();
    return super.set(key, value);
  }

  /**
   * `Hash#clear` (`vendor/ruby/hash.c:1988` `rb_hash_clear`), which also
   * begins with `rb_hash_modify_check`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#clear` (`vendor/ruby/hash.c:1988`).
   */
  override clear(): void {
    this.modifyCheck();
    super.clear();
  }

  override get(key: K): V | undefined {
    if (super.has(key)) return super.get(key);
    return this.default(key);
  }

  /**
   * `Hash#default` (`vendor/ruby/hash.c:2238` `rb_hash_default`), both arms:
   * with no argument the stored default value — `nil` when a default_proc is
   * what is stored — and with a key the proc's result for that key.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#default` (`vendor/ruby/hash.c:2238`).
   */
  default(...key: [] | [K]): V | undefined {
    if (this._defaultProc) {
      if (key.length === 0) return undefined;
      return this._defaultProc(this, key[0]);
    }
    return this._default;
  }

  /**
   * `Hash#default=` (`vendor/ruby/hash.c:2265` `rb_hash_set_default`), whose
   * `SET_DEFAULT` clears `RHASH_PROC_DEFAULT`. A TS `set` accessor cannot
   * share a name with the `default()` reader, so it takes the conventions'
   * `setX()` spelling.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#default=` (`vendor/ruby/hash.c:2265`).
   */
  setDefault(value: V | undefined): void {
    this.modifyCheck();
    this._default = value;
    this._defaultProc = undefined;
  }

  /**
   * `Hash#default_proc` (`vendor/ruby/hash.c:2285` `rb_hash_default_proc`):
   * the proc only when one is what is stored.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#default_proc` (`vendor/ruby/hash.c:2285`).
   */
  defaultProc(): DefaultProc<K, V> | undefined {
    return this._defaultProc;
  }

  /**
   * `Hash#default_proc=` (`vendor/ruby/hash.c:2308`
   * `rb_hash_set_default_proc`): `nil` goes through `SET_DEFAULT`, clearing
   * the proc; anything that is not a Proc is a `TypeError`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#default_proc=` (`vendor/ruby/hash.c:2308`).
   */
  setDefaultProc(proc: DefaultProc<K, V> | undefined): void {
    this.modifyCheck();
    if (proc == null) {
      this.setDefault(undefined);
      return;
    }
    if (typeof proc !== "function") {
      throw new TypeError(
        `wrong default_proc type ${(proc as object).constructor.name} (expected Proc)`,
      );
    }
    this._default = undefined;
    this._defaultProc = proc;
  }

  /**
   * `Hash#delete` (`vendor/ruby/hash.c:2441` `rb_hash_delete_m`): returns the
   * deleted value, the block's result for a key that was not there, `nil`
   * otherwise. `Map#delete` returns a boolean instead, and a TS override may
   * not narrow a `boolean` return, so the declared return is
   * `MapBoundaryReturn` — the dynamic return Ruby has here.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#delete` (`vendor/ruby/hash.c:2441`).
   */
  override delete(key: K, block?: (key: K) => V): MapBoundaryReturn {
    this.modifyCheck();
    if (super.has(key)) {
      const val = super.get(key);
      super.delete(key);
      return val;
    }
    if (block) return block(key);
    return undefined;
  }

  /**
   * `Hash#keys` (`vendor/ruby/hash.c:3584` `rb_hash_keys`): an Array of the
   * keys, where `Map#keys` is an iterator. A TS override may not narrow that
   * return, so it declares `MapBoundaryReturn`, the same Map boundary `delete`
   * meets.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#keys` (`vendor/ruby/hash.c:3584`).
   */
  override keys(): MapBoundaryReturn {
    return [...super.keys()];
  }

  /**
   * `Hash#values` (`vendor/ruby/hash.c:3628` `rb_hash_values`): an Array of the
   * values, where `Map#values` is an iterator.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#values` (`vendor/ruby/hash.c:3628`).
   */
  override values(): MapBoundaryReturn {
    return [...super.values()];
  }
}
