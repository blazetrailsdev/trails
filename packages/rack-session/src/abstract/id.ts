import { ArgumentError, getCrypto, inspect, KeyError, valuesAt } from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import {
  RACK_ERRORS,
  RACK_SESSION,
  RACK_SESSION_OPTIONS,
  Request,
  ResponseRaw,
} from "@blazetrails/rack";
import { kernelRand, NotImplementedError, SecureRandom, verbose } from "@blazetrails/ruby-compat";

import { getRubyClassPath } from "../ruby-class-path-slot.js";

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

interface RackErrors {
  puts(string?: string): unknown;
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

function rubyClassPath(klass: unknown): string {
  switch (klass) {
    case SessionHash:
      return "Rack::Session::Abstract::SessionHash";
    case SecureSessionHash:
      return "Rack::Session::Abstract::PersistedSecure::SecureSessionHash";
    case Persisted:
      return "Rack::Session::Abstract::Persisted";
    case PersistedSecure:
      return "Rack::Session::Abstract::PersistedSecure";
    case ID:
      return "Rack::Session::Abstract::ID";
    default:
      return getRubyClassPath(klass) ?? (klass as { name: string }).name;
  }
}

export class SessionHash implements PersistedSession {
  setId(id: unknown): void {
    this._id = id;
    this.idDefined = true;
  }

  static Unspecified: unknown = {};

  private _store: Persisted;
  private req: PersistedRequest;
  protected loaded: boolean;
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

  id(): unknown {
    if (this.loaded || this.idDefined) return this._id;
    this.setId(this._store.extractSessionId(this.req));
    return this._id;
  }

  options(): Record<string, unknown> {
    return this.req.sessionOptions;
  }

  each(block: (key: string, value: unknown) => void): Record<string, unknown> {
    this.loadForReadBang();
    for (const key of Object.keys(this.data)) {
      block(key, this.data[key]);
    }
    return this.data;
  }

  get(key: unknown): unknown {
    this.loadForReadBang();
    return this.data[String(key)];
  }

  dig(key: unknown, ...keys: unknown[]): unknown {
    if (arguments.length === 0) {
      throw new ArgumentError("wrong number of arguments (given 0, expected 1+)");
    }
    this.loadForReadBang();
    let value: unknown = this.data[String(key)];
    for (const k of keys) {
      if (value == null) return undefined;
      if (typeof value !== "object") {
        throw new TypeError(`${(value as object).constructor.name} does not have #dig method`);
      }
      value = (value as Record<string, unknown>)[k as string];
    }
    return value;
  }

  fetch(key: unknown, defaultValue?: unknown, block?: (key: string) => unknown): unknown {
    if (arguments.length < 2) defaultValue = SessionHash.Unspecified;
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

  clear(): Record<string, unknown> {
    this.loadForWriteBang();
    for (const key of Object.keys(this.data)) {
      delete this.data[key];
    }
    return this.data;
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
      return `#<${rubyClassPath(this.constructor)}:0x${objectIdHex(this)} not yet loaded>`;
    }
  }

  isExists(): boolean {
    if (this.existsDefined) return this._exists;
    this.data = {};
    this._exists = this._store.sessionExists(this.req);
    this.existsDefined = true;
    return this._exists;
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
    const candidate = other as { toHash?: () => Record<string, unknown> } | null | undefined;
    const source =
      typeof candidate?.toHash === "function"
        ? candidate.toHash()
        : (other as Record<string, unknown>);
    for (const key of Object.keys(source)) {
      hash[String(key)] = source[key];
    }
    return hash;
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
  secureRandom: SecureRandom,
});

/** @noRailsEquivalent PERMANENT */
export interface PersistedSession {
  id(): unknown;
  options(): Record<string, unknown>;
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
  sessionOptions: Record<string, unknown>;
  ssl?: unknown;
}

/** @noRailsEquivalent PERMANENT */
export function isTruthy(value: unknown): boolean {
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
    try {
      if (isTruthy(secure)) {
        return (secure as { hex(n: number): string }).hex(this.sidLength);
      } else {
        return (kernelRand((1n << BigInt(this.sidbits)) - 1n) as bigint)
          .toString(16)
          .padStart(this.sidLength, "0");
      }
    } catch (error) {
      if (error instanceof NotImplementedError) return this.generateSid(false);
      throw error;
    }
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
    options: Record<string, unknown>,
  ): boolean {
    if (isTruthy(options["skip"])) return false;
    const hasSession =
      this.isLoadedSession(session) || this.isForcedSessionUpdate(session, options);
    return hasSession && this.isSecurityMatches(req, options);
  }

