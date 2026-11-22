import { Hash, rbBlockGivenP, type Block } from "../hash.js";
import { constSet } from "../include.js";
import type { CountDownLatch } from "./count-down-latch.js";
import type { CyclicBarrier } from "./cyclic-barrier.js";
import type { Event } from "./event.js";
import type { AtomicBoolean } from "./atomic-boolean.js";
import type { ReadWriteLock } from "./read-write-lock.js";
import type { AtomicFixnum } from "./atomic-fixnum.js";
import type { TimerTask } from "./timer-task.js";
import type { Semaphore } from "./semaphore.js";
import type {
  CachedThreadPool,
  RejectedExecutionError,
  ThreadPoolExecutor,
} from "../thread-pool-executor.js";

/**
 * concurrent-ruby's `Concurrent` module (`vendor/ruby/v3.3.11/class.c:1087` `rb_define_module`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const Concurrent = { name: "Concurrent" } as {
  readonly name: string;
  Map: typeof Map;
  CountDownLatch: typeof CountDownLatch;
  CyclicBarrier: typeof CyclicBarrier;
  Event: typeof Event;
  AtomicBoolean: typeof AtomicBoolean;
  ReadWriteLock: typeof ReadWriteLock;
  AtomicFixnum: typeof AtomicFixnum;
  TimerTask: typeof TimerTask;
  Semaphore: typeof Semaphore;
  ThreadPoolExecutor: typeof ThreadPoolExecutor;
  RejectedExecutionError: typeof RejectedExecutionError;
  globalIoExecutor: () => CachedThreadPool;
};

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
  private backend = new Hash<K, V>();
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
   * `Concurrent::Map#[]=` (concurrent-ruby, not vendored), over
   * `NonConcurrentMapBackend#[]=` (`vendor/ruby/v3.3.11/hash.c:2941` `rb_hash_aset`).
   *
   * @noRailsEquivalent PERMANENT
   */
  set(key: K, value: V): V {
    this.backend.set(key, value);
    return value;
  }

  /**
   * `Concurrent::Map#fetch_or_store`: the stored value when the key is present
   * (`vendor/ruby/v3.3.11/hash.c:2176` `rb_hash_fetch_m`), else the block's value, or
   * the default value, stored under it (`vendor/ruby/v3.3.11/hash.c:2941` `rb_hash_aset`).
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
   * `Concurrent::Map#keys` (concurrent-ruby, not vendored): each key `each_pair` yields, collected
   * (`vendor/ruby/v3.3.11/hash.c:3149` `rb_hash_each_pair` over the backend).
   *
   * @noRailsEquivalent PERMANENT
   */
  keys(): K[] {
    const arr: K[] = [];
    this.eachPair((k) => arr.push(k));
    return arr;
  }

  /**
   * `Concurrent::Map#values` (concurrent-ruby, not vendored): each value
   * `each_pair` yields, collected (`vendor/ruby/v3.3.11/hash.c:3149`
   * `rb_hash_each_pair` over the backend).
   *
   * @noRailsEquivalent PERMANENT
   */
  values(): V[] {
    const arr: V[] = [];
    this.eachPair((_k, v) => arr.push(v));
    return arr;
  }

  /**
   * `Concurrent::Map#each_value` (concurrent-ruby, not vendored): yields each
   * value `each_pair` does (`vendor/ruby/v3.3.11/hash.c:3149`
   * `rb_hash_each_pair` over the backend).
   *
   * @noRailsEquivalent PERMANENT
   */
  eachValue(block: (value: V) => unknown): this {
    return this.eachPair((_k, v) => block(v));
  }

  /**
   * `Concurrent::Map#each_pair` (concurrent-ruby, not vendored), over
   * `NonConcurrentMapBackend#each_pair`: it
   * walks a `dupped_backend`, so a write made by the block does not reach the
   * walk (`vendor/ruby/v3.3.11/hash.c:3149` `rb_hash_each_pair`).
   *
   * @noRailsEquivalent PERMANENT
   */
  eachPair(block: (key: K, value: V) => unknown): this {
    for (const [k, v] of [...this.backend]) block(k, v);
    return this;
  }

  /**
   * `NonConcurrentMapBackend#initialize_copy`: the copy gets its own backend
   * (`vendor/ruby/v3.3.11/hash.c:2967` `rb_hash_replace`).
   *
   * @noRailsEquivalent PERMANENT
   */
  initializeCopy(other: Map<K, V>): this {
    this.backend = new Hash<K, V>();
    for (const [k, v] of other.backend) this.backend.set(k, v);
    return this;
  }

  /**
   * `NonConcurrentMapBackend#compute_if_present`: the block's value, given the
   * stored one, replaces it; a `nil` result deletes the key, and an absent key
   * is left alone (`vendor/ruby/v3.3.11/hash.c:2176` `rb_hash_fetch_m`).
   *
   * @noRailsEquivalent PERMANENT
   */
  computeIfPresent(key: K, block: (storedValue: V) => V | null): V | null {
    if (!this.backend.has(key)) return null;
    const newValue = block(this.backend.get(key)!);
    if (newValue == null) {
      this.backend.delete(key);
      return null;
    }
    this.backend.set(key, newValue);
    return newValue;
  }

  /**
   * `NonConcurrentMapBackend#delete` (`vendor/ruby/v3.3.11/hash.c:2441` `rb_hash_delete_m`).
   *
   * @noRailsEquivalent PERMANENT
   */
  delete(key: K): V | null {
    if (!this.backend.has(key)) return null;
    const value = this.backend.get(key)!;
    this.backend.delete(key);
    return value;
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

constSet(Concurrent, "Map", Map);
