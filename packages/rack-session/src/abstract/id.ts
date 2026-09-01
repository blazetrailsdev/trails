import { getCrypto } from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { RACK_SESSION, RACK_SESSION_OPTIONS, Request, ResponseRaw } from "@blazetrails/rack";

export class SessionId {
  static ID_VERSION = 2;

  publicId: string;

  constructor(publicId: string) {
    this.publicId = publicId;
  }

  get privateId(): string {
    return `${(this.constructor as typeof SessionId).ID_VERSION}::${this.hashSid(this.publicId)}`;
  }

  get cookieValue(): string {
    return this.publicId;
  }

  toString(): string {
    return this.publicId;
  }

  isEmpty(): boolean {
    return false;
  }

  inspect(): string {
    return JSON.stringify(this.publicId);
  }

  /** @internal */
  hashSid(sid: string): string {
    return getCrypto().createHash("sha256").update(sid).digest("hex");
  }
}

export const DEFAULT_OPTIONS: Readonly<Record<string, unknown>> = Object.freeze({
  key: RACK_SESSION,
  path: "/",
  domain: null,
  expireAfter: null,
  secure: false,
  httponly: true,
  partitioned: false,
  defer: false,
  renew: false,
  sidbits: 128,
  cookieOnly: true,
  secureRandom: true,
});

/** @noRailsEquivalent PERMANENT */
export interface SessionOptions {
  get(key: string): unknown;
  valuesAt(...keys: string[]): unknown[];
  toHash(): Record<string, unknown>;
}

/** @noRailsEquivalent PERMANENT */
export interface PersistedSession {
  id(): unknown;
  options(): SessionOptions;
  isLoaded(): boolean;
  isEmpty(): boolean;
  loadBang(): void;
  toHash(): Record<string, unknown>;
  mergeBang(other: unknown): void;
}

/** @noRailsEquivalent PERMANENT */
export interface SessionClass {
  new (store: Persisted, req: PersistedRequest): PersistedSession;
}

/** @noRailsEquivalent PERMANENT */
export interface PersistedRequest {
  env: RackEnv;
  cookies: Record<string, unknown>;
  params: Record<string, unknown>;
  getHeader(key: string): PersistedSession;
  setHeader(key: string, value: unknown): void;
  ssl?: unknown;
}

/** @noRailsEquivalent PERMANENT */
function isTruthy(value: unknown): boolean {
  return value != null && value !== false;
}

export class Persisted {
  key = "_session_id";
  defaultOptions: Record<string, unknown> & {
    sidbits?: number;
    secureRandom?: unknown;
  } = {};
  sidSecure: unknown;
  sameSite: unknown;

  protected app: RackApp | undefined;
  protected assumeSsl: unknown;
  protected cookieOnly: unknown;
  protected sidbits = 128;
  protected sidLength = 32;

  constructor(app?: RackApp, options: Record<string, unknown> = {}) {
    this.app = app;
    this.defaultOptions = {
      ...(this.constructor as typeof Persisted).DEFAULT_OPTIONS,
      ...options,
    };
    this.key = this.defaultOptions["key"] as string;
    delete this.defaultOptions["key"];
    this.assumeSsl = this.defaultOptions["assumeSsl"];
    delete this.defaultOptions["assumeSsl"];
    this.cookieOnly = this.defaultOptions["cookieOnly"];
    delete this.defaultOptions["cookieOnly"];
    this.sameSite = this.defaultOptions["sameSite"];
    delete this.defaultOptions["sameSite"];
    this.initializeSid();
  }

  static DEFAULT_OPTIONS: Readonly<Record<string, unknown>> = DEFAULT_OPTIONS;

  call(env: RackEnv): Promise<RackResponse> {
    return this.context(env);
  }

  async context(env: RackEnv, app: RackApp | undefined = this.app): Promise<RackResponse> {
    const req = this.makeRequest(env);
    this.prepareSession(req);
    const [status, headers, body] = await app!(req.env);
    const res = new ResponseRaw(status, headers);
    this.commitSession(req, res);
    return [status, headers, body];
  }

  /** @internal */
  makeRequest(env: RackEnv): PersistedRequest {
    return new Request(env as Record<string, unknown>) as unknown as PersistedRequest;
  }

  /** @internal */
  initializeSid(): void {
    this.sidbits = this.defaultOptions["sidbits"] as number;
    this.sidSecure = this.defaultOptions["secureRandom"];
    this.sidLength = this.sidbits / 4;
  }

  generateSid(secure: unknown = this.sidSecure): unknown {
    void secure;
    return getCrypto()
      .randomBytes(Math.ceil(this.sidLength / 2))
      .toString("hex")
      .slice(0, this.sidLength);
  }

  /** @internal */
  prepareSession(req: PersistedRequest): void {
    const sessionWas = req.getHeader(RACK_SESSION);
    const session = new (this.sessionClass())(this, req);
    req.setHeader(RACK_SESSION, session);
    req.setHeader(RACK_SESSION_OPTIONS, { ...this.defaultOptions });
    if (isTruthy(sessionWas)) session.mergeBang(sessionWas);
  }

  /** @internal */
  loadSession(req: PersistedRequest): [unknown, Record<string, unknown>] {
    const currentSid = this.currentSessionId(req);
    const [sid, session] = this.findSession(req, currentSid);
    return [sid, session ?? {}];
  }

  /** @internal */
  extractSessionId(request: PersistedRequest): unknown {
    let sid = request.cookies[this.key];
    if (!isTruthy(sid) && !isTruthy(this.cookieOnly)) sid = request.params[this.key];
    return sid;
  }

