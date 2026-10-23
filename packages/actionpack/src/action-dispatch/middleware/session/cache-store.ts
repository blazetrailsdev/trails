import type { RackApp } from "@blazetrails/rack";
import type { CacheStore as CacheStoreLike } from "@blazetrails/activesupport";
import { SessionId, type PersistedRequest } from "@blazetrails/rack-session";
import { AbstractSecureStore } from "./abstract-store.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Session } from "../../../namespaces.js";
import type { Session as RequestSession } from "../../request/session.js";

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

  /** @noRailsEquivalent PERMANENT */
  override async prepareSession(req: PersistedRequest): Promise<RequestSession> {
    const session = super.prepareSession(req) as unknown as RequestSession;
    await session.prewarmBang();
    return session;
  }

  async findSession(
    _env: unknown,
    sid: SessionId | null | undefined,
  ): Promise<[SessionId, Record<string, unknown>]> {
    let session: Record<string, unknown> | undefined;
    if (sid) {
      session = await this.getSessionWithFallback(sid);
    }
    if (!sid || !session) {
      return [this.generateSid(), {}];
    }
    return [sid, session];
  }

  async writeSession(
    _env: unknown,
    sid: SessionId,
    session: Record<string, unknown> | null,
    options?: Record<string, unknown>,
  ): Promise<SessionId> {
    const key = this.cacheKey(sid.privateId);
    if (session) {
      const expireAfter = options?.["expireAfter"] as number | undefined;
      const expiresIn = expireAfter != null ? expireAfter * 1000 : undefined;
      await this.cache.write(key, session, { expiresIn });
    } else {
      await this.cache.delete(key);
    }
    return sid;
  }

  async deleteSession(
    _env: unknown,
    sid: SessionId,
    _options?: Record<string, unknown>,
  ): Promise<SessionId> {
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
}

rbModConstSet(Session, "CacheStore", CacheStore);
