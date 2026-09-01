/**
 * ActionDispatch::Session::AbstractStore
 *
 * Mirrors `vendor/rails/actionpack/lib/action_dispatch/middleware/session/abstract_store.rb`.
 *
 * The Rails file declares three mixin modules (`Compatibility`,
 * `StaleSessionCheck`, `SessionObject`) plus the `AbstractStore` /
 * `AbstractSecureStore` base classes that `include` all three on top
 * of `Rack::Session::Abstract::Persisted` / `PersistedSecure`. Those two
 * Rack base classes live in the `rack-session` gem rather than in Rails,
 * so they are ported here alongside their Rails subclasses, from
 * `vendor/rack-session/lib/rack/session/abstract/id.rb:239-497`.
 */

import { include as includeMixin, getCrypto } from "@blazetrails/activesupport";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { RACK_SESSION, RACK_SESSION_OPTIONS, ResponseRaw } from "@blazetrails/rack";
import { Request } from "../../request.js";
import { Session as RequestSession } from "../../request/session.js";

/** @internal Rails: `Rack::Session::SessionId`. Minimal value wrapper. */
export class SessionId {
  publicId: string;
  /** @internal Memoized to mirror Rails' `@private_id ||= ...`. */
  private _privateId?: string;
  constructor(publicId: string) {
    this.publicId = publicId;
  }
  /**
   * Rails: `Rack::Session::SessionId#private_id`. SHA256 hex of the
   * public id; used as the cache lookup key by `AbstractSecureStore`
   * subclasses so the raw cookie value never reaches the cache backend.
   */
  get privateId(): string {
    this._privateId ??= getCrypto().createHash("sha256").update(this.publicId).digest("hex");
    return this._privateId;
  }
  toString(): string {
    return this.publicId;
  }
}

/** Raised when a session payload references a class that isn't loaded. */
export class SessionRestoreError extends Error {
  constructor(cause?: Error) {
    const msg = cause?.message ?? "";
    const cls = cause ? cause.constructor.name : "Error";
    super(
      "Session contains objects whose class definition isn't available.\n" +
        "Remember to require the classes for all objects kept in the session.\n" +
        `(Original exception: ${msg} [${cls}])\n`,
    );
    this.name = "SessionRestoreError";
    if (cause?.stack) this.stack = cause.stack;
  }
}

class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

/** Rails: `Rack::Session::Abstract::Persisted::DEFAULT_OPTIONS` (`id.rb:240-253`). */
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

/**
 * Rails: the `ActionDispatch::Request::Session::Options` a prepared session
 * answers from `#options` — Ruby reads it with `options[:drop]`, which is
 * `Options#[]`.
 */
export type SessionOptions = InstanceType<typeof RequestSession.Options>;

/**
 * Ruby truthiness: only `nil` and `false` are falsy, so `0` and `""` are not.
 * `commit_session` leans on it three times (`id.rb:386`, `:387`, `:393`) and a
 * JS `??` / `Boolean()` would answer differently for each.
 *
 * @noRailsEquivalent PERMANENT — Ruby spells this with bare `||` / `unless`;
 * TypeScript has no operator with those semantics.
 */
function isTruthy(value: unknown): boolean {
  return value != null && value !== false;
}

