/**
 * ActionDispatch::Session::AbstractStore
 *
 * Mirrors `vendor/rails/actionpack/lib/action_dispatch/middleware/session/abstract_store.rb`.
 *
 * The Rails file declares three mixin modules (`Compatibility`,
 * `StaleSessionCheck`, `SessionObject`) plus the `AbstractStore` /
 * `AbstractSecureStore` base classes that `include` all three on top
 * of `Rack::Session::Abstract::Persisted` / `PersistedSecure`. Those
 * Rack base classes are not yet ported; in their place this file
 * defines a `Persisted` scaffolding base with the surface the mixins
 * call into (`loadSession`, `extractSessionId`, `commitSession`,
 * `generateSid`), each raising `NotImplementedError` per Rack's
 * abstract contract. Concrete stores override those hooks.
 */

import { include as includeMixin, getCrypto } from "@blazetrails/activesupport";
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
  constructor(method: string) {
    super(`${method} must be implemented by a subclass`);
    this.name = "NotImplementedError";
  }
}

/**
 * Stand-in for `Rack::Session::Abstract::Persisted`. The mixins call
 * `super` for `loadSession`, `extractSessionId`, `commitSession`, and
 * `generateSid`; this base provides those names with Rack's abstract
 * semantics (`NotImplementedError`) so concrete stores override them.
 */
export class Persisted {
  key = "_session_id";
  defaultOptions: Record<string, unknown> & {
    sidbits?: number;
    secureRandom?: unknown;
  } = {};

  constructor(_app?: unknown, _options: Record<string, unknown> = {}) {}

  generateSid(): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack/lib/rack/session/abstract/id.rb cluster=actionpack-session
    throw new NotImplementedError("generateSid");
  }

  loadSession(_env: Record<string, unknown>): [unknown, Record<string, unknown>] {
    // @nie disposition=keep-as-strategy-hook rails=rack/lib/rack/session/abstract/id.rb cluster=actionpack-session
    throw new NotImplementedError("loadSession");
  }

  extractSessionId(_env: Record<string, unknown>): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack/lib/rack/session/abstract/id.rb cluster=actionpack-session
    throw new NotImplementedError("extractSessionId");
  }

  commitSession(_req: any, _res: any): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack/lib/rack/session/abstract/id.rb cluster=actionpack-session
    throw new NotImplementedError("commitSession");
  }
}

/** Stand-in for `Rack::Session::Abstract::PersistedSecure`. */
export class PersistedSecure extends Persisted {
  override generateSid(): unknown {
    // @nie disposition=keep-as-strategy-hook rails=rack/lib/rack/session/abstract/id.rb cluster=actionpack-session
    throw new NotImplementedError("generateSid");
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

  loadedSession(this: unknown, session: unknown): boolean {
    if (!(session instanceof RequestSession)) return true;
    return (session as unknown as { loaded?: boolean }).loaded === true;
  },
};

/** Rails: `class AbstractStore < Rack::Session::Abstract::Persisted`. */
export class AbstractStore extends Persisted {
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
