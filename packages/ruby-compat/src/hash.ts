import { FrozenError } from "./frozen-error.js";
import { KeyError } from "./key-error.js";
import { rbInspect } from "./object.js";
import { rbEql } from "./rb-equal.js";
import { rbHash } from "./rb-hash.js";
import { RuntimeError } from "./runtime-error.js";

const BLOCK = Symbol.for("@blazetrails/ruby-compat:block");
const UNDEF = Symbol("Qundef");

/** @noRailsEquivalent PERMANENT — Ruby's `&block`, read back by `rb_block_given_p` (`vendor/ruby/v3.3.11/eval.c:866`); TypeScript has no such syntax, and a stored default may itself be callable, so the block carries a mark instead. */
export type Block<T> = ((key: string) => T) & { readonly [BLOCK]: true };

/** @noRailsEquivalent PERMANENT — Ruby's `&` block-pass, whose `rb_block_given_p` (`vendor/ruby/v3.3.11/eval.c:866`) TypeScript has no equivalent of. */
export function block<T>(fn: (key: string) => T): Block<T>;
/** @noRailsEquivalent PERMANENT — Ruby's `&` block-pass, whose `rb_block_given_p` (`vendor/ruby/v3.3.11/eval.c:866`) TypeScript has no equivalent of. */
export function block<T>(fn: (key: string, oldValue: T, newValue: T) => T): ConflictBlock<T>;
/** @noRailsEquivalent PERMANENT — Ruby's `&` block-pass, whose `rb_block_given_p` (`vendor/ruby/v3.3.11/eval.c:866`) TypeScript has no equivalent of; a block yielded something other than a key. */
export function block<F extends (...args: never[]) => unknown>(
  fn: F,
): F & { readonly [BLOCK]: true };
/** @noRailsEquivalent PERMANENT — Ruby's `&` block-pass, whose `rb_block_given_p` (`vendor/ruby/v3.3.11/eval.c:866`) TypeScript has no equivalent of; one mark serves every yield signature. */
export function block(fn: (...args: never[]) => unknown): unknown {
  const blk = function (this: unknown, ...args: never[]): unknown {
    return fn.apply(this, args);
  };
  Object.defineProperty(blk, "length", { value: fn.length });
  return Object.assign(blk, { [BLOCK]: true as const });
}

/**
 * `rb_block_given_p` (`vendor/ruby/v3.3.11/eval.c:866`): whether a trailing
 * argument is a {@link block}-marked `&block` rather than a positional callable.
 *
 * @noRailsEquivalent PERMANENT
 */
export function rbBlockGivenP(value: unknown): value is Block<unknown> {
  return typeof value === "function" && (value as Partial<Block<unknown>>)[BLOCK] === true;
}

function ownMethod(hash: object, mid: string): ((...args: unknown[]) => unknown) | undefined {
  if (hash instanceof Map) return undefined;
  const proto: unknown = Object.getPrototypeOf(hash);
  if (proto === Object.prototype || proto === null) return undefined;
  const own = (hash as Record<string, unknown>)[mid];
  return typeof own === "function" ? (own as (...args: unknown[]) => unknown) : undefined;
}

/**
 * Ruby `Hash#fetch` (`vendor/ruby/v3.3.11/hash.c:2176` `rb_hash_fetch_m`), all three
 * arms: with one argument the stored value or a `KeyError`, with a second the
 * stored value or that default, and with a {@link block} the stored value or
 * what the block returns for the missing key.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/v3.3.11/hash.c:2176`).
 */
export function fetch<T>(
  hash: Record<string, unknown> | { fetch(key: string, ...rest: never): unknown },
  key: string,
): T;
/**
 * The block arm: on a miss `rb_hash_fetch_m` yields the key and returns what
 * the block returns, which is what `Rack::Request::Env#fetch_header`
 * (`vendor/rack/v3.1.14/lib/rack/request.rb:106-108`) installs a default through.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/v3.3.11/hash.c:2176`).
 */
export function fetch<T>(
  hash: Record<string, unknown> | { fetch(key: string, ...rest: never): unknown },
  key: string,
  block: Block<T>,
): T;
/**
 * The two-argument arm: the STORED value whenever the key exists — including a
 * stored `nil` or `false` — and otherwise `defaultValue`, which is what `??`
 * gets wrong.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/v3.3.11/hash.c:2176`).
 */
export function fetch<T>(
  hash: Record<string, unknown> | { fetch(key: string, ...rest: never): unknown },
  key: string,
  defaultValue: T,
): T;
/**
 * The arguments forwarded as received, which is how a delegated `fetch`
 * (`delegate :fetch, to: :attributes`) reaches `Hash#fetch`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/v3.3.11/hash.c:2176`).
 */
export function fetch<T>(
  hash: Record<string, unknown> | { fetch(key: string, ...rest: never): unknown },
  key: string,
  ...rest: [] | [T | Block<T>]
): T;
/**
 * The Map arm: a Hash keyed by objects, looked up the same way.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/v3.3.11/hash.c:2176`).
 */
export function fetch<K, V, T>(hash: Map<K, V>, key: K, defaultValue: T): V | T;
/**
 * The Map arm with the arguments forwarded as received, which is how a
 * subclass's `fetch(key, *args)` reaches `super(key, *args)`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/v3.3.11/hash.c:2176`).
 */
export function fetch<K, V>(hash: Map<K, V>, key: K, ...rest: unknown[]): unknown;
/**
 * `rb_hash_fetch_m` dispatches on `argc` and `rb_block_given_p`, so the arms
 * share one body over a rest parameter: an absent second argument is the
 * raising arm, and an explicitly-passed `undefined` is a default, exactly as
 * Ruby's `nil` is.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#fetch` (`vendor/ruby/v3.3.11/hash.c:2176`).
 */
export function fetch(
  receiver:
    | Record<string, unknown>
    | Map<unknown, unknown>
    | { fetch(key: string, ...rest: never): unknown },
  key: unknown,
  ...rest: unknown[]
): unknown {
  const own = ownMethod(receiver, "fetch");
  if (own) return own.call(receiver, key, ...rest);
  const hash = receiver as Record<string, unknown> | Map<unknown, unknown>;
  const blockGiven = rbBlockGivenP(rest[0]);
  if (!(hash instanceof Map ? hash.has(key) : hasKey(hash, key as string))) {
    if (blockGiven) {
      return (rest[0] as (key: unknown) => unknown)(key);
    } else if (rest.length === 0) {
      throw new KeyError(`key not found: ${strEllipsize(rbInspect(key), 65)}`, {
        receiver: hash,
        key,
      });
    } else {
      return rest[0];
    }
  }
  return hash instanceof Map ? hash.get(key) : hash[key as string];
}

