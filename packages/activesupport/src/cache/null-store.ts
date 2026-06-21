import type { CacheOptions, CacheStore } from "./index.js";
import { Entry } from "./entry.js";
import { Store } from "./store.js";

// Mirrors Rails `Cache::NullStore` (null_store.rb): a store that persists
// nothing. read/write/delete/exist?/fetch/read_multi/write_multi/delete_multi
// are inherited from the instrumented Store base (so they instrument like Rails);
// only clear/cleanup/increment/decrement/delete_matched and the private entry
// hooks are overridden.
export class NullStore extends Store implements CacheStore {
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

  protected readEntry(_key: string, _options: Record<string, unknown>): Entry | null {
    return null;
  }
  protected writeEntry(_key: string, _entry: Entry, _options: Record<string, unknown>): boolean {
    return true;
  }
  protected deleteEntry(_key: string, _options: Record<string, unknown>): boolean {
    return false;
  }
}
