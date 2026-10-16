import { constantize, include as includeMixin } from "@blazetrails/activesupport";
import { ArgumentError, LoadError, NameError, SecureRandom } from "@blazetrails/ruby-compat";
import type { RackApp } from "@blazetrails/rack";
import type { PersistedRequest } from "@blazetrails/rack-session";
import { Persisted, PersistedSecure, SessionId } from "@blazetrails/rack-session";
import { Request } from "../../http/request.js";
import { Session as RequestSession } from "../../request/session.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Session } from "../../../namespaces.js";

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
  generateSid(this: unknown): string {
    return SecureRandom.hex(16);
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

type StaleSessionCheckHost = Persisted & { staleSessionCheckBang<T>(block: () => T): T };

export const StaleSessionCheck = {
  loadSession(
    this: StaleSessionCheckHost,
    env: PersistedRequest,
  ): [unknown, Record<string, unknown>] | Promise<[unknown, Record<string, unknown>]> {
    return this.staleSessionCheckBang(() => Persisted.prototype.loadSession.call(this, env));
  },

  extractSessionId(this: StaleSessionCheckHost, env: PersistedRequest): unknown {
    return this.staleSessionCheckBang(() => Persisted.prototype.extractSessionId.call(this, env));
  },

  /**
   * @inventedArm if — PERMANENT
   * @inventedArm try — PERMANENT
   */
  staleSessionCheckBang<T>(
    this: { staleSessionCheckBang<U>(block: () => U): U },
    block: () => T,
  ): T {
    for (;;) {
      try {
        const result = block();
        if (result instanceof Promise) {
          return result.catch((argumentError: unknown) => {
            let rescued = false;
            return this.staleSessionCheckBang(() => {
              if (rescued) return block();
              rescued = true;
              throw argumentError;
            });
          }) as T;
        }
        return result;
      } catch (argumentError) {
        if (!(argumentError instanceof ArgumentError)) throw argumentError;
        const match = /undefined class\/module ([\w:]*\w)/.exec(argumentError.message);
        if (match) {
          try {
            constantize(match[1]);
          } catch (error) {
            if (!(error instanceof LoadError || error instanceof NameError)) throw error;
            throw new SessionRestoreError(error);
          }
        } else {
          throw argumentError;
        }
      }
    }
  },
};

export const SessionObject = {
  async commitSession(this: Persisted, req: any, res: any): Promise<unknown> {
    await req.commitCsrfToken?.();
    return await Persisted.prototype.commitSession.call(this, req, res);
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
    if (options.key == null || options.key === false) options.key = "_session_id";
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
    if (options.key == null || options.key === false) options.key = "_session_id";
    super(app, options);
  }

  override generateSid(): SessionId {
    return new SessionId(SecureRandom.hex(16));
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

rbModConstSet(Session, "AbstractStore", AbstractStore);
rbModConstSet(Session, "AbstractSecureStore", AbstractSecureStore);
