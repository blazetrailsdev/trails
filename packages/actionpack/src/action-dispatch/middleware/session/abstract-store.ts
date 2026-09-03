import { include as includeMixin } from "@blazetrails/activesupport";
import { getCrypto } from "@blazetrails/ruby-compat";
import type { RackApp } from "@blazetrails/rack";
import type { PersistedRequest } from "@blazetrails/rack-session";
import { Persisted, PersistedSecure, SessionId } from "@blazetrails/rack-session";
import { Request } from "../../request.js";
import { Session as RequestSession } from "../../request/session.js";

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

export class AbstractStore extends Persisted {
  constructor(app?: RackApp, options: Record<string, unknown> = {}) {
    Compatibility.initialize.call(undefined as never, app, options);
    super(app, options);
  }

  /** @internal */
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

export class AbstractSecureStore extends PersistedSecure {
  constructor(app?: RackApp, options: Record<string, unknown> = {}) {
    Compatibility.initialize.call(undefined as never, app, options);
    super(app, options);
  }

  override generateSid(): SessionId {
    return new SessionId(getCrypto().randomBytes(16).toString("hex"));
  }

  /** @internal */
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
