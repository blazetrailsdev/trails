import { rbModConstSet } from "../include.js";

/**
 * concurrent-ruby's `Concurrent` module (`vendor/ruby/v3.3.11/class.c:1087` `rb_define_module`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const Concurrent = { name: "Concurrent" } as { readonly name: string; Map: typeof Map };

/**
 * concurrent-ruby's `Concurrent::Map`, on MRI the `NonConcurrentMapBackend`
 * over a `Hash` (`vendor/ruby/v3.3.11/hash.c:1782` `rb_hash_initialize`). A JS
 * body with no `await` cannot be interrupted, so the MRI backend's
 * `@write_lock` has nothing to exclude.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Map<K, V> {
  private readonly backend = new globalThis.Map<K, V>();

  /**
   * `initial_capacity:` is a sizing hint the MRI backend never reads
   * (`vendor/ruby/v3.3.11/hash.c:1782` `rb_hash_initialize` takes no capacity).
   *
   * @noRailsEquivalent PERMANENT
   */
  constructor(_options: { initialCapacity?: number } | null = null) {}

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