/**
 * Ruby `Hash#key?` / `#has_key?` (`vendor/ruby/v3.3.11/hash.c:3671`
 * `rb_hash_has_key`) — membership, which for a stored `nil` or `false` is the
 * question `hash[key] !== undefined` cannot answer. A receiver that is not a
 * Hash and defines `isKey` answers through it, as Ruby sends `key?` to the
 * receiver: `values.key?(name)`
 * (`activemodel/lib/active_model/attribute_set/builder.rb:33`) is
 * `ActiveRecord::Result::IndexedRow#key?` when `values` is one. `fetch`,
 * `keys` and `eachKey` dispatch the same way.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#key?` (`vendor/ruby/v3.3.11/hash.c:3671`).
 */
export function hasKey(hash: object, key: PropertyKey): boolean {
  /* `vendor/ruby/v3.3.11/hash.c:3671` `rb_hash_has_key` reads the hash table through
     `hash_stlike_lookup`, never an ancestor: a Ruby Hash has no prototype
     chain, so `"toString" in {}` is an answer Ruby never gives. */
  const own = ownMethod(hash, "isKey");
  if (own) return own.call(hash, key) as boolean;
  return Object.hasOwn(hash, key);
}

/**
 * Ruby `Hash#keys` (`vendor/ruby/v3.3.11/hash.c:3584` `rb_hash_keys`): a new Array
 * of the keys, in insertion order.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#keys` (`vendor/ruby/v3.3.11/hash.c:3584`).
 */
export function keys<K = string>(
  hash: Record<string, unknown> | Map<K, unknown> | { keys(): K[] },
): K[] {
  if (hash instanceof Map) return [...hash.keys()];
  const own = ownMethod(hash, "keys");
  if (own) return own.call(hash) as K[];
  return Object.keys(hash) as K[];
}

/**
 * Ruby `Hash#include?` (`vendor/ruby/v3.3.11/hash.c:7255`), which MRI defines onto the
 * same `rb_hash_has_key` body as `key?` and `has_key?`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#include?` (`vendor/ruby/v3.3.11/hash.c:7255`).
 */
export const isInclude = hasKey;

const ELLIPSIS = "...";

/**
 * `rb_str_ellipsize` (`vendor/ruby/v3.3.11/string.c:11027`), the ASCII-compatible arm
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
 * (`vendor/ruby/v3.3.11/hash.c:2531`) tests its result with `RTEST` — false only for
 * `nil` and `false` — so `deleteIf` spells that test out rather than coercing
 * with `Boolean()`.
 */
type PairBlock<T> = (key: string, value: T) => unknown;

/**
 * The conflict block `rb_hash_update` and `rb_hash_merge` take
 * (`vendor/ruby/v3.3.11/hash.c:4012-4022` `rb_hash_update_block_i`), yielded the key,
 * the RECEIVER's value and the argument's, in that order.
 */
export type ConflictBlock<T> = ((key: string, oldValue: T, newValue: T) => T) & {
  readonly [BLOCK]: true;
};

/**
 * Ruby `Hash#merge` (`vendor/ruby/v3.3.11/hash.c:4144` `rb_hash_merge`), which is
 * `rb_hash_update` over `rb_hash_dup(self)` — a NEW hash, the receiver
 * untouched, and it inherits `rb_hash_update`'s conflict-block arm through
 * that call.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#merge` (`vendor/ruby/v3.3.11/hash.c:4144`).
 */
export function merge<H extends object, const O extends object>(
  hash: H,
  other: O,
): Omit<H, keyof O> & O;
export function merge<T>(
  hash: Record<string, T>,
  ...others: (Record<string, T> | ConflictBlock<T>)[]
): Record<string, T>;
/** @noRailsEquivalent PERMANENT — Ruby core `Hash#merge` (`vendor/ruby/v3.3.11/hash.c:4144`). */
export function merge<T>(
  hash: Record<string, T>,
  ...others: (Record<string, T> | ConflictBlock<T>)[]
): Record<string, T> {
  return update(dup(hash), ...others);
}

/**
 * Ruby `Hash#update` (`vendor/ruby/v3.3.11/hash.c:4028` `rb_hash_update`) — MUTATES
 * the receiver and returns it, which is the whole difference from `merge`.
 * Each argument is applied in turn, so a later one wins — unless a trailing
 * conflict block is given, which `rb_hash_update_block_i`
 * (`vendor/ruby/v3.3.11/hash.c:4012-4022`) yields for a key already in the receiver,
 * storing what it returns. Each argument goes through `rb_to_hash_type`, so a
 * `Hash` (a `Map`) is applied as readily as a plain object.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#update` (`vendor/ruby/v3.3.11/hash.c:4028`).
 */
export function update<T>(
  hash: Record<string, T>,
  ...others: (Record<string, T> | Map<string, T> | ConflictBlock<T>)[]
): Record<string, T>;
/**
 * The Map arm: a `Hash` receiver is written through its own `[]=`, as
 * `rb_hash_update_i` does through `rb_hash_aset` (`vendor/ruby/v3.3.11/hash.c:3945`).
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#update` (`vendor/ruby/v3.3.11/hash.c:4028`).
 */
export function update<T, H extends Map<string, T>>(
  hash: H,
  ...others: (Record<string, T> | Map<string, T> | ConflictBlock<T>)[]
): H;
/** @noRailsEquivalent PERMANENT — Ruby core `Hash#update` (`vendor/ruby/v3.3.11/hash.c:4028`). */
export function update<T>(
  hash: Record<string, T> | Map<string, T>,
  ...others: (Record<string, T> | Map<string, T> | ConflictBlock<T>)[]
): Record<string, T> | Map<string, T> {
  const block = rbBlockGivenP(others[others.length - 1])
    ? (others.pop() as ConflictBlock<T>)
    : undefined;
  for (const other of others as (Record<string, T> | Map<string, T>)[]) {
    for (const [key, value] of other instanceof Map ? other : Object.entries(other)) {
      if (hash instanceof Map) {
        hash.set(
          key,
          block !== undefined && hash.has(key) ? block(key, hash.get(key)!, value) : value,
        );
      } else {
        hash[key] = block !== undefined && hasKey(hash, key) ? block(key, hash[key], value) : value;
      }
    }
  }
  return hash;
}

