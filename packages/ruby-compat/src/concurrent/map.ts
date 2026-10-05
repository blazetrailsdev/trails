import { Hash, rbBlockGivenP, type Block } from "../hash.js";
import { rbModConstSet } from "../include.js";

/**
 * concurrent-ruby's `Concurrent` module (`vendor/ruby/v3.3.11/class.c:1087` `rb_define_module`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const Concurrent = { name: "Concurrent" } as { readonly name: string; Map: typeof Map };

/**
 * concurrent-ruby's `Concurrent::Map` (not vendored): on MRI, `MriMapBackend`
 * over `NonConcurrentMapBackend` (`concurrent/collection/map/mri_map_backend.rb`,
 * `non_concurrent_map_backend.rb`), whose `@backend` is a `Hash`
 * (`vendor/ruby/v3.3.11/hash.c:1782` `rb_hash_initialize`). `MriMapBackend`
 * wraps each write in `@write_lock.synchronize { super }`; a JS body with no
 * `await` cannot be interrupted, so the members below are the
 * `NonConcurrentMapBackend` bodies with nothing for the lock to exclude.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Map<K, V> {
  private readonly backend = new Hash<K, V>();
  private readonly defaultProc?: (key: K) => V;

  /**
   * `initial_capacity:` is a sizing hint the MRI backend never reads
   * (`vendor/ruby/v3.3.11/hash.c:1782` `rb_hash_initialize` takes no capacity).
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(
    _options: { initialCapacity?: number } | null = null,
    defaultProc?: (map: Map<K, V>, key: K) => V,
  ) {
    if (defaultProc) this.defaultProc = (key) => defaultProc(this, key);
  }

  /**
   * `Concurrent::Map#[]`: the stored value (`vendor/ruby/v3.3.11/hash.c:2121`
   * `rb_hash_aref`), else the `default_proc` given to `new`, called with the
   * map and the missing key.
   *
   * @noRailsEquivalent PERMANENT
   */
  get(key: K): V | undefined {
    if (this.backend.has(key)) {
      return this.backend.get(key);
    } else if (this.defaultProc) {
      return this.defaultProc(key);
    } else {
      return undefined;
    }
  }

  /**
   * `Concurrent::Map#fetch_or_store`: the stored value when the key is present
   * (`vendor/ruby/v3.3.11/hash.c:2176` `rb_hash_fetch_m`), else the block's value, or
   * the default value, stored under it (`vendor/ruby/v3.3.11/hash.c:2941` `rb_hash_aset`).
   *
   * @noRailsEquivalent PERMANENT
   */
  fetchOrStore(key: K, defaultValue: V | Block<V>): V {
    if (this.backend.has(key)) {
      return this.backend.get(key)!;
    } else {
      const value = rbBlockGivenP(defaultValue)
        ? (defaultValue as unknown as (key: K) => V)(key)
        : defaultValue;
      this.backend.set(key, value);
      return value;
    }
  }

  /**
   * `NonConcurrentMapBackend#compute_if_absent`: the stored value when the key
   * is present (`vendor/ruby/v3.3.11/hash.c:2176` `rb_hash_fetch_m`), else the
   * block's value stored under it (`vendor/ruby/v3.3.11/hash.c:2941` `rb_hash_aset`).
   *
   * @noRailsEquivalent PERMANENT
   */
  computeIfAbsent(key: K, block: () => V): V {
    if (this.backend.has(key)) {
      return this.backend.get(key)!;
    } else {
      const value = block();
      this.backend.set(key, value);
      return value;
    }
  }

  /**
   * `NonConcurrentMapBackend#size` (`vendor/ruby/v3.3.11/hash.c:3002` `rb_hash_size`).
   *
   * @noRailsEquivalent PERMANENT
   */
  size(): number {
    return this.backend.size;
  }

  /**
   * `NonConcurrentMapBackend#clear` (`vendor/ruby/v3.3.11/hash.c:2868` `rb_hash_clear`).
   *
   * @noRailsEquivalent PERMANENT
   */
  clear(): this {
    this.backend.clear();
    return this;
  }
}

rbModConstSet(Concurrent, "Map", Map);
