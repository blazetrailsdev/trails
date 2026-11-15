import type { CacheOptions, CacheStore } from "./index.js";
import { Entry } from "./entry.js";
import { Store } from "./store.js";
import { registerStoreClass } from "./store-registry.js";

export class NullStore extends Store implements CacheStore {
  static supportsCacheVersioning(): boolean {
    return true;
  }

  override async clear(): Promise<void> {}

  override async cleanup(): Promise<void> {}

  override async increment(_name: string, _amount = 1, _options?: CacheOptions): Promise<null> {
    return null;
  }

  override async decrement(_name: string, _amount = 1, _options?: CacheOptions): Promise<null> {
    return null;
  }

  override async deleteMatched(_matcher: string | RegExp, _options?: CacheOptions): Promise<void> {}

  protected async readEntry(key: string, _options: Record<string, unknown>): Promise<Entry | null> {
    return this.deserializeEntry(await this.readSerializedEntry(key));
  }

  protected async readSerializedEntry(_key: string): Promise<unknown> {
    return null;
  }

  protected async writeEntry(
    key: string,
    entry: Entry,
    _options: Record<string, unknown>,
  ): Promise<boolean> {
    return await this.writeSerializedEntry(key, this.serializeEntry(entry));
  }

  protected async writeSerializedEntry(_key: string, _payload: unknown): Promise<boolean> {
    return true;
  }

  protected async deleteEntry(_key: string, _options: Record<string, unknown>): Promise<boolean> {
    return false;
  }
}

registerStoreClass(":null_store", NullStore);
