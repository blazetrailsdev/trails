import type { CacheOptions, CacheStore } from "./index.js";
import { Entry } from "./entry.js";
import { Store, type WriteOptions } from "./store.js";

export class NullStore extends Store implements CacheStore {
  // Abstract entry hooks of the instrumented Store base; a NullStore never persists.
  protected readEntry(_key: string, _options: Record<string, unknown>): Entry | null {
    return null;
  }
  protected writeEntry(_key: string, _entry: Entry, _options: Record<string, unknown>): boolean {
    return true;
  }
  protected deleteEntry(_key: string, _options: Record<string, unknown>): boolean {
    return false;
  }

  override read(key: string, options?: CacheOptions): null {
    const rk = this.resolveKey(key, options);
    return this.instrument("read", rk, options, (payload) => {
      payload.hit = false;
      return null;
    });
  }

  override write(key: string, _value: unknown, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.instrument("write", rk, options, () => true);
  }

  override delete(key: string, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.instrument("delete", rk, options, () => false);
  }

  override exist(key: string, options?: CacheOptions): boolean {
    const rk = this.resolveKey(key, options);
    return this.instrument("exist?", rk, undefined, () => false);
  }

  override fetch(
    key: string,
    optionsOrFallback?: CacheOptions | ((key: string, opts: WriteOptions) => unknown),
    maybeFallback?: (key: string, opts: WriteOptions) => unknown,
  ): unknown {
    let options: CacheOptions | undefined;
    let fallback: ((key: string, opts: WriteOptions) => unknown) | undefined;
    if (typeof optionsOrFallback === "function") {
      fallback = optionsOrFallback;
    } else {
      options = optionsOrFallback;
      fallback = maybeFallback;
    }
    const rk = this.resolveKey(key, options);
    this.instrument("read", rk, options, (payload) => {
      payload.hit = false;
      return null;
    });
    return fallback ? (fallback as () => unknown)() : null;
  }

  override clear(): void {}

  override cleanup(): void {}

  override readMulti(..._keys: [...string[], CacheOptions] | string[]): Record<string, unknown> {
    return {};
  }

  override writeMulti(_hash: Record<string, unknown>): Record<string, unknown> {
    return {};
  }

  override deleteMulti(_names: string[], _options?: CacheOptions): number {
    return 0;
  }

  override deleteMatched(_pattern: string | RegExp): void {}

  override increment(key: string, amount = 1, options?: CacheOptions): null {
    const rk = this.resolveKey(key, options);
    return this.instrument("increment", rk, { amount }, () => null);
  }

  override decrement(key: string, amount = 1, options?: CacheOptions): null {
    const rk = this.resolveKey(key, options);
    return this.instrument("decrement", rk, { amount }, () => null);
  }

  private resolveKey(key: string, options?: CacheOptions): string {
    return this.normalizeKey(String(key), options);
  }
}