/** Rails: `class Persisted` (`rack-session id.rb:239`). */
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

  /** Rails: `self.class::DEFAULT_OPTIONS` (`id.rb:259`). */
  static DEFAULT_OPTIONS: Readonly<Record<string, unknown>> = DEFAULT_OPTIONS;

  /** Rails: `call(env)` (`id.rb:267-269`). */
  call(env: RackEnv): Promise<RackResponse> {
    return this.context(env);
  }

  /** Rails: `context(env, app = @app)` (`id.rb:271-278`). */
  async context(env: RackEnv, app: RackApp | undefined = this.app): Promise<RackResponse> {
    const req = this.makeRequest(env);
    this.prepareSession(req);
    const [status, headers, body] = await app!(req.env);
    const res = new ResponseRaw(status, headers);
    this.commitSession(req, res);
    return [status, headers, body];
  }

  /** @internal Rails: `make_request(env)` (`id.rb:282-284`). */
  makeRequest(env: RackEnv): any {
    return new Request(env);
  }

  /** @internal Rails: `initialize_sid` (`id.rb:286-290`). */
  initializeSid(): void {
    this.sidbits = this.defaultOptions["sidbits"] as number;
    this.sidSecure = this.defaultOptions["secureRandom"];
    this.sidLength = this.sidbits / 4;
  }

  /**
   * Rails: `generate_sid(secure = @sid_secure)` (`id.rb:296-304`).
   *
   * Ruby's `else` arm (`Kernel.rand`) and the `rescue NotImplementedError`
   * that retries into it both exist for a `SecureRandom` that cannot seed;
   * `getCrypto()` has no such mode, so neither arm has a trigger and only
   * `secure.hex(@sid_length)` is reachable. `secure` is kept because
   * `PersistedSecure#generate_sid(*)` forwards it.
   */
  generateSid(secure: unknown = this.sidSecure): unknown {
    void secure;
    return getCrypto()
      .randomBytes(Math.ceil(this.sidLength / 2))
      .toString("hex")
      .slice(0, this.sidLength);
  }

  /** @internal Rails: `prepare_session(req)` (`id.rb:309-315`). */
  prepareSession(req: any): void {
    const sessionWas = req.getHeader(RACK_SESSION);
    const session = new (this.sessionClass())(this, req);
    req.setHeader(RACK_SESSION, session);
    req.setHeader(RACK_SESSION_OPTIONS, { ...this.defaultOptions });
    if (isTruthy(sessionWas)) session.mergeBang(sessionWas);
  }

  /** @internal Rails: `load_session(req)` (`id.rb:320-324`). */
  loadSession(req: any): [unknown, Record<string, unknown>] {
    const currentSid = this.currentSessionId(req);
    const [sid, session] = this.findSession(req, currentSid);
    return [sid, session ?? {}];
  }

  /** @internal Rails: `extract_session_id(request)` (`id.rb:328-332`). */
  extractSessionId(request: any): unknown {
    let sid = request.cookies[this.key];
    if (!isTruthy(sid) && !isTruthy(this.cookieOnly)) sid = request.params[this.key];
    return sid;
  }

  /** @internal Rails: `current_session_id(req)` (`id.rb:336-338`). */
  currentSessionId(req: any): unknown {
    return req.getHeader(RACK_SESSION).id();
  }

  /** @internal Rails: `session_exists?(req)` (`id.rb:342-345`). */
  sessionExists(req: any): boolean {
    const value = this.currentSessionId(req);
    return isTruthy(value) && String(value) !== "";
  }

  /** @internal Rails: `commit_session?(req, session, options)` (`id.rb:350-357`). */
  isCommitSession(req: any, session: any, options: SessionOptions): boolean {
    if (isTruthy(options.get("skip"))) return false;
    const hasSession =
      this.isLoadedSession(session) || this.isForcedSessionUpdate(session, options);
    return hasSession && this.isSecurityMatches(req, options);
  }

  /** @internal Rails: `loaded_session?(session)` (`id.rb:359-361`). */
  isLoadedSession(session: any): boolean {
    return !(session instanceof this.sessionClass()) || session.isLoaded();
  }

  /** @internal Rails: `forced_session_update?(session, options)` (`id.rb:363-365`). */
  isForcedSessionUpdate(session: any, options: SessionOptions): boolean {
    return this.isForceOptions(options) && isTruthy(session) && !session.isEmpty();
  }

  /** @internal Rails: `force_options?(options)` (`id.rb:367-369`). */
  isForceOptions(options: SessionOptions): boolean {
    return options.valuesAt("maxAge", "renew", "drop", "defer", "expireAfter").some(isTruthy);
  }

  /**
   * Rails: `security_matches?(request, options)` (`id.rb:371-374`).
   *
   * @internal
   */
  isSecurityMatches(request: any, options: SessionOptions): boolean {
    if (!isTruthy(options.get("secure"))) return true;
    return isTruthy(request.ssl) || this.assumeSsl === true;
  }

  /** Rails: `commit_session(req, res)` (`id.rb:381-414`). */
  commitSession(req: any, res: ResponseRaw): unknown {
    const session = req.getHeader(RACK_SESSION);
    const options: SessionOptions = session.options();

    let sessionId: unknown;
    if (isTruthy(options.get("drop")) || isTruthy(options.get("renew"))) {
      // Ruby's `||` here and at `:393` falls through on `false` as well as
      // `nil`; `??` would not (`id.rb:386`).
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
      // Rails writes onto `rack.errors`; trails' Rack env carries no such
      // stream, so the same warning goes to the console.
      console.warn(`Warning! ${this.constructor.name} failed to save session. Content dropped.`);
    } else if (isTruthy(options.get("defer")) && !isTruthy(options.get("renew"))) {
      // Rails' "Deferring cookie" notice is `$VERBOSE`-only (`id.rb:399`).
    } else {
      const cookie: Record<string, unknown> = {};
      cookie["value"] = this.cookieValue(data);
      const expireAfter = options.get("expireAfter");
      if (isTruthy(expireAfter)) {
        // boundary: `Time.now + options[:expire_after]` is an ABSOLUTE expiry
        // and `Rack::Utils.set_cookie_header` renders it through `httpDate`.
        cookie["expires"] = new Date(Date.now() + (expireAfter as number) * 1000);
      }
      const maxAge = options.get("maxAge");
      if (isTruthy(maxAge)) {
        // boundary: as above (`id.rb:404`).
        cookie["expires"] = new Date(Date.now() + (maxAge as number) * 1000);
      }

      cookie["sameSite"] =
        typeof this.sameSite === "function"
          ? (this.sameSite as (req: unknown, res: unknown) => unknown)(req, res)
          : this.sameSite;
      this.setCookie(req, res, { ...cookie, ...options.toHash() });
    }
  }

  /** @internal Rails: `cookie_value(data)` (`id.rb:416-418`). */
  cookieValue(data: unknown): unknown {
    return data;
  }

  /** @internal Rails: `set_cookie(request, response, cookie)` (`id.rb:423-427`). */
  setCookie(request: any, response: ResponseRaw, cookie: Record<string, unknown>): void {
    if (request.cookies[this.key] !== cookie["value"] || isTruthy(cookie["expires"])) {
      response.setCookie(this.key, cookie);
    }
  }

  /** @internal Rails: `session_class` (`id.rb:431-433`). */
  sessionClass(): typeof RequestSession {
    return RequestSession;
  }

  /** Rails: `find_session(env, sid)` (`id.rb:440-442`). */
  findSession(_req: any, _sid: unknown): [unknown, Record<string, unknown> | null] {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:440 cluster=actionpack-session
    throw new NotImplementedError("#find_session not implemented.");
  }

  /** Rails: `write_session(req, sid, session, options)` (`id.rb:448-450`). */
  writeSession(
    _req: any,
    _sid: unknown,
    _session: Record<string, unknown>,
    _options: SessionOptions,
  ): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:448 cluster=actionpack-session
    throw new NotImplementedError("#write_session not implemented.");
  }

  /** Rails: `delete_session(req, sid, options)` (`id.rb:455-457`). */
  deleteSession(_req: any, _sid: unknown, _options: SessionOptions): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack-session/lib/rack/session/abstract/id.rb:455 cluster=actionpack-session
    throw new NotImplementedError("#delete_session not implemented");
  }
}

