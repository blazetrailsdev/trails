import { hashAref, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { RackApp } from "@blazetrails/rack";
import type { CacheStore as CacheStoreLike } from "@blazetrails/activesupport";
import { SessionId } from "@blazetrails/rack-session";
import { AbstractSecureStore } from "./abstract-store.js";
import { Session } from "../../../namespaces.js";

export interface CacheStoreSessionOptions {
  cache?: CacheStoreLike;
  expireAfter?: number;
  [key: string]: unknown;
}

interface CacheStoreRequest {
  getHeader(name: string): unknown;
  setHeader(name: string, value: unknown): unknown;
}

export class CacheStore extends AbstractSecureStore {
  /** @internal */
  static readonly LOADED_SESSION_ID = "action_dispatch.session.cache_store.loaded_session_id";

  /** @internal */
  private readonly cache: CacheStoreLike;
  /** @internal */
  readonly options: CacheStoreSessionOptions;

  constructor(app?: RackApp, options: CacheStoreSessionOptions = {}) {
    super(app, options);
    const cache = options.cache;
    if (!cache) {
      throw new Error(
        "ActionDispatch::Session::CacheStore requires a `cache` option until Trails.cache is wired.",
      );
    }
    this.cache = cache;
    const cacheExpiresInMs = (cache as { options?: { expiresIn?: number } }).options?.expiresIn;
    if (options.expireAfter == null && cacheExpiresInMs != null) {
      options.expireAfter = Math.floor(cacheExpiresInMs / 1000);
    }
    this.options = options;
  }

  async findSession(
    req: CacheStoreRequest,
    sid: SessionId | null | undefined,
  ): Promise<[SessionId, Record<string, unknown>]> {
    let session: Record<string, unknown> | undefined;
    if (sid && (session = await this.getSessionWithFallback(sid))) {
      req.setHeader(CacheStore.LOADED_SESSION_ID, sid.privateId);
    } else {
      [sid, session] = [this.generateSid(), {}];
    }
    return [sid, session];
  }

  async writeSession(
    req: CacheStoreRequest,
    sid: SessionId,
    session: Record<string, unknown> | null,
    options?: object,
  ): Promise<SessionId | false> {
    const key = this.cacheKey(sid.privateId);
    if (session) {
      if (await this.isDestroyedSinceLoaded(req, sid)) return false;
      const expireAfter = (options == null ? undefined : hashAref(options, "expireAfter")) as
        | number
        | null
        | undefined;
      const expiresIn = expireAfter != null ? expireAfter * 1000 : undefined;
      await this.cache.write(key, session, { expiresIn });
    } else {
      await this.cache.delete(key);
    }
    return sid;
  }

  async deleteSession(_env: unknown, sid: SessionId, _options?: object): Promise<SessionId> {
    await this.cache.delete(this.cacheKey(sid.privateId));
    await this.cache.delete(this.cacheKey(sid.publicId));
    return this.generateSid();
  }

  /** @internal */
  private cacheKey(id: string): string {
    return `_session_id:${id}`;
  }

  /** @internal */
  private async getSessionWithFallback(
    sid: SessionId,
  ): Promise<Record<string, unknown> | undefined> {
    const fromPrivate = await this.cache.read(this.cacheKey(sid.privateId));
    if (fromPrivate) return fromPrivate as Record<string, unknown>;
    const fromPublic = await this.cache.read(this.cacheKey(sid.publicId));
    return fromPublic ? (fromPublic as Record<string, unknown>) : undefined;
  }

  /** @internal */
  private async isDestroyedSinceLoaded(req: CacheStoreRequest, sid: SessionId): Promise<boolean> {
    return (
      req.getHeader(CacheStore.LOADED_SESSION_ID) === sid.privateId &&
      !(await this.isExistInBackend(this.cacheKey(sid.privateId))) &&
      !(await this.isExistInBackend(this.cacheKey(sid.publicId)))
    );
  }

  /** @internal */
  private async isExistInBackend(key: string): Promise<boolean> {
    const cache = this.cache as CacheStoreLike & {
      withLocalCache<T>(block: () => Promise<T>): Promise<T>;
    };
    if (rbObjRespondTo(cache, "withLocalCache")) {
      return await cache.withLocalCache(() => cache.isExist(key));
    } else {
      return await cache.isExist(key);
    }
  }
}

Session.CacheStore = CacheStore;