  /** @internal */
  isLoadedSession(session: PersistedSession): boolean {
    return !(session instanceof this.sessionClass()) || session.isLoaded();
  }

  /** @internal */
  isForcedSessionUpdate(session: PersistedSession, options: Record<string, unknown>): boolean {
    return this.isForceOptions(options) && isTruthy(session) && !session.isEmpty();
  }

  /** @internal */
  isForceOptions(options: Record<string, unknown>): boolean {
    return valuesAt(options, "maxAge", "renew", "drop", "defer", "expireAfter").some(isTruthy);
  }

  /** @internal */
  isSecurityMatches(request: PersistedRequest, options: Record<string, unknown>): boolean {
    if (!isTruthy(options["secure"])) return true;
    return isTruthy(request.ssl) || this.assumeSsl === true;
  }

  commitSession(req: PersistedRequest, res: ResponseRaw): unknown {
    const session = req.getHeader(RACK_SESSION);
    const options: Record<string, unknown> = session.options();

    let sessionId: unknown;
    if (isTruthy(options["drop"]) || isTruthy(options["renew"])) {
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
      (req.getHeader(RACK_ERRORS) as unknown as RackErrors).puts(
        `Warning! ${rubyClassPath(this.constructor)} failed to save session. Content dropped.`,
      );
    } else if (isTruthy(options["defer"]) && !isTruthy(options["renew"])) {
      if (isTruthy(verbose())) {
        (req.getHeader(RACK_ERRORS) as unknown as RackErrors).puts(
          `Deferring cookie for ${String(sessionId)}`,
        );
      }
    } else {
      const cookie: Record<string, unknown> = {};
      cookie["value"] = this.cookieValue(data);
      const expireAfter = options["expireAfter"];
      if (isTruthy(expireAfter)) {
        // boundary: `Time.now + options[:expire_after]` is an ABSOLUTE expiry
        cookie["expires"] = new Date(Date.now() + (expireAfter as number) * 1000);
      }
      const maxAge = options["maxAge"];
      if (isTruthy(maxAge)) {
        // boundary: as above (`abstract/id.rb:404`).
        cookie["expires"] = new Date(Date.now() + (maxAge as number) * 1000);
      }

      cookie["sameSite"] =
        typeof this.sameSite === "function"
          ? (this.sameSite as (req: unknown, res: unknown) => unknown)(req, res)
          : this.sameSite;
      const other = options as { toHash?: () => Record<string, unknown> };
      this.setCookie(req, res, {
        ...cookie,
        ...(typeof other.toHash === "function" ? other.toHash() : options),
      });
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

  findSession(_req: PersistedRequest, _sid: unknown): [unknown, Record<string, unknown> | null] {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:440 cluster=rack-session
    throw new Error("#find_session not implemented.");
  }

  writeSession(
    _req: PersistedRequest,
    _sid: unknown,
    _session: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:448 cluster=rack-session
    throw new Error("#write_session not implemented.");
  }

  deleteSession(_req: PersistedRequest, _sid: unknown, _options: Record<string, unknown>): unknown {
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

interface IdSubclass {
  getSession(env: RackEnv, sid: unknown): [unknown, Record<string, unknown> | null];
  setSession(
    env: RackEnv,
    sid: unknown,
    session: Record<string, unknown>,
    options: Record<string, unknown>,
  ): unknown;
  destroySession(env: RackEnv, sid: unknown, options: Record<string, unknown>): unknown;
}

export class ID extends Persisted {
  override findSession(
    req: PersistedRequest,
    sid: unknown,
  ): [unknown, Record<string, unknown> | null] {
    return (this as unknown as IdSubclass).getSession(req.env, sid);
  }

  override writeSession(
    req: PersistedRequest,
    sid: unknown,
    session: Record<string, unknown>,
    options: Record<string, unknown>,
  ): unknown {
    return (this as unknown as IdSubclass).setSession(req.env, sid, session, options);
  }

  override deleteSession(
    req: PersistedRequest,
    sid: unknown,
    options: Record<string, unknown>,
  ): unknown {
    return (this as unknown as IdSubclass).destroySession(req.env, sid, options);
  }
}
