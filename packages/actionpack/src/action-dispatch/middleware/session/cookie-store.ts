/**
 * ActionDispatch::Session::CookieStore
 *
 * Mirrors `vendor/rails/actionpack/lib/action_dispatch/middleware/session/cookie_store.rb`.
 *
 * Cookie-based session store. Sessions are serialized into the
 * `signed_or_encrypted` cookie jar and round-trip through the request's
 * cookie jar bridge — the secret-key plumbing lives in
 * `ActionDispatch::Cookies`, not here.
 */

import { AbstractSecureStore, SessionId as RackSessionId } from "./abstract-store.js";

/** @internal Minimum shape this store needs out of `ActionDispatch::Request`. */
export interface CookieStoreRequest {
  fetchHeader<T>(key: string, fallback: (key: string) => T): unknown | T;
  setHeader(key: string, value: unknown): void;
  cookieJar: { signedOrEncrypted: CookieJarLike };
}

/** @internal Minimum shape this store needs out of the cookie jar. */
export interface CookieJarLike {
  [key: string]: unknown;
}

/**
 * Rails: `class SessionId < DelegateClass(Rack::Session::SessionId)`.
 * Carries the raw cookie hash alongside the session id so the commit path
 * can hand the whole payload to the cookie jar.
 */
export class SessionId extends RackSessionId {
  readonly cookieValue: Record<string, unknown>;
  constructor(sessionId: RackSessionId, cookieValue: Record<string, unknown> = {}) {
    super(sessionId.publicId);
    this.cookieValue = cookieValue;
  }
}

/**
 * Rails: `DEFAULT_SAME_SITE = proc { |request| request.cookies_same_site_protection }`.
 * @internal
 */
export const DEFAULT_SAME_SITE = (request: { cookiesSameSiteProtection?: unknown }): unknown =>
  request.cookiesSameSiteProtection;

export interface CookieStoreSessionOptions {
  cookieOnly?: boolean;
  sameSite?: unknown;
  [key: string]: unknown;
}

/** Rails: `class CookieStore < AbstractSecureStore`. */
export class CookieStore extends AbstractSecureStore {
  constructor(app: unknown, options: CookieStoreSessionOptions = {}) {
    options.cookieOnly = true;
    if (!Object.prototype.hasOwnProperty.call(options, "sameSite")) {
      options.sameSite = DEFAULT_SAME_SITE;
    }
    super(app, options);
  }

  /** Rails: `delete_session(req, session_id, options)`. */
  deleteSession(
    req: any,
    _sessionId: unknown,
    options: { drop?: boolean } = {},
  ): RackSessionId | null {
    const newSid = options.drop ? null : (this.generateSid() as RackSessionId);
    req.setHeader(
      "action_dispatch.request.unsigned_session_cookie",
      newSid ? { session_id: newSid.publicId } : {},
    );
    return newSid;
  }

  /** Rails: `load_session(req)`. */
  loadSession(req: any): [RackSessionId, Record<string, unknown>] {
    return this.staleSessionCheckBang(() => {
      let data = this.unpackedCookieData(req);
      data = this.persistentSessionIdBang(data);
      return [new RackSessionId(String(data["session_id"])), data];
    });
  }

  /** @internal Rails: `extract_session_id(req)` (private). */
  extractSessionId(req: any): RackSessionId | null {
    return this.staleSessionCheckBang(() => {
      const sid = this.unpackedCookieData(req)["session_id"];
      return sid ? new RackSessionId(String(sid)) : null;
    });
  }

  /** @internal Rails: `unpacked_cookie_data(req)` (private). */
  unpackedCookieData(req: CookieStoreRequest): Record<string, unknown> {
    return req.fetchHeader("action_dispatch.request.unsigned_session_cookie", (k: string) => {
      const v = this.staleSessionCheckBang(() => {
        const data = this.getCookie(req);
        return (data as Record<string, unknown> | undefined) ?? {};
      });
      req.setHeader(k, v);
      return v;
    }) as Record<string, unknown>;
  }

  /** @internal Rails: `persistent_session_id!(data, sid = nil)` (private). */
  persistentSessionIdBang(
    data: Record<string, unknown> | null | undefined,
    sid: RackSessionId | null = null,
  ): Record<string, unknown> {
    const out = data ?? {};
    if (out["session_id"] == null) {
      out["session_id"] = sid ? sid.publicId : (this.generateSid() as RackSessionId).publicId;
    }
    return out;
  }

  /** @internal Rails: `write_session(req, sid, session_data, options)` (private). */
  writeSession(
    _req: CookieStoreRequest,
    sid: RackSessionId,
    sessionData: Record<string, unknown>,
    _options: Record<string, unknown> = {},
  ): SessionId {
    sessionData["session_id"] = sid.publicId;
    return new SessionId(sid, sessionData);
  }

  /** @internal Rails: `set_cookie(request, session_id, cookie)` (private). */
  override setCookie(request: any, _sessionId: unknown, cookie: unknown): void {
    this.cookieJar(request)[this.key] = cookie;
  }

  /** @internal Rails: `get_cookie(req)` (private). */
  getCookie(req: CookieStoreRequest): unknown {
    return this.cookieJar(req)[this.key];
  }

  /** @internal Rails: `cookie_jar(request)` (private). */
  cookieJar(request: CookieStoreRequest): CookieJarLike {
    return request.cookieJar.signedOrEncrypted;
  }

  /** @internal Inherited from `StaleSessionCheck`; declared for type narrowing. */
  declare staleSessionCheckBang: <T>(block: () => T) => T;
}
