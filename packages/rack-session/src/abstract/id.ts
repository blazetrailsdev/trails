import { getCrypto, inspect, KeyError } from "@blazetrails/activesupport";
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

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

function objectIdHex(object: object): string {
  let id = objectIds.get(object);
  if (id == null) {
    id = nextObjectId++;
    objectIds.set(object, id);
  }
  return id.toString(16);
}

function classNameOf(value: unknown): string {
  if (value === null || value === undefined) return "NilClass";
  return (value as { constructor?: { name?: string } }).constructor?.name ?? typeof value;
}

export class SessionHash implements PersistedSession {
  static Unspecified: unknown = {};

  private _store: Persisted;
  private req: PersistedRequest;
  private loaded: boolean;
  private _id: unknown;
  private idDefined = false;
  private _exists!: boolean;
  private existsDefined = false;
  protected data!: Record<string, unknown>;

  static find(req: PersistedRequest): unknown {
    return req.getHeader(RACK_SESSION);
  }

  static set(req: PersistedRequest, session: unknown): void {
    req.setHeader(RACK_SESSION, session);
  }

  static setOptions(req: PersistedRequest, options: Record<string, unknown>): void {
    req.setHeader(RACK_SESSION_OPTIONS, { ...options });
  }

  constructor(store: Persisted, req: PersistedRequest) {
    this._store = store;
    this.req = req;
    this.loaded = false;
  }

  setId(id: unknown): void {
    this._id = id;
    this.idDefined = true;
  }

  id(): unknown {
    if (this.loaded || this.idDefined) return this._id;
    this.setId(this._store.extractSessionId(this.req));
    return this._id;
  }

  options(): SessionOptions {
    return this.req.sessionOptions as SessionOptions;
  }

  each(block: (key: string, value: unknown) => void): void {
    this.loadForReadBang();
    for (const key of Object.keys(this.data)) {
      block(key, this.data[key]);
    }
  }

  get(key: unknown): unknown {
    this.loadForReadBang();
    return this.data[String(key)];
  }

  dig(key: unknown, ...keys: unknown[]): unknown {
    this.loadForReadBang();
    let value: unknown = this.data[String(key)];
    for (const k of keys) {
      if (value == null) return undefined;
      if (typeof value !== "object") {
        throw new TypeError(`${classNameOf(value)} does not have #dig method`);
      }
      value = (value as Record<string, unknown>)[k as string];
    }
    return value;
  }

  fetch(
    key: unknown,
    defaultValue: unknown = SessionHash.Unspecified,
    block?: (key: string) => unknown,
  ): unknown {
    this.loadForReadBang();
    const k = String(key);
    if (defaultValue === SessionHash.Unspecified) {
      if (Object.hasOwn(this.data, k)) return this.data[k];
      if (block) return block(k);
      throw new KeyError(`key not found: "${k}"`);
    } else {
      if (Object.hasOwn(this.data, k)) return this.data[k];
      if (block) return block(k);
      return defaultValue;
    }
  }

  hasKey(key: unknown): boolean {
    this.loadForReadBang();
    return Object.hasOwn(this.data, String(key));
  }

  isKey(key: unknown): boolean {
    return this.hasKey(key);
  }

  isInclude(key: unknown): boolean {
    return this.hasKey(key);
  }

  set(key: unknown, value: unknown): void {
    this.loadForWriteBang();
    this.data[String(key)] = value;
  }

  store(key: unknown, value: unknown): void {
    this.set(key, value);
  }

  clear(): void {
    this.loadForWriteBang();
    for (const key of Object.keys(this.data)) {
      delete this.data[key];
    }
  }

  destroy(): void {
    this.clear();
    this.setId(this._store.deleteSession(this.req, this.id(), this.options()));
  }

  toHash(): Record<string, unknown> {
    this.loadForReadBang();
    return { ...this.data };
  }

  update(hash: unknown): Record<string, unknown> {
    this.loadForWriteBang();
    return Object.assign(this.data, this.stringifyKeys(hash));
  }

  mergeBang(hash: unknown): Record<string, unknown> {
    return this.update(hash);
  }

