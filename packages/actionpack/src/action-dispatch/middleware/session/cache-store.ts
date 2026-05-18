/**
 * ActionDispatch::Session::CacheStore
 *
 * Mirrors `vendor/rails/actionpack/lib/action_dispatch/middleware/session/cache_store.rb`.
 *
 * A session store that uses an `ActiveSupport::Cache::Store` to store the
 * sessions. Most useful when sessions hold non-critical data and need not
 * live for extended periods of time.
 *
 * Options:
 * - `cache`        — the cache to use. If not specified, the framework
 *   cache (Rails: `Rails.cache`) is used.
 * - `expireAfter`  — the length of time (in seconds) a session is stored
 *   before automatically expiring. Rails defaults this to the cache's
 *   `expires_in`; the bundled `@blazetrails/activesupport` stores don't
 *   yet expose their constructor options, so in practice this default
 *   is dormant until those stores grow an `options` accessor.
 */

import type { CacheStore as CacheStoreLike } from "@blazetrails/activesupport";
import { AbstractSecureStore, SessionId } from "./abstract-store.js";

export interface CacheStoreSessionOptions {
  cache?: CacheStoreLike;
  expireAfter?: number;
  [key: string]: unknown;
}

/** Rails: `class CacheStore < AbstractSecureStore`. */
export class CacheStore extends AbstractSecureStore {
  /** @internal */
  private readonly cache: CacheStoreLike;
  /** @internal */
  readonly options: CacheStoreSessionOptions;

  constructor(app: unknown, options: CacheStoreSessionOptions = {}) {
    super(app, options);
    const cache = options.cache;
    if (!cache) {
      throw new Error(
        "ActionDispatch::Session::CacheStore requires a `cache` option until Rails.cache is wired.",
      );
    }
    this.cache = cache;
    // Rails: `options[:expire_after] ||= @cache.options[:expires_in]`. The
    // caller's options hash is mutated in place to match Rails semantics.
    // Rails stores `expires_in` in seconds; @blazetrails/activesupport uses
    // milliseconds, so convert when bridging.
    const cacheExpiresInMs = (cache as { options?: { expiresIn?: number } }).options?.expiresIn;
    if (options.expireAfter == null && cacheExpiresInMs != null) {
      options.expireAfter = Math.floor(cacheExpiresInMs / 1000);
    }
    this.options = options;
  }

  /** Get a session from the cache. */
  findSession(
    _env: unknown,
    sid: SessionId | null | undefined,
  ): [SessionId, Record<string, unknown>] {
    let session: Record<string, unknown> | undefined;
    if (sid) {
      session = this.getSessionWithFallback(sid);
    }
    if (!sid || !session) {
      return [this.generateSid(), {}];
    }
    return [sid, session];
  }

  /** Set a session in the cache. */
  writeSession(
    _env: unknown,
    sid: SessionId,
    session: Record<string, unknown> | null,
    options: { expireAfter?: number } = {},
  ): SessionId {
    const key = this.cacheKey(sid.privateId);
    if (session) {
      // Rails: `expires_in: options[:expire_after]` (seconds). The activesupport
      // CacheStore takes milliseconds, so convert at the boundary.
      const expiresIn = options.expireAfter != null ? options.expireAfter * 1000 : undefined;
      this.cache.write(key, session, { expiresIn });
    } else {
      this.cache.delete(key);
    }
    return sid;
  }

  /** Remove a session from the cache. */
  deleteSession(_env: unknown, sid: SessionId, _options: Record<string, unknown> = {}): SessionId {
    this.cache.delete(this.cacheKey(sid.privateId));
    this.cache.delete(this.cacheKey(sid.publicId));
    return this.generateSid();
  }

  /**
   * Turn the session id into a cache key.
   * @internal
   */
  private cacheKey(id: string): string {
    return `_session_id:${id}`;
  }

  /** @internal */
  private getSessionWithFallback(sid: SessionId): Record<string, unknown> | undefined {
    const fromPrivate = this.cache.read(this.cacheKey(sid.privateId));
    if (fromPrivate) return fromPrivate as Record<string, unknown>;
    const fromPublic = this.cache.read(this.cacheKey(sid.publicId));
    return fromPublic ? (fromPublic as Record<string, unknown>) : undefined;
  }

  /** Narrowed return type. Rails: `AbstractSecureStore#generate_sid`. */
  override generateSid(): SessionId {
    return super.generateSid() as SessionId;
  }
}
