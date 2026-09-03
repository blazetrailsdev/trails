import type { CacheOptions, CacheStore } from "./index.js";
import { Entry } from "./entry.js";
import { Store } from "./store.js";
import { registerStoreClass } from "./store-registry.js";

export class NullStore extends Store implements CacheStore {
  static supportsCacheVersioning(): boolean {
    return true;
  }

  override clear(): void {}

  override cleanup(): void {}

  override increment(_name: string, _amount = 1, _options?: CacheOptions): null {
    return null;
  }

  override decrement(_name: string, _amount = 1, _options?: CacheOptions): null {
    return null;
  }

  override deleteMatched(_matcher: string | RegExp, _options?: CacheOptions): void {}

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