/**
 * Ruby `Hash#merge!` (`vendor/ruby/v3.3.11/hash.c:7247`), which MRI defines onto the
 * same `rb_hash_update` body as `update`, conflict-block arm included.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#merge!` (`vendor/ruby/v3.3.11/hash.c:4028`).
 */
export const mergeBang = update;

/**
 * Ruby `Hash#delete` (`vendor/ruby/v3.3.11/hash.c:2441` `rb_hash_delete_m`) — removes
 * the entry and returns its stored value, or `nil` when the key is absent,
 * where the block form yields the key instead.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#delete` (`vendor/ruby/v3.3.11/hash.c:2441`).
 */
export function hashDelete<T, U = null>(
  hash: Record<string, T>,
  key: string,
  block?: (key: string) => U,
): T | U | null;
/**
 * The Map arm: `rb_hash_delete_m` is the same removal whichever hash it is given.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#delete` (`vendor/ruby/v3.3.11/hash.c:2441`).
 */
export function hashDelete<K, V, U = null>(
  hash: Map<K, V>,
  key: K,
  block?: (key: K) => U,
): V | U | null;
/**
 * Either hash, where the caller holds one it cannot tell apart statically.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#delete` (`vendor/ruby/v3.3.11/hash.c:2441`).
 */
export function hashDelete(hash: object, key: unknown): unknown;
/** @noRailsEquivalent PERMANENT — Ruby core `Hash#delete` (`vendor/ruby/v3.3.11/hash.c:2441`). */
export function hashDelete(hash: object, key: unknown, block?: (key: never) => unknown): unknown {
  if (hash instanceof Map) {
    if (hash.has(key)) {
      const val = hash.get(key);
      hash.delete(key);
      return val;
    }
  } else {
    if (Object.isFrozen(hash)) {
      throw new FrozenError(`can't modify frozen Hash: ${rbInspect(hash)}`, { receiver: hash });
    }
    if (Object.hasOwn(hash, key as string)) {
      const val = (hash as Record<string, unknown>)[key as string];
      delete (hash as Record<string, unknown>)[key as string];
      return val;
    }
  }
  if (block) {
    return block(key as never);
  } else {
    return null;
  }
}

/**
 * Ruby `Hash#[]` (`vendor/ruby/v3.3.11/hash.c:2121` `rb_hash_aref`) — the stored
 * value, or `nil` when the key is absent, whichever hash it is given. A
 * receiver that is not a Hash is sent its own `[]`, which it must spell `get`,
 * the conventions table's default spelling for the operator. A miss on a
 * plain-object hash asks the hash itself, as `rb_hash_default_value`
 * (`vendor/ruby/v3.3.11/hash.c:2068`) does: a Proxy seating `hash.default=`
 * answers its default, and a member `Object.prototype` answers is `nil`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#[]` (`vendor/ruby/v3.3.11/hash.c:2121`).
 */
export function hashAref(hash: object, key: unknown): unknown {
  const own = ownMethod(hash, "get");
  if (own) return own.call(hash, key);
  if (hash instanceof Map) return hash.has(key) ? hash.get(key) : null;
  const val = (hash as Record<string, unknown>)[key as string];
  if (hasKey(hash, key as string)) return val;
  const proto: unknown = Object.getPrototypeOf(hash);
  if (proto === null) return val === undefined ? null : val;
  if (proto !== Object.prototype) return null;
  return val === undefined || val === Reflect.get(Object.prototype, key as string, hash)
    ? null
    : val;
}

/**
 * Ruby `Hash#[]=` (`vendor/ruby/v3.3.11/hash.c:2018` `rb_hash_aset`) — stores the
 * pair and returns the value, as the assignment expression does. A receiver
 * that is not a Hash is sent its own `[]=`, spelled `set`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#[]=` (`vendor/ruby/v3.3.11/hash.c:2018`).
 */