  /** @internal */
  currentSessionId(req: PersistedRequest): unknown {
    return req.getHeader(RACK_SESSION).id();
  }

  /** @internal */
  sessionExists(req: PersistedRequest): boolean {
    const value = this.currentSessionId(req);
    return isTruthy(value) && String(value) !== "";
  }

  /** @internal */
  isCommitSession(
    req: PersistedRequest,
    session: PersistedSession,
    options: SessionOptions,
  ): boolean {
    if (isTruthy(options.get("skip"))) return false;
    const hasSession =
      this.isLoadedSession(session) || this.isForcedSessionUpdate(session, options);
    return hasSession && this.isSecurityMatches(req, options);
  }

  /** @internal */
  isLoadedSession(session: PersistedSession): boolean {
    return !(session instanceof this.sessionClass()) || session.isLoaded();
  }

  /** @internal */
  isForcedSessionUpdate(session: PersistedSession, options: SessionOptions): boolean {
    return this.isForceOptions(options) && isTruthy(session) && !session.isEmpty();
  }

  /** @internal */
  isForceOptions(options: SessionOptions): boolean {
    return options.valuesAt("maxAge", "renew", "drop", "defer", "expireAfter").some(isTruthy);
  }

  /** @internal */
  isSecurityMatches(request: PersistedRequest, options: SessionOptions): boolean {
    if (!isTruthy(options.get("secure"))) return true;
    return isTruthy(request.ssl) || this.assumeSsl === true;
  }

  /** @missingRailsCall call — PERMANENT */
  commitSession(req: PersistedRequest, res: ResponseRaw): unknown {
    const session = req.getHeader(RACK_SESSION);
    const options: SessionOptions = session.options();

    let sessionId: unknown;
    if (isTruthy(options.get("drop")) || isTruthy(options.get("renew"))) {
      const currentId = session.id();
      sessionId = this.deleteSession(
        req,
        isTruthy(currentId) ? currentId : this.generateSid(),
        options,
      );
      if (!isTruthy(sessionId)) return;
    }

    if (!this.isCommitSession(req, session, options)) return;

    if (!this.isLoadedSession(session)) session.loadBang();
    if (!isTruthy(sessionId)) sessionId = session.id();
    const sessionData = session.toHash();
    for (const k of Object.keys(sessionData)) {
      if (sessionData[k] == null) delete sessionData[k];
    }

    const data = this.writeSession(req, sessionId, sessionData, options);
    if (!isTruthy(data)) {
      console.warn(`Warning! ${this.constructor.name} failed to save session. Content dropped.`);
    } else if (isTruthy(options.get("defer")) && !isTruthy(options.get("renew"))) {
      void sessionId;
    } else {
      const cookie: Record<string, unknown> = {};
      cookie["value"] = this.cookieValue(data);
      const expireAfter = options.get("expireAfter");
      if (isTruthy(expireAfter)) {
        // boundary: `Time.now + options[:expire_after]` is an ABSOLUTE expiry
        cookie["expires"] = new Date(Date.now() + (expireAfter as number) * 1000);
      }
      const maxAge = options.get("maxAge");
      if (isTruthy(maxAge)) {
        // boundary: as above (`abstract/id.rb:404`).
        cookie["expires"] = new Date(Date.now() + (maxAge as number) * 1000);
      }

      cookie["sameSite"] =
        typeof this.sameSite === "function"
          ? (this.sameSite as (req: unknown, res: unknown) => unknown)(req, res)
          : this.sameSite;
      this.setCookie(req, res, { ...cookie, ...options.toHash() });
    }
  }

  /** @internal */
  cookieValue(data: unknown): unknown {
    return data;
  }

  /** @internal */
  setCookie(
    request: PersistedRequest,
    response: ResponseRaw,
    cookie: Record<string, unknown>,
  ): void {
    if (request.cookies[this.key] !== cookie["value"] || isTruthy(cookie["expires"])) {
      response.setCookie(this.key, cookie);
    }
  }

  /** @internal */
  sessionClass(): SessionClass {
    // @nie disposition=blocked-on-session-hash-port rails=rack-session/lib/rack/session/abstract/id.rb:431 cluster=rack-session
    throw new Error("Rack::Session::Abstract::SessionHash is not ported.");
  }

  findSession(_req: PersistedRequest, _sid: unknown): [unknown, Record<string, unknown> | null] {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:440 cluster=rack-session
    throw new Error("#find_session not implemented.");
  }

  writeSession(
    _req: PersistedRequest,
    _sid: unknown,
    _session: Record<string, unknown>,
    _options: SessionOptions,
  ): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:448 cluster=rack-session
    throw new Error("#write_session not implemented.");
  }

  deleteSession(_req: PersistedRequest, _sid: unknown, _options: SessionOptions): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:455 cluster=rack-session
    throw new Error("#delete_session not implemented");
  }
}

export class PersistedSecure extends Persisted {
  override generateSid(secure?: unknown): SessionId {
    return new SessionId(String(super.generateSid(secure)));
  }

  override extractSessionId(request: PersistedRequest): SessionId | null | false {
    const publicId = super.extractSessionId(request);
    if (!isTruthy(publicId)) return (publicId ?? null) as null | false;
    return new SessionId(String(publicId));
  }

  /** @internal */
  override cookieValue(data: unknown): unknown {
    return (data as { cookieValue?: unknown }).cookieValue;
  }
}
