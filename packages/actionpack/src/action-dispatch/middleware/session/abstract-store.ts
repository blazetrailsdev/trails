/**
 * ActionDispatch::Session::AbstractStore
 *
 * Mirrors `vendor/rails/actionpack/lib/action_dispatch/middleware/session/abstract_store.rb`.
 *
 * The Rails file declares three mixin modules (`Compatibility`,
 * `StaleSessionCheck`, `SessionObject`) plus the `AbstractStore` /
 * `AbstractSecureStore` base classes. The mixins layer on top of
 * `Rack::Session::Abstract::Persisted`, which has not yet been ported;
 * the host interfaces below capture the subset of state/behavior the
 * mixins read.
 */

import { getCrypto } from "@blazetrails/activesupport";
import { Session as RequestSession } from "../../request/session.js";

/** @internal */
export interface RackRequestLike {
  env: Record<string, unknown>;
  cookieJar: Record<string, unknown>;
}

/** @internal */
export interface PersistedHost {
  key: string;
  defaultOptions: Record<string, unknown> & {
    sidbits?: number;
    secureRandom?: unknown;
  };
}

/** @internal */
export interface StaleCheckHost {
  loadSession(env: Record<string, unknown>): [unknown, Record<string, unknown>];
  extractSessionId(env: Record<string, unknown>): unknown;
}

/** @internal */
export interface SessionObjectHost {
  defaultOptions: Record<string, unknown>;
  commitSession(req: any, res: any): unknown;
}

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
 * Rails: `module Compatibility`. Mixed into AbstractStore /
 * AbstractSecureStore via `include()` to give them the legacy
 * `_session_id` default key plus a hex SID generator.
 */
export const Compatibility = {
  initialize(this: PersistedHost, _app: unknown, options: Record<string, unknown> = {}): void {
    options.key ??= "_session_id";
    // super is delegated by the host base class once Rack Persisted is ported.
  },

  generateSid(this: unknown): string {
    return getCrypto().randomBytes(16).toString("hex");
  },

  /** @internal */
  initializeSid(this: PersistedHost): void {
    delete this.defaultOptions.sidbits;
    delete this.defaultOptions.secureRandom;
  },

  /** @internal */
  makeRequest(this: unknown, env: Record<string, unknown>): { env: Record<string, unknown> } {
    return { env };
  },
};

/**
 * Rails: `module StaleSessionCheck`. Re-raises `SessionRestoreError`
 * when a session payload references a class that isn't loaded.
 */
export const StaleSessionCheck = {
  loadSession(
    this: StaleCheckHost,
    env: Record<string, unknown>,
  ): [unknown, Record<string, unknown>] {
    return staleSessionCheckBang(() =>
      Object.getPrototypeOf(Object.getPrototypeOf(this)).loadSession.call(this, env),
    );
  },

  extractSessionId(this: StaleCheckHost, env: Record<string, unknown>): unknown {
    return staleSessionCheckBang(() =>
      Object.getPrototypeOf(Object.getPrototypeOf(this)).extractSessionId.call(this, env),
    );
  },

  /** @internal */
  staleSessionCheckBang<T>(this: unknown, block: () => T): T {
    return staleSessionCheckBang(block);
  },
};

function staleSessionCheckBang<T>(block: () => T): T {
  // Ruby retries after `constantize` succeeds; without dynamic class
  // loading in JS, an unresolved reference is terminal — wrap and raise.
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
 * Rails: `module SessionObject`. Wraps prepared sessions in
 * `ActionDispatch::Request::Session` and commits the CSRF token on
 * session commit.
 */
export const SessionObject = {
  commitSession(this: SessionObjectHost, req: any, res: any): unknown {
    req.commitCsrfToken?.();
    return Object.getPrototypeOf(Object.getPrototypeOf(this)).commitSession.call(this, req, res);
  },

  prepareSession(this: SessionObjectHost, req: { env: Record<string, unknown> }): RequestSession {
    return RequestSession.create(this as any, req, this.defaultOptions);
  },

  loadedSession(this: unknown, session: unknown): boolean {
    if (!(session instanceof RequestSession)) return true;
    return (session as unknown as { loaded?: boolean }).loaded === true;
  },
};

/**
 * Rails: `class AbstractStore < Rack::Session::Abstract::Persisted`.
 * Scaffolding only — extends a placeholder base until Rack Persisted
 * is ported.
 */
export class AbstractStore {
  key = "_session_id";
  defaultOptions: Record<string, unknown> = {};

  /** @internal */
  setCookie(request: RackRequestLike, _response: unknown, cookie: unknown): void {
    request.cookieJar[this.key] = cookie;
  }
}

/**
 * Rails: `class AbstractSecureStore < Rack::Session::Abstract::PersistedSecure`.
 */
export class AbstractSecureStore {
  key = "_session_id";
  defaultOptions: Record<string, unknown> = {};

  generateSid(): unknown {
    // Rails wraps super's SID in `Rack::Session::SessionId.new(...)`; until
    // that wrapper is ported, return the raw hex value.
    return getCrypto().randomBytes(16).toString("hex");
  }

  /** @internal */
  setCookie(request: RackRequestLike, _response: unknown, cookie: unknown): void {
    request.cookieJar[this.key] = cookie;
  }
}