  replace(hash: unknown): Record<string, unknown> {
    this.loadForWriteBang();
    const other = this.stringifyKeys(hash);
    for (const key of Object.keys(this.data)) {
      delete this.data[key];
    }
    return Object.assign(this.data, other);
  }

  delete(key: unknown): unknown {
    this.loadForWriteBang();
    const k = String(key);
    const value = this.data[k];
    delete this.data[k];
    return value;
  }

  inspect(): string {
    if (this.isLoaded()) {
      return inspect(this.data);
    } else {
      return `#<${this.constructor.name}:0x${objectIdHex(this)} not yet loaded>`;
    }
  }

  isExists(): boolean {
    if (this.existsDefined) return this._exists;
    this.data = {};
    this.existsDefined = true;
    return (this._exists = this._store.sessionExists(this.req));
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isEmpty(): boolean {
    this.loadForReadBang();
    return Object.keys(this.data).length === 0;
  }

  keys(): string[] {
    this.loadForReadBang();
    return Object.keys(this.data);
  }

  values(): unknown[] {
    this.loadForReadBang();
    return Object.values(this.data);
  }

  /** @internal */
  loadForReadBang(): void {
    if (!this.isLoaded() && this.isExists()) this.loadBang();
  }

  /** @internal */
  loadForWriteBang(): void {
    if (!this.isLoaded()) this.loadBang();
  }

  /** @internal */
  loadBang(): void {
    const [id, session] = this._store.loadSession(this.req);
    this.setId(id);
    this.data = this.stringifyKeys(session);
    this.loaded = true;
  }

  /** @internal */
  stringifyKeys(other: unknown): Record<string, unknown> {
    const hash: Record<string, unknown> = {};
    const source = toHashOf(other);
    for (const key of Object.keys(source)) {
      hash[String(key)] = source[key];
    }
    return hash;
  }
}

function toHashOf(other: unknown): Record<string, unknown> {
  const candidate = other as { toHash?: () => Record<string, unknown> } | null | undefined;
  if (typeof candidate?.toHash === "function") return candidate.toHash();
  return other as Record<string, unknown>;
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
  sessionOptions: SessionOptions | Record<string, unknown>;
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
      // eslint-disable-next-line no-empty -- Ruby puts a $VERBOSE-only notice on rack.errors (abstract/id.rb:399); trails' Rack env carries no such stream
    } else if (isTruthy(options.get("defer")) && !isTruthy(options.get("renew"))) {
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
    return SessionHash;
  }

  /** @missingRailsCall store — CONVERGEABLE port-rack-session-pool */
  findSession(_req: PersistedRequest, _sid: unknown): [unknown, Record<string, unknown> | null] {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:440 cluster=rack-session
    throw new Error("#find_session not implemented.");
  }

  /** @missingRailsCall store — CONVERGEABLE port-rack-session-pool */
  writeSession(
    _req: PersistedRequest,
    _sid: unknown,
    _session: Record<string, unknown>,
    _options: SessionOptions,
  ): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:448 cluster=rack-session
    throw new Error("#write_session not implemented.");
  }

  /** @missingRailsCall delete — CONVERGEABLE port-rack-session-pool */
  deleteSession(_req: PersistedRequest, _sid: unknown, _options: SessionOptions): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:455 cluster=rack-session
    throw new Error("#delete_session not implemented");
  }
}

export class SecureSessionHash extends SessionHash {
  override get(key: unknown): unknown {
    if (key === "session_id") {
      this.loadForReadBang();
      const id = this.id();
      if (id instanceof SessionId) {
        return id.publicId;
      } else {
        return id;
      }
    } else {
      return super.get(key);
    }
  }
}

export class PersistedSecure extends Persisted {
  static SecureSessionHash = SecureSessionHash;

  override generateSid(secure?: unknown): SessionId {
    return new SessionId(String(super.generateSid(secure)));
  }

  override extractSessionId(request: PersistedRequest): SessionId | null | false {
    const publicId = super.extractSessionId(request);
    if (!isTruthy(publicId)) return (publicId ?? null) as null | false;
    return new SessionId(String(publicId));
  }

  /** @internal */
  override sessionClass(): SessionClass {
    return SecureSessionHash;
  }

  /** @internal */
  override cookieValue(data: unknown): unknown {
    return (data as { cookieValue?: unknown }).cookieValue;
  }
}
