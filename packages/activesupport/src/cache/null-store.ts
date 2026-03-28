import type { CacheOptions, CacheStore } from "./index.js";

export class NullStore implements CacheStore {
  read(_key: string, _options?: CacheOptions): null {
    return null;
  }

  write(_key: string, _value: unknown, _options?: CacheOptions): boolean {
    return true;
  }

  delete(_key: string): boolean {
    return false;
  }

  exist(_key: string): boolean {
    return false;
  }

  fetch(
    key: string,
    optionsOrFallback?: CacheOptions | (() => unknown),
    _maybeFallback?: () => unknown,
  ): unknown {
    return null;
  }

  clear(): void {}

  cleanup(): void {}

  readMulti(..._keys: string[]): Record<string, unknown> {
    return {};
  }

  writeMulti(_hash: Record<string, unknown>, _options?: CacheOptions): void {}

  deleteMulti(...keys: string[]): number {
    return 0;
  }

  deleteMatched(_pattern: string | RegExp): void {}

  increment(_key: string, _amount = 1, _options?: CacheOptions): null {
    return null;
  }

  decrement(_key: string, _amount = 1, _options?: CacheOptions): null {
    return null;
  }
}
