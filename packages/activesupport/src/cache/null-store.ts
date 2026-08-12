import type { CacheOptions, CacheStore } from "./index.js";
import { Entry } from "./entry.js";
import { Store } from "./store.js";
import { registerStoreClass } from "./store-registry.js";

// Mirrors Rails `Cache::NullStore` (null_store.rb): a store that persists
// nothing. read/write/delete/exist?/fetch/read_multi/write_multi/delete_multi
// are inherited from the instrumented Store base (so they instrument like Rails);
// only clear/cleanup/increment/decrement/delete_matched and the private entry
// hooks are overridden.
export class NullStore extends Store implements CacheStore {
  /** Advertise cache versioning support (null_store.rb:17-20). */
  static supportsCacheVersioning(): boolean {
    return true;
  }

  override clear(): void {}

  override cleanup(): void {}

  // Rails NullStore overrides increment/decrement as plain nil-returning no-ops
  // with no `instrument` call (null_store.rb:26-31).
  override increment(_name: string, _amount = 1, _options?: CacheOptions): null {
    return null;
  }

  override decrement(_name: string, _amount = 1, _options?: CacheOptions): null {
    return null;
  }

  override deleteMatched(_pattern: string | RegExp): void {}

  // Mirrors Rails NullStore#read_entry (null_store.rb:41-43): the serialized
  // read always misses, so the deserialization always yields nil.
  protected readEntry(key: string, _options: Record<string, unknown>): Entry | null {
    return this.deserializeEntry(this.readSerializedEntry(key));
  }

  protected readSerializedEntry(_key: string): unknown {
    return null;
  }

  protected writeEntry(key: string, entry: Entry, _options: Record<string, unknown>): boolean {
    return this.writeSerializedEntry(key, this.serializeEntry(entry));
  }

  protected writeSerializedEntry(_key: string, _payload: unknown): boolean {
    return true;
  }

  protected deleteEntry(_key: string, _options: Record<string, unknown>): boolean {
    return false;
  }
}

registerStoreClass(":null_store", NullStore);
