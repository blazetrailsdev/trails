import { KeyError } from "./key-error.js";
import { isSymbol } from "./symbol.js";

/**
 * Ruby `Hash#fetch` (`vendor/ruby/hash.c:2176` `rb_hash_fetch_m`), both arms:
 * with a second argument the stored value or that default, and with one
 * argument the stored value or a `KeyError`. Ruby's block form is the third
 * arm and is not ported — no call site yields the missing key through this
 * export.
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
 * `rb_hash_fetch_m` dispatches on `argc`, so the two arms share one body over a
 * rest parameter: an absent second argument is the raising arm, and an
 * explicitly-passed `undefined` is a default, exactly as Ruby's `nil` is.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/hash.c:2176`).
 */
export function fetch(hash: Record<string, unknown>, key: string, ...rest: unknown[]): unknown {
  if (hasKey(hash, key)) {
    return hash[key];
  } else if (rest.length === 0) {
    throw new KeyError(`key not found: ${strEllipsize(inspectKey(key), 65)}`);
  } else {
    return rest[0];
  }
}

/**
 * Ruby `Hash#key?` / `#has_key?` (`vendor/ruby/hash.c:3671`
 * `rb_hash_has_key`) — membership, which for a stored `nil` or `false` is the
 * question `hash[key] !== undefined` cannot answer.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#key?` (`vendor/ruby/hash.c:3671`).
 */
export function hasKey(hash: Record<string, unknown>, key: string): boolean {
  /* `vendor/ruby/hash.c:3671` `rb_hash_has_key` reads the hash table through
     `hash_stlike_lookup`, never an ancestor: a Ruby Hash has no prototype
     chain, so `"toString" in {}` is an answer Ruby never gives. */
  return Object.hasOwn(hash, key);
}

function inspectKey(key: string): string {
  return isSymbol(key) ? key : JSON.stringify(key);
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
 * Ruby `Hash#merge` (`vendor/ruby/hash.c:4144` `rb_hash_merge`), which is
 * `rb_hash_update` over `rb_hash_dup(self)` — a NEW hash, the receiver
 * untouched. Ruby's conflict block is the second arm and is not ported; no
 * call site passes one.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#merge` (`vendor/ruby/hash.c:4144`).
 */
export function merge<T>(
  hash: Record<string, T>,
  ...others: Record<string, T>[]
): Record<string, T> {
  return update({ ...hash }, ...others);
}

/**
 * Ruby `Hash#update` (`vendor/ruby/hash.c:4028` `rb_hash_update`) — MUTATES
 * the receiver and returns it, which is the whole difference from `merge`.
 * Each argument is applied in turn, so a later one wins.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#update` (`vendor/ruby/hash.c:4028`).
 */
export function update<T>(
  hash: Record<string, T>,
  ...others: Record<string, T>[]
): Record<string, T> {
  for (const other of others) {
    for (const key of Object.keys(other)) {
      hash[key] = other[key];
    }
  }
  return hash;
}

/**
 * Ruby `Hash#merge!` (`vendor/ruby/hash.c:7247`), which MRI defines onto the
 * same `rb_hash_update` body as `update`.
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
  const result: Record<string, U> = {};
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
  const result: Record<string, T> = {};
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
  const result = { ...hash };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Ruby `Hash#dup` (`vendor/ruby/object.c:591` `rb_obj_dup`), which for a Hash
 * allocates through `rb_hash_dup` (`vendor/ruby/hash.c:1584`): a NEW hash with
 * the same pairs in the same order, carrying the receiver's `default` /
 * `default_proc` over — `hash_dup` passes `RHASH_IFNONE(hash)` and the
 * `RHASH_PROC_DEFAULT` flag through to the allocation, which a plain object
 * spread has nowhere to put.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#dup` (`vendor/ruby/object.c:591`).
 */
export function dup<K, V>(hash: Hash<K, V>): Hash<K, V>;
/**
 * The plain-object arm: a Hash with no `default` seat is an object literal in
 * trails, and `rb_obj_dup` over it is the spread.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#dup` (`vendor/ruby/object.c:591`).
 */
export function dup<T>(hash: Record<string, T>): Record<string, T>;
/**
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#dup` (`vendor/ruby/object.c:591`).
 */
export function dup(
  hash: Hash<unknown, unknown> | Record<string, unknown>,
): Hash<unknown, unknown> | Record<string, unknown> {
  if (!(hash instanceof Hash)) return { ...hash };
  const ret = new Hash<unknown, unknown>();
  const defaultProc = hash.defaultProc();
  /* `hash_dup` (`vendor/ruby/hash.c:1577`) passes `RHASH_IFNONE(hash)` and the
     `RHASH_PROC_DEFAULT` flag separately, so which seat the value lands in is
     the receiver's flag — not a typeof test on the value. */
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
}