/** Rails: `class PersistedSecure < Persisted` (`id.rb:460-497`). */
export class PersistedSecure extends Persisted {
  override generateSid(secure?: unknown): SessionId {
    return new SessionId(String(super.generateSid(secure)));
  }

  override extractSessionId(request: any): SessionId | null | false {
    const publicId = super.extractSessionId(request);
    // Ruby's `public_id && SessionId.new(public_id)` (`id.rb:483-486`) answers
    // `public_id` ITSELF when falsy — `false` stays `false`, it is not wrapped.
    if (!isTruthy(publicId)) return (publicId ?? null) as null | false;
    return new SessionId(String(publicId));
  }

  /** @internal Rails: `cookie_value(data)` (`id.rb:494-496`). */
  override cookieValue(data: unknown): unknown {
    return (data as { cookieValue?: unknown }).cookieValue;
  }
}

/**
 * Rails: `module Compatibility`. Default cookie key, hex SID, strip
 * deprecated `sidbits`/`secure_random` from `@default_options`, build
 * an `ActionDispatch::Request` for incoming envs.
 */
export const Compatibility = {
  initialize(this: Persisted, _app: unknown, options: Record<string, unknown> = {}): void {
    options.key ??= "_session_id";
  },

  generateSid(this: unknown): string {
    return getCrypto().randomBytes(16).toString("hex");
  },

  /** @internal */
  initializeSid(this: Persisted): void {
    delete this.defaultOptions.sidbits;
    delete this.defaultOptions.secureRandom;
  },

  /** @internal */
  makeRequest(this: unknown, env: Record<string, unknown>): Request {
    return new Request(env);
  },
};