export function hashAset<T>(hash: object, key: unknown, val: T): T {
  const own = ownMethod(hash, "set");
  if (own) {
    own.call(hash, key, val);
    return val;
  }
  if (hash instanceof Map) {
    hash.set(key, val);
    return val;
  }
  if (Object.isFrozen(hash)) {
    throw new FrozenError(`can't modify frozen Hash: ${rbInspect(hash)}`, { receiver: hash });
  }
  if (key === "__proto__") {
    Object.defineProperty(hash, key, {
      value: val,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    (hash as Record<string, unknown>)[key as string] = val;
  }
  return val;
}

/**
 * Ruby `Hash#delete_if` (`vendor/ruby/v3.3.11/hash.c:2564` `rb_hash_delete_if`) —
 * MUTATES the receiver, dropping every pair the block answers truthily for,
 * and returns it.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#delete_if` (`vendor/ruby/v3.3.11/hash.c:2564`).
 */
export function deleteIf<T>(hash: Record<string, T>, block: PairBlock<T>): Record<string, T> {
  for (const key of Object.keys(hash)) {
    const rejected = block(key, hash[key]);
    if (rejected != null && rejected !== false) delete hash[key];
  }
  return hash;
}

/**
 * Ruby `Hash#keep_if` (`vendor/ruby/v3.3.11/hash.c:2844` `rb_hash_keep_if`) — the
 * inverse of `delete_if`: MUTATES the receiver, dropping every pair the block
 * answers falsily for (`keep_if_i`, `hash.c:2757`), and returns it.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#keep_if` (`vendor/ruby/v3.3.11/hash.c:2844`).
 */
export function keepIf<T>(hash: Record<string, T>, block: PairBlock<T>): Record<string, T> {
  for (const key of Object.keys(hash)) {
    const kept = block(key, hash[key]);
    if (kept == null || kept === false) delete hash[key];
  }
  return hash;
}

/**
 * Ruby `Hash#reject` (`vendor/ruby/v3.3.11/hash.c:2626` `rb_hash_reject`) — the
 * non-mutating twin: `delete_if` over a dup.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#reject` (`vendor/ruby/v3.3.11/hash.c:2626`).
 */
export function reject<T>(hash: Record<string, T>, block: PairBlock<T>): Record<string, T> {
  return deleteIf(dup(hash), block);
}

/**
 * Ruby `Hash#each_pair` (`vendor/ruby/v3.3.11/hash.c:3149` `rb_hash_each_pair`), which
 * `Hash#each` is also defined onto (`hash.c:7219`): yields each key and value
 * and returns the receiver. A `Hash` (a `Map`) is walked as readily as a plain object.
 * A receiver that is not a Hash is sent its own `each`, as {@link hashAref}
 * sends one its own `[]`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_pair` (`vendor/ruby/v3.3.11/hash.c:3149`).
 */
export function eachPair<T>(hash: Record<string, T>, block: PairBlock<T>): Record<string, T>;
/**
 * The Map arm: `rb_hash_foreach` walks whichever hash it is given.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_pair` (`vendor/ruby/v3.3.11/hash.c:3149`).
 */
export function eachPair<T>(hash: Map<string, T>, block: PairBlock<T>): Map<string, T>;
/**
 * Either arm, for a receiver typed as either.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_pair` (`vendor/ruby/v3.3.11/hash.c:3149`).
 */
export function eachPair<T>(
  hash: Record<string, T> | Map<string, T>,
  block: PairBlock<T>,
): Record<string, T> | Map<string, T>;
/**
 * The arms share one body.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_pair` (`vendor/ruby/v3.3.11/hash.c:3149`).
 */
export function eachPair<T>(
  hash: Record<string, T> | Map<string, T>,
  block: PairBlock<T>,
): Record<string, T> | Map<string, T> {
  const own = ownMethod(hash, "each");
  if (own) {
    own.call(hash, block);
    return hash;
  }
  if (hash instanceof Map) {
    for (const [key, value] of hash) block(key, value);
    return hash;
  }
  for (const key of Object.keys(hash)) {
    block(key, hash[key]);
  }
  return hash;
}

/**
 * Ruby `Hash#inspect` (`vendor/ruby/v3.3.11/hash.c:3483` `rb_hash_inspect`): `"{}"` for
 * an empty hash, and otherwise `inspect_hash` (`hash.c:3459`) wrapping the
 * `inspect_i` (`hash.c:3439`) pairs — each `rb_inspect(key)`, `"=>"`,
 * `rb_inspect(value)`, joined by `", "`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#inspect` (`vendor/ruby/v3.3.11/hash.c:3483`).
 */
export function inspect(hash: Record<string, unknown> | Map<unknown, unknown>): string {
  return rbInspect(hash);
}

/**
 * Ruby `Hash#each_value` (`vendor/ruby/v3.3.11/hash.c:3060` `rb_hash_each_value`):
 * yields each value alone and returns the receiver.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_value` (`vendor/ruby/v3.3.11/hash.c:3060`).
 */
export function eachValue<T, R = never>(
  hash: Record<string, T> | { eachValue(block: (value: T) => unknown): R },
  block: (value: T) => unknown,
): Record<string, T> | R;
/**
 * The blockless arm, `RETURN_SIZED_ENUMERATOR` (`hash.c:3061`): the values an
 * Enumerable call chained onto the Enumerator iterates.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_value` (`vendor/ruby/v3.3.11/hash.c:3060`).
 */
export function eachValue<T>(hash: Record<string, T>): T[];
/**
 * The arms share one body.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_value` (`vendor/ruby/v3.3.11/hash.c:3060`).
 */
export function eachValue<T>(
  receiver: Record<string, T> | { eachValue(block: (value: T) => unknown): unknown },
  block?: (value: T) => unknown,
): unknown {
  const own = ownMethod(receiver, "eachValue");
  if (own) return block ? own.call(receiver, block) : own.call(receiver);
  const hash = receiver as Record<string, T>;
  if (!block) return Object.values(hash);
  for (const key of Object.keys(hash)) {
    block(hash[key]);
  }
  return hash;
}

/**
 * Ruby `Hash#each_key` (`vendor/ruby/v3.3.11/hash.c:3098` `rb_hash_each_key`): yields
 * each key alone and returns the receiver.
 * A receiver that defines `eachKey` answers what its own method returns, which
 * need not be the receiver: `LazyAttributeHash#each_key` is `keys.each(&block)`
 * (`activemodel/lib/active_model/attribute_set/builder.rb:129-132`), the keys
 * Array `Array#each` returns.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_key` (`vendor/ruby/v3.3.11/hash.c:3098`).
 */
export function eachKey<T, R = never>(
  hash: Record<string, T> | { eachKey(block: (key: string) => unknown): R },
  block: (key: string) => unknown,
): Record<string, T> | R;
/**
 * The blockless arm, `RETURN_SIZED_ENUMERATOR` (`hash.c:3100`): the keys an
 * Enumerable call chained onto the Enumerator iterates.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_key` (`vendor/ruby/v3.3.11/hash.c:3098`).
 */
export function eachKey<T>(hash: Record<string, T> | { eachKey(): string[] }): string[];
/**
 * The arms share one body.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_key` (`vendor/ruby/v3.3.11/hash.c:3098`).
 */
export function eachKey<T>(
  hash: Record<string, T> | { eachKey(block?: (key: string) => unknown): unknown },
  block?: (key: string) => unknown,
): unknown {
  const own = ownMethod(hash, "eachKey");
  if (own) return block ? own.call(hash, block) : own.call(hash);
  if (!block) return Object.keys(hash);
  for (const key of Object.keys(hash)) {
    block(key);
  }
  return hash;
}

/**
 * Ruby `Hash#transform_values` (`vendor/ruby/v3.3.11/hash.c:3366`
 * `rb_hash_transform_values`) — a NEW hash with the same keys in the same
 * order and each value replaced by the block's result.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#transform_values` (`vendor/ruby/v3.3.11/hash.c:3366`).
 */
export function transformValues<T, U>(
  hash: Record<string, T> | { transformValues(block: (value: T) => unknown): object },
  block: (value: T) => U,
): Record<string, U>;
/**
 * The Map arm: `rb_hash_transform_values` answers a bare `Hash`
 * (`rb_hash_new`), whatever the receiver's class and without its default.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#transform_values` (`vendor/ruby/v3.3.11/hash.c:3366`).
 */
export function transformValues<K, T, U>(hash: Map<K, T>, block: (value: T) => U): Hash<K, U>;
/** @noRailsEquivalent PERMANENT — Ruby core `Hash#transform_values` (`vendor/ruby/v3.3.11/hash.c:3366`). */
export function transformValues(
  hash: Record<string, unknown> | Map<unknown, unknown>,
  block: (value: unknown) => unknown,
): Record<string, unknown> | Hash<unknown, unknown> {
  const own = ownMethod(hash, "transformValues");
  if (own) return own.call(hash, block) as Record<string, unknown>;
  if (hash instanceof Map) {
    const result = new Hash<unknown, unknown>();
    for (const [key, value] of hash) {
      result.set(key, block(value));
    }
    return result;
  }
  /* `rb_hash_transform_values` (`vendor/ruby/v3.3.11/hash.c:3366`) builds the new hash
     with `rb_hash_new`, which has no ancestors: `__proto__` is an ordinary key
     there, where `result["__proto__"] = v` on a plain `{}` reaches
     Object.prototype's setter and stores nothing. */
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(hash)) {
    result[key] = block(hash[key]);
  }
  return result;
}

/**
 * Ruby `Hash#slice` (`vendor/ruby/v3.3.11/hash.c:2651` `rb_hash_slice`) — a NEW hash
 * of just the given keys, in ARGUMENT order, keys that are absent ignored.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#slice` (`vendor/ruby/v3.3.11/hash.c:2651`).
 */
export function slice<T>(hash: Record<string, T>, ...keys: string[]): Record<string, T>;
/**
 * The Map arm: `rb_hash_slice` answers a bare `Hash` (`rb_hash_new_with_size`)
 * whatever the receiver's class.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#slice` (`vendor/ruby/v3.3.11/hash.c:2651`).
 */
export function slice<K, V>(hash: Map<K, V>, ...keys: K[]): Hash<K, V>;
/** @noRailsEquivalent PERMANENT — Ruby core `Hash#slice` (`vendor/ruby/v3.3.11/hash.c:2651`). */
export function slice(
  hash: Record<string, unknown> | Map<unknown, unknown>,
  ...keys: unknown[]
): Record<string, unknown> | Hash<unknown, unknown> {
  if (hash instanceof Map) {
    const result = new Hash<unknown, unknown>();
    for (const key of keys) {
      if (hash.has(key)) result.set(key, hash.get(key));
    }
    return result;
  }
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    if (hasKey(hash, key)) result[key] = hash[key];
  }
  return result;
}

