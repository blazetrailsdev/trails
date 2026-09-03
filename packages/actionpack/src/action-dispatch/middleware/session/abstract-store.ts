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
 * so they are ported in `@blazetrails/rack-session`
 * (`vendor/rack-session/lib/rack/session/abstract/id.rb`).
 */

import { include as includeMixin } from "@blazetrails/activesupport";
import { getCrypto } from "@blazetrails/ruby-compat";
import type { RackApp } from "@blazetrails/rack";
import type { PersistedRequest } from "@blazetrails/rack-session";
import { Persisted, PersistedSecure, SessionId } from "@blazetrails/rack-session";
import { Request } from "../../request.js";
import { Session as RequestSession } from "../../request/session.js";

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
  loadSession(this: Persisted, env: PersistedRequest): [unknown, Record<string, unknown>] {
    return staleSessionCheckBang(() => Persisted.prototype.loadSession.call(this, env));
  },

  extractSessionId(this: Persisted, env: PersistedRequest): unknown {
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
    request: PersistedRequest & { cookieJar(): { set(key: string, value: unknown): void } },
    _response: unknown,
    cookie: unknown,
  ): void {
    request.cookieJar().set(this.key, cookie);
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
    request: PersistedRequest & { cookieJar(): { set(key: string, value: unknown): void } },
    _response: unknown,
    cookie: unknown,
  ): void {
    request.cookieJar().set(this.key, cookie);
  }
}
includeMixin(AbstractSecureStore, Compatibility);
includeMixin(AbstractSecureStore, StaleSessionCheck);
includeMixin(AbstractSecureStore, SessionObject);