/**
 * Rails: `module StaleSessionCheck`. Wraps `loadSession` /
 * `extractSessionId` and re-raises Rack's `undefined class/module …`
 * `ArgumentError` as `SessionRestoreError`. Ruby's `retry`-after-
 * `constantize` is not portable; the JS path is terminal.
 */
export const StaleSessionCheck = {
  loadSession(this: Persisted, env: Record<string, unknown>): [unknown, Record<string, unknown>] {
    return staleSessionCheckBang(() => Persisted.prototype.loadSession.call(this, env));
  },

  extractSessionId(this: Persisted, env: Record<string, unknown>): unknown {
    return staleSessionCheckBang(() => Persisted.prototype.extractSessionId.call(this, env));
  },

  /** @internal */
  staleSessionCheckBang<T>(this: unknown, block: () => T): T {
    return staleSessionCheckBang(block);
  },
};

function staleSessionCheckBang<T>(block: () => T): T {
  try {
    return block();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/undefined class\/module ([\w:]*\w)/.test(msg)) {
      throw new SessionRestoreError(err instanceof Error ? err : undefined);
    }
    throw err;
  }
}

/**
 * Rails: `module SessionObject`. Commits CSRF before delegating session
 * commit; wraps prepared sessions in `ActionDispatch::Request::Session`.
 */
export const SessionObject = {
  commitSession(this: Persisted, req: any, res: any): unknown {
    req.commitCsrfToken?.();
    return Persisted.prototype.commitSession.call(this, req, res);
  },

  prepareSession(this: Persisted, req: { env: Record<string, unknown> }): RequestSession {
    return RequestSession.create(this as any, req, this.defaultOptions);
  },

  isLoadedSession(this: unknown, session: unknown): boolean {
    return !(session instanceof RequestSession) || session.isLoaded();
  },
};

/** Rails: `class AbstractStore < Rack::Session::Abstract::Persisted`. */
export class AbstractStore extends Persisted {
  constructor(app?: RackApp, options: Record<string, unknown> = {}) {
    // Rails: `Compatibility#initialize` (`abstract_store.rb:23-26`) defaults
    // the key BEFORE `super`; a TS constructor cannot run a mixed-in method
    // before its own `super()`, and this one touches only `options`.
    Compatibility.initialize.call(undefined as never, app, options);
    super(app, options);
  }

  /** @internal Rails: `set_cookie(request, response, cookie)` (private). */
  setCookie(
    request: { cookieJar: Record<string, unknown> },
    _response: unknown,
    cookie: unknown,
  ): void {
    request.cookieJar[this.key] = cookie;
  }
}
includeMixin(AbstractStore, Compatibility);
includeMixin(AbstractStore, StaleSessionCheck);
includeMixin(AbstractStore, SessionObject);

/** Rails: `class AbstractSecureStore < Rack::Session::Abstract::PersistedSecure`. */
export class AbstractSecureStore extends PersistedSecure {
  constructor(app?: RackApp, options: Record<string, unknown> = {}) {
    Compatibility.initialize.call(undefined as never, app, options);
    super(app, options);
  }

  override generateSid(): SessionId {
    return new SessionId(getCrypto().randomBytes(16).toString("hex"));
  }

  /** @internal Rails: `set_cookie(request, response, cookie)` (private). */
  setCookie(
    request: { cookieJar: Record<string, unknown> },
    _response: unknown,
    cookie: unknown,
  ): void {
    request.cookieJar[this.key] = cookie;
  }
}
includeMixin(AbstractSecureStore, Compatibility);
includeMixin(AbstractSecureStore, StaleSessionCheck);
includeMixin(AbstractSecureStore, SessionObject);
