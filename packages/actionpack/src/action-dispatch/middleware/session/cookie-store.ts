import type { RackApp } from "@blazetrails/rack";
import type { PersistedRequest } from "@blazetrails/rack-session";
import { SessionId as RackSessionId } from "@blazetrails/rack-session";
import { AbstractSecureStore } from "./abstract-store.js";

/** @internal */
export interface CookieStoreRequest {
  fetchHeader<T>(key: string, fallback: (key: string) => T): unknown | T;
  setHeader(key: string, value: unknown): void;
  cookieJar(): { signedOrEncrypted: CookieJarLike };
}

/** @internal */
export interface CookieJarLike {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export class SessionId {
  readonly #obj: RackSessionId;
  readonly #cookieValue: Record<string, unknown>;

  constructor(sessionId: RackSessionId, cookieValue: Record<string, unknown> = {}) {
    this.#obj = sessionId;
    this.#cookieValue = cookieValue;
  }

  get cookieValue(): Record<string, unknown> {
    return this.#cookieValue;
  }

  get publicId(): string {
    return this.#obj.publicId;
  }

  get privateId(): string {
    return this.#obj.privateId;
  }

  toString(): string {
    return this.#obj.toString();
  }

  isEmpty(): boolean {
    return this.#obj.isEmpty();
  }

  inspect(): string {
    return this.#obj.inspect();
  }
}

/** @internal */
export const DEFAULT_SAME_SITE = (request: {
  cookiesSameSiteProtection?: () => unknown;
}): unknown => request.cookiesSameSiteProtection?.();

export interface CookieStoreSessionOptions {
  cookieOnly?: boolean;
  sameSite?: unknown;
  [key: string]: unknown;
}

export class CookieStore extends AbstractSecureStore {
  constructor(app?: RackApp, options: CookieStoreSessionOptions = {}) {
    options.cookieOnly = true;
    if (!Object.prototype.hasOwnProperty.call(options, "sameSite")) {
      options.sameSite = DEFAULT_SAME_SITE;
    }
    super(app, options);
  }

  deleteSession(
    req: any,
    _sessionId: unknown,
    options: Record<string, unknown>,
  ): RackSessionId | null {
    const newSid = options["drop"] ? null : this.generateSid();
    req.setHeader(
      "action_dispatch.request.unsigned_session_cookie",
      newSid ? { session_id: newSid.publicId } : {},
    );
    return newSid;
  }

  loadSession(req: any): [RackSessionId, Record<string, unknown>] {
    return this.staleSessionCheckBang(() => {
      let data = this.unpackedCookieData(req);
      data = this.persistentSessionIdBang(data);
      return [new RackSessionId(String(data["session_id"])), data];
    });
  }

  /** @internal */
  extractSessionId(req: any): RackSessionId | null {
    return this.staleSessionCheckBang(() => {
      const sid = this.unpackedCookieData(req)["session_id"];
      return sid ? new RackSessionId(String(sid)) : null;
    });
  }

  /** @internal */
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

  /** @internal */
  persistentSessionIdBang(
    data: Record<string, unknown> | null | undefined,
    sid: RackSessionId | null = null,
  ): Record<string, unknown> {
    const out = data ?? {};
    if (out["session_id"] == null) {
      out["session_id"] = sid ? sid.publicId : this.generateSid().publicId;
    }
    return out;
  }

  /** @internal */
  writeSession(
    _req: CookieStoreRequest | PersistedRequest,
    sid: RackSessionId,
    sessionData: Record<string, unknown>,
    _options?: Record<string, unknown>,
  ): SessionId {
    sessionData["session_id"] = sid.publicId;
    return new SessionId(sid, sessionData);
  }

  /** @internal */
  override setCookie(request: any, _sessionId: unknown, cookie: unknown): void {
    this.cookieJar(request).set(this.key, cookie);
  }

  /** @internal */
  getCookie(req: CookieStoreRequest): unknown {
    return this.cookieJar(req).get(this.key);
  }

  /** @internal */
  cookieJar(request: CookieStoreRequest): CookieJarLike {
    return request.cookieJar().signedOrEncrypted;
  }

  /** @internal */
  declare staleSessionCheckBang: <T>(block: () => T) => T;
}
