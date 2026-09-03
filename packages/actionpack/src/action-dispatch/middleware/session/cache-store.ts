import type { RackApp } from "@blazetrails/rack";
import type { CacheStore as CacheStoreLike } from "@blazetrails/activesupport";
import { SessionId } from "@blazetrails/rack-session";
import { AbstractSecureStore } from "./abstract-store.js";

export interface CacheStoreSessionOptions {
  cache?: CacheStoreLike;
  expireAfter?: number;
  [key: string]: unknown;
}

export class CacheStore extends AbstractSecureStore {
  /** @internal */
  private readonly cache: CacheStoreLike;
  /** @internal */
  readonly options: CacheStoreSessionOptions;

  constructor(app?: RackApp, options: CacheStoreSessionOptions = {}) {
    super(app, options);
    const cache = options.cache;
    if (!cache) {
      throw new Error(
        "ActionDispatch::Session::CacheStore requires a `cache` option until Rails.cache is wired.",
      );
    }
    this.cache = cache;
    const cacheExpiresInMs = (cache as { options?: { expiresIn?: number } }).options?.expiresIn;
    if (options.expireAfter == null && cacheExpiresInMs != null) {
      options.expireAfter = Math.floor(cacheExpiresInMs / 1000);
    }
    this.options = options;
  }

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

  writeSession(
    _env: unknown,
    sid: SessionId,
    session: Record<string, unknown> | null,
    options?: Record<string, unknown>,
  ): SessionId {
    const key = this.cacheKey(sid.privateId);
    if (session) {
      const expireAfter = options?.["expireAfter"] as number | undefined;
      const expiresIn = expireAfter != null ? expireAfter * 1000 : undefined;
      this.cache.write(key, session, { expiresIn });
    } else {
      this.cache.delete(key);
    }
    return sid;
  }

  deleteSession(_env: unknown, sid: SessionId, _options?: Record<string, unknown>): SessionId {
    this.cache.delete(this.cacheKey(sid.privateId));
    this.cache.delete(this.cacheKey(sid.publicId));
    return this.generateSid();
  }

  /** @internal */
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

  override generateSid(): SessionId {
    return super.generateSid();
  }
}