/**
 * Ruby `Hash#except` (`vendor/ruby/v3.3.11/hash.c:2683` `rb_hash_except`) — a dup
 * with the given keys deleted, keys that are absent ignored.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#except` (`vendor/ruby/v3.3.11/hash.c:2683`).
 */
export function except<T>(
  receiver: Record<string, T> | { except(...keys: string[]): Record<string, T> },
  ...keys: string[]
): Record<string, T> {
  const own = ownMethod(receiver, "except");
  if (own) return own.call(receiver, ...keys) as Record<string, T>;
  const hash = receiver as Record<string, T>;
  /* `rb_hash_except` (`vendor/ruby/v3.3.11/hash.c:2683`) deletes from a
     `hash_dup_with_compare_by_id`, so the result is an ancestor-less Hash in
     which `__proto__` stays an ordinary key. */
  const result: Record<string, T> = Object.assign(Object.create(null) as Record<string, T>, hash);
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Ruby `Hash#values_at` (`vendor/ruby/v3.3.11/hash.c:2713` `rb_hash_values_at`) — an
 * ARRAY of the values for the given keys, in argument order, `nil` for a key
 * the hash does not hold.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#values_at` (`vendor/ruby/v3.3.11/hash.c:2713`).
 */
export function valuesAt<T>(hash: Record<string, T>, ...keys: string[]): (T | undefined)[];
/**
 * The Map arm: `rb_hash_aref` is the same lookup whichever hash it is given.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#values_at` (`vendor/ruby/v3.3.11/hash.c:2713`).
 */
export function valuesAt<K, T>(hash: Map<K, T>, ...keys: K[]): (T | undefined)[];
/**
 * Ruby `Array#values_at` with Integer indexes (`vendor/ruby/v3.3.11/array.c:3769`
 * `rb_ary_values_at`): the element at each index, a negative one counting from
 * the end (`rb_ary_entry`, `array.c:1687`), `nil` past either end. The Range
 * arm of `rb_get_values_at` (`array.c:3672`) is not ported: nothing calls it.
 * @noRailsEquivalent PERMANENT — Ruby core `Array#values_at` (`vendor/ruby/v3.3.11/array.c:3769`).
 */
export function valuesAt<T>(ary: readonly T[], ...indexes: number[]): (T | undefined)[];
/**
 * `rb_hash_values_at` pushes `rb_hash_aref(hash, argv[i])` for each key, so the
 * arms share one body over the rest parameter.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#values_at` (`vendor/ruby/v3.3.11/hash.c:2713`).
 */
export function valuesAt(
  hash: Record<string, unknown> | Map<unknown, unknown> | readonly unknown[],
  ...keys: unknown[]
) {
  if (hash instanceof Map) return keys.map((key) => hash.get(key));
  if (Array.isArray(hash)) return keys.map((index) => hash.at(index as number));
  return keys.map((key) => (hash as Record<string, unknown>)[key as string]);
}

/**
 * Ruby `Hash#dup` (`vendor/ruby/v3.3.11/object.c:591` `rb_obj_dup`), which for a Hash
 * allocates through `rb_hash_dup` (`vendor/ruby/v3.3.11/hash.c:1584`): a NEW hash of
 * the receiver's class (`rb_obj_class(hash)`) with the same pairs in the same order, carrying the receiver's `default` /
 * `default_proc` over — `hash_dup` passes `RHASH_IFNONE(hash)` and the
 * `RHASH_PROC_DEFAULT` flag through to the allocation, which a plain object
 * spread has nowhere to put. The flag is what decides which of the two seats
 * the value lands in, so the port reads the receiver's seat rather than
 * testing the value's type. `hash_copy` (`vendor/ruby/v3.3.11/hash.c:1530`)
 * copies the table with its type, so an identity hash dups into one.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#dup` (`vendor/ruby/v3.3.11/object.c:591`).
 */
export function dup<K, V>(hash: Hash<K, V>): Hash<K, V>;
/**
 * The plain-object arm: a Hash with no `default` seat is an object literal in
 * trails, and `rb_obj_dup` over it copies the pairs into a fresh
 * `rb_hash_dup` allocation, which has no ancestors — so `__proto__` stays an
 * ordinary key in the copy, as it does in `transformValues` and `except`.
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#dup` (`vendor/ruby/v3.3.11/object.c:591`).
 */
export function dup<T>(hash: Record<string, T>): Record<string, T>;
/**
 * @noRailsEquivalent PERMANENT — Ruby core `Hash#dup` (`vendor/ruby/v3.3.11/object.c:591`).
 */
export function dup(
  hash: Hash<unknown, unknown> | Record<string, unknown>,
): Hash<unknown, unknown> | Record<string, unknown> {
  if (!(hash instanceof Hash)) {
    return Object.assign(Object.create(null) as Record<string, unknown>, hash);
  }
  return hashDup(hash, hash.constructor as new () => Hash<unknown, unknown>);
}

/**
 * `hash_dup` (`vendor/ruby/v3.3.11/hash.c:1576`): a `klass` allocation holding a
 * `hash_copy` of the table, which is not written through `klass`'s `[]=`.
 */
function hashDup<K, V>(hash: Hash<K, V>, klass: new () => Hash<K, V>): Hash<K, V> {
  const ret = new klass();
  const defaultProc = hash.defaultProc();
  if (defaultProc) ret.setDefaultProc(defaultProc);
  else ret.setDefault(hash.default());
  if (hash.isCompareByIdentity()) ret.compareByIdentity();
  for (const [key, value] of hash) {
    Hash.prototype.set.call(ret, key, value);
  }
  return ret;
}

/**
 * A `Hash#default_proc` (`vendor/ruby/v3.3.11/hash.c:2308` `rb_hash_set_default_proc`):
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
 * @noRailsEquivalent PERMANENT — Ruby core `Hash` (`vendor/ruby/v3.3.11/hash.c:7182`).
 */
export class Hash<K, V> extends Map<K, V> {
  #default?: V;
  #defaultProc?: DefaultProc<K, V>;
  #frozen = false;
  #eqlKeys = new Map<number, K[]>();
  #stHash = new WeakMap<object, number>();
  #identhash = false;
  #iterLev = 0;

  /**
   * `Hash.new` (`vendor/ruby/v3.3.11/hash.c:1782` `rb_hash_initialize`): a block is
   * the default_proc, an argument the default value, neither is `nil`. A block
   * is a single trailing function argument, the spelling `fetch` uses.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash.new` (`vendor/ruby/v3.3.11/hash.c:1782`).
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
   * `Hash#[]` (`vendor/ruby/v3.3.11/hash.c:2121` `rb_hash_aref`) — a miss goes to
   * `rb_hash_default_value` (`hash.c:2068`), which runs the default_proc with
   * the missing key.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#[]` (`vendor/ruby/v3.3.11/hash.c:2121`).
   */
  /**
   * `Object#freeze` (`vendor/ruby/v3.3.11/object.c:1284` `rb_obj_freeze`), which
   * `Hash#freeze` (`vendor/ruby/v3.3.11/hash.c:107`) is. `Object.freeze` cannot serve:
   * it seals a JS object's properties, and a `Map`'s entries are not
   * properties, so the seat is the `FL_FREEZE` flag `rb_hash_modify_check`
   * reads.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Object#freeze` (`vendor/ruby/v3.3.11/object.c:1284`).
   */
  freeze(): this {
    this.#frozen = true;
    return this;
  }

  /**
   * `Object#frozen?` (`vendor/ruby/v3.3.11/object.c:1301` `rb_obj_frozen_p`). Ruby's
   * `?` predicate suffix is `is` here, per the conventions.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Object#frozen?` (`vendor/ruby/v3.3.11/object.c:1301`).
   */
  isFrozen(): boolean {
    return this.#frozen;
  }

  /**
   * `rb_hash_modify_check` (`vendor/ruby/v3.3.11/hash.c:1602`), which every mutator
   * calls first: `rb_check_frozen` raises `FrozenError` naming the receiver's
   * class and `inspect`.
   */
  private modifyCheck(): void {
    if (this.#frozen) {
      throw new FrozenError(`can't modify frozen ${this.constructor.name}: ${inspect(this)}`, {
        receiver: this,
      });
    }
  }

  /**
   * `Hash#[]=` (`vendor/ruby/v3.3.11/hash.c:2018` `rb_hash_aset`), whose
   * `rb_hash_modify` goes through `rb_hash_modify_check` (`hash.c:1623`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#[]=` (`vendor/ruby/v3.3.11/hash.c:2018`).
   */
  override set(key: K, value: V): this {
    this.modifyCheck();
    const stored = this.hashStlikeLookup(key);
    if (stored === key && !this.#identhash && isObjectKey(key) && !super.has(key)) {
      const h = rbHash(key);
      this.#stHash.set(key, h);
      const bucket = this.#eqlKeys.get(h);
      if (bucket) bucket.push(key);
      else this.#eqlKeys.set(h, [key]);
    }
    return super.set(stored, value);
  }

  /**
   * `Hash#key?` (`vendor/ruby/v3.3.11/hash.c:3671` `rb_hash_has_key`), a lookup by
   * the key's `hash` / `eql?`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#key?` (`vendor/ruby/v3.3.11/hash.c:3671`).
   */
  override has(key: K): boolean {
    return super.has(this.hashStlikeLookup(key));
  }

  /**
   * The stored key `eql?` to `key`, found by `hash_stlike_lookup`
   * (`vendor/ruby/v3.3.11/hash.c:2084`) through the `hash` / `eql?` pair
   * (`rb_any_hash`, `hash.c:241`; `rb_any_cmp`, `hash.c:126`). A JS
   * `Map` keys an object by identity, so two equal Arrays would otherwise be
   * two entries. A primitive's identity is already its `eql?`. An identity
   * hash's table type is `identhash` (`vendor/ruby/v3.3.11/hash.c:375`), whose
   * `rb_ident_cmp` is the `Map`'s own comparison. Ruby has one Integer for
   * every magnitude (`rb_int_equal`, `vendor/ruby/v3.3.11/numeric.c:4634`), so a
   * `bigint` that fits a `number` is looked up as that `number`.
   */
  private hashStlikeLookup(key: K): K {
    if (typeof key === "bigint" && Number.isSafeInteger(Number(key))) return Number(key) as K;
    if (this.#identhash || !isObjectKey(key)) return key;
    return this.#eqlKeys.get(rbHash(key))?.find((stored) => rbEql(stored, key)) ?? key;
  }

  /**
   * `Hash#clear` (`vendor/ruby/v3.3.11/hash.c:1988` `rb_hash_clear`), which also
   * begins with `rb_hash_modify_check`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#clear` (`vendor/ruby/v3.3.11/hash.c:1988`).
   */
  override clear(): void {
    this.modifyCheck();
    this.#eqlKeys.clear();
    super.clear();
  }

  override get(key: K): V | undefined {
    const stored = this.hashStlikeLookup(key);
    if (super.has(stored)) return super.get(stored);
    return this.default(key);
  }

  /**
   * `Hash#default` (`vendor/ruby/v3.3.11/hash.c:2238` `rb_hash_default`), both arms:
   * with no argument the stored default value — `nil` when a default_proc is
   * what is stored — and with a key the proc's result for that key.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#default` (`vendor/ruby/v3.3.11/hash.c:2238`).
   */
  default(...key: [] | [K]): V | undefined {
    if (this.#defaultProc) {
      if (key.length === 0) return undefined;
      return this.#defaultProc(this, key[0]);
    }
    return this.#default;
  }

  /**
   * The `JSON.stringify` protocol: a `Map`'s entries are not properties, so
   * without it a Hash stringifies as `{}` where `Hash#to_json`
   * (`vendor/ruby/v3.3.11/ext/json/generator/generator.c:430` `mHash_to_json`)
   * writes each pair under its key's `to_s`.
   *
   * @noRailsEquivalent PERMANENT
   */
  toJSON(): Record<string, V> {
    const result = Object.create(null) as Record<string, V>;
    for (const [key, value] of this) {
      result[String(key)] = value;
    }
    return result;
  }

  /**
   * `Hash#to_h` (`vendor/ruby/v3.3.11/hash.c:3018` `rb_hash_to_h`) with no block: the
   * receiver itself when it IS a Hash (`hash.c:3024`), otherwise a `hash_dup`
   * (`hash.c:3026`, `rb_hash_to_h_block`'s sibling arm) into a bare Hash that
   * carries the same entries and the same `default` / `default_proc`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#to_h` (`vendor/ruby/v3.3.11/hash.c:3018`).
   */
  toH(): Hash<K, V> {
    if (this.constructor === Hash) return this;
    return hashDup(this, Hash<K, V>);
  }

  /**
   * `Hash#default=` (`vendor/ruby/v3.3.11/hash.c:2265` `rb_hash_set_default`), whose
   * `SET_DEFAULT` clears `RHASH_PROC_DEFAULT`. A TS `set` accessor cannot
   * share a name with the `default()` reader, so it takes the conventions'
   * `setX()` spelling.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#default=` (`vendor/ruby/v3.3.11/hash.c:2265`).
   */
  setDefault(value: V | undefined): void {
    this.modifyCheck();
    this.#default = value;
    this.#defaultProc = undefined;
  }

  /**
   * `Hash#default_proc` (`vendor/ruby/v3.3.11/hash.c:2285` `rb_hash_default_proc`):
   * the proc only when one is what is stored.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#default_proc` (`vendor/ruby/v3.3.11/hash.c:2285`).
   */
  defaultProc(): DefaultProc<K, V> | undefined {
    return this.#defaultProc;
  }

  /**
   * `Hash#default_proc=` (`vendor/ruby/v3.3.11/hash.c:2308`
   * `rb_hash_set_default_proc`): `nil` goes through `SET_DEFAULT`, clearing
   * the proc; anything that is not a Proc is a `TypeError`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#default_proc=` (`vendor/ruby/v3.3.11/hash.c:2308`).
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
    this.#default = undefined;
    this.#defaultProc = proc;
  }

  /**
   * `Hash#delete` (`vendor/ruby/v3.3.11/hash.c:2441` `rb_hash_delete_m`): returns the
   * deleted value, the block's result for a key that was not there, `nil`
   * otherwise. `Map#delete` returns a boolean instead, and a TS override may
   * not narrow a `boolean` return, so the declared return is
   * `MapBoundaryReturn` — the dynamic return Ruby has here.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#delete` (`vendor/ruby/v3.3.11/hash.c:2441`).
   */
  override delete(key: K, block?: (key: K) => V): MapBoundaryReturn {
    this.modifyCheck();
    const val = this.deleteEntry(key);

    if (val !== UNDEF) return val;
    if (block) return block(key);
    return undefined;
  }

  /**
   * `rb_hash_delete_entry` (`vendor/ruby/v3.3.11/hash.c:2383`): the stored
   * value, or `Qundef` for a key that was not there.
   */
  private deleteEntry(key: K): V | undefined | typeof UNDEF {
    const stored = this.hashStlikeLookup(key);
    if (!super.has(stored)) return UNDEF;
    const val = super.get(stored);
    this.stDeleteEntry(stored);
    return val;
  }

  /**
   * Removes a stored entry from its bin by the hash the entry was stored
   * under, as `st_table_entry.hash` holds it (`vendor/ruby/v3.3.11/st.c:134`),
   * so a key whose `hash` has changed since is still found.
   */
  private stDeleteEntry(stored: K): void {
    super.delete(stored);
    if (!this.#identhash && isObjectKey(stored)) {
      const h = this.#stHash.get(stored)!;
      const bucket = this.#eqlKeys.get(h)!;
      bucket.splice(bucket.indexOf(stored), 1);
      if (bucket.length === 0) this.#eqlKeys.delete(h);
    }
  }

  /**
   * `Hash#shift` (`vendor/ruby/v3.3.11/hash.c:2492` `rb_hash_shift`): removes
   * the first entry and returns it as a `[key, value]` pair, `nil` for an
   * empty hash, after `rb_hash_modify_check`. The entry is removed directly,
   * with no lookup of its key, as `st_shift` does (`hash.c:2515`). MRI takes
   * it through `rb_hash_foreach` only while the hash is being iterated,
   * because `st_shift` may not run then; a `Map` drops its first entry
   * either way.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#shift` (`vendor/ruby/v3.3.11/hash.c:2492`).
   */
  shift(): [K, V] | undefined {
    this.modifyCheck();
    const first = super.entries().next();
    if (!first.done) {
      this.stDeleteEntry(first.value[0]);
      return first.value;
    }
    return undefined;
  }

  /**
   * `Hash#compare_by_identity` (`vendor/ruby/v3.3.11/hash.c:4427`
   * `rb_hash_compare_by_id`): keys are compared by identity from here on, and
   * the receiver is returned. The rehash into an `identhash` table keeps every
   * entry, since two stored keys were never `eql?`, so only the `eql?` index
   * goes. A JS string is a primitive with no identity apart from its value, so
   * two equal Strings stay one key where Ruby makes them two.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#compare_by_identity` (`vendor/ruby/v3.3.11/hash.c:4427`).
   */
  compareByIdentity(): this {
    if (this.isCompareByIdentity()) return this;

    this.modifyCheck();
    if (this.hashIteratingP()) {
      throw new RuntimeError("compare_by_identity during iteration");
    }

    this.#identhash = true;
    this.#eqlKeys.clear();

    return this;
  }

  /**
   * `rb_hash_foreach` (`vendor/ruby/v3.3.11/hash.c:1438`), the walk every
   * yielding Hash method goes through: it raises the receiver's `iter_lev`
   * for the length of the walk and lowers it in an `ensure`. A `for…of` that
   * ends, breaks or throws closes the iterator and lowers the level. One left
   * part-way keeps it raised, as a suspended `hash.each` Enumerator does.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `rb_hash_foreach` (`vendor/ruby/v3.3.11/hash.c:1438`).
   */
  override *[Symbol.iterator](): Generator<[K, V], undefined, unknown> {
    if (this.size === 0) return;
    if (this.#frozen) {
      yield* super[Symbol.iterator]();
    } else {
      this.#iterLev++;
      try {
        yield* super[Symbol.iterator]();
      } finally {
        this.#iterLev--;
      }
    }
  }

  /**
   * `Map#entries`, the pair walk under another name, so it goes through
   * `rb_hash_foreach` (`vendor/ruby/v3.3.11/hash.c:1438`) as `Hash#each_pair`
   * does (`hash.c:3149`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_pair` (`vendor/ruby/v3.3.11/hash.c:3149`).
   */
  override entries(): Generator<[K, V], undefined, unknown> {
    return this[Symbol.iterator]();
  }

  /**
   * `Map#forEach`, walked through `rb_hash_foreach`
   * (`vendor/ruby/v3.3.11/hash.c:1438`) as `Hash#each_pair` is (`hash.c:3149`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#each_pair` (`vendor/ruby/v3.3.11/hash.c:3149`).
   */
  override forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this) callbackfn.call(thisArg, value, key, this);
  }

  /**
   * `Hash#replace` (`vendor/ruby/v3.3.11/hash.c:2967` `rb_hash_replace`): the
   * receiver takes `hash2`'s `default` / `default_proc` (`COPY_DEFAULT`) and a
   * `hash_copy` of its table, which is not written through a subclass's `[]=`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#replace` (`vendor/ruby/v3.3.11/hash.c:2967`).
   */
  replace(hash2: Iterable<[K, V]> | Record<string, unknown>): this {
    this.modifyCheck();
    if (this === hash2) return this;
    if (this.hashIteratingP()) {
      throw new RuntimeError("can't replace hash during iteration");
    }
    const pairs = (Symbol.iterator in hash2 ? [...hash2] : Object.entries(hash2)) as [K, V][];
    if (hash2 instanceof Hash) {
      this.#default = hash2.#default;
      this.#defaultProc = hash2.#defaultProc;
    }
    Hash.prototype.clear.call(this);
    for (const [key, value] of pairs) Hash.prototype.set.call(this, key, value);
    return this;
  }

  /** `hash_iterating_p` (`vendor/ruby/v3.3.11/hash.c:1339`). */
  private hashIteratingP(): boolean {
    return this.#iterLev > 0;
  }

  /**
   * `Hash#compare_by_identity?` (`vendor/ruby/v3.3.11/hash.c:4474`
   * `rb_hash_compare_by_id_p`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#compare_by_identity?` (`vendor/ruby/v3.3.11/hash.c:4474`).
   */
  isCompareByIdentity(): boolean {
    return this.#identhash;
  }

  /**
   * `Hash#each` (`vendor/ruby/v3.3.11/hash.c:7219`), `rb_hash_each_pair`
   * (`hash.c:3149`): yields the key and the value to a block taking two
   * parameters (`each_pair_i_fast`) and one `[key, value]` pair otherwise
   * (`each_pair_i`), and returns the receiver.
   *
   * @noRailsEquivalent PERMANENT
   */
  each(block: ((pair: [K, V]) => void) | ((key: K, value: V) => void)): this {
    if (block.length > 1) {
      for (const [key, value] of super.entries()) (block as (key: K, value: V) => void)(key, value);
    } else {
      for (const pair of super.entries()) (block as (pair: [K, V]) => void)(pair);
    }
    return this;
  }

  /**
   * `Hash#keys` (`vendor/ruby/v3.3.11/hash.c:3584` `rb_hash_keys`): an Array of the
   * keys, where `Map#keys` is an iterator. A TS override may not narrow that
   * return, so it declares `MapBoundaryReturn`, the same Map boundary `delete`
   * meets.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#keys` (`vendor/ruby/v3.3.11/hash.c:3584`).
   */
  override keys(): MapBoundaryReturn {
    return [...super.keys()];
  }

  /**
   * `Hash#values` (`vendor/ruby/v3.3.11/hash.c:3628` `rb_hash_values`): an Array of the
   * values, where `Map#values` is an iterator.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Hash#values` (`vendor/ruby/v3.3.11/hash.c:3628`).
   */
  override values(): MapBoundaryReturn {
    return [...super.values()];
  }
}

function isObjectKey(key: unknown): key is object {
  return typeof key === "object" && key !== null;
}
