/**
 * ActionController::RateLimiting
 *
 * Applies a rate limit to controller actions, refusing requests that
 * exceed the limit with 429 Too Many Requests.
 * @see https://api.rubyonrails.org/classes/ActionController/RateLimiting.html
 */

export interface RateLimitOptions {
  to: number;
  within: number;
  by?: (request: unknown) => string;
  with?: (controller: unknown) => void;
  store?: RateLimitStore;
  name?: string;
  only?: string | string[];
  except?: string | string[];
}

export interface RateLimitStore {
  increment(key: string, expires: number): Promise<number> | number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private _entries = new Map<string, { count: number; expiresAt: number }>();

  increment(key: string, expires: number): number {
    this._cleanup();
    const now = Date.now();
    const entry = this._entries.get(key);
    if (entry && entry.expiresAt > now) {
      entry.count += 1;
      return entry.count;
    }
    this._entries.set(key, { count: 1, expiresAt: now + expires * 1000 });
    return 1;
  }

  private _cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this._entries) {
      if (entry.expiresAt <= now) this._entries.delete(key);
    }
  }
}

export function isRateLimited(count: number, limit: number): boolean {
  return count > limit;
}
