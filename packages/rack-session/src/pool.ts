import type { RackApp } from "@blazetrails/rack";

import {
  DEFAULT_OPTIONS as ID_DEFAULT_OPTIONS,
  isTruthy,
  PersistedSecure,
  type PersistedRequest,
  SessionId,
} from "./abstract/id.js";
import { setRubyClassPath } from "./ruby-class-path-slot.js";

export class Pool extends PersistedSecure {
  pool!: Record<string, Record<string, unknown> | undefined>;

  static override DEFAULT_OPTIONS: Readonly<Record<string, unknown>> = Object.freeze({
    ...ID_DEFAULT_OPTIONS,
    drop: false,
    allowFallback: true,
  });

  protected allowFallback: unknown;

  /**
   * @missingRailsCall new — PERMANENT
   * @missingRailsCall delete — PERMANENT
   */
  constructor(app?: RackApp, options: Record<string, unknown> = {}) {
    super(app, options);
    this.pool = {};
    this.allowFallback = this.defaultOptions["allowFallback"];
    delete this.defaultOptions["allowFallback"];
  }

  /**
   * @missingRailsCall key? — PERMANENT
   * @missingRailsArgs super(*args) — PERMANENT
   */
  override generateSid({ useMutex: _useMutex = true }: { useMutex?: boolean } = {}): SessionId {
    for (;;) {
      const sid = super.generateSid();
      if (!Object.hasOwn(this.pool, sid.privateId)) return sid;
    }
  }

  /** @missingRailsCall store — PERMANENT */
  override findSession(
    _req: PersistedRequest,
    sid: SessionId | null,
  ): [SessionId, Record<string, unknown>] {
    let session = isTruthy(sid) ? this.getSessionWithFallback(sid as SessionId) : undefined;
    if (!isTruthy(sid) || !isTruthy(session)) {
      sid = this.generateSid({ useMutex: false });
      session = {};
      this.pool[sid.privateId] = session;
    }
    return [sid as SessionId, session as Record<string, unknown>];
  }

  /** @missingRailsCall store — PERMANENT */
  override writeSession(
    _req: PersistedRequest,
    sessionId: SessionId,
    newSession: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): SessionId {
    this.pool[sessionId.privateId] = newSession;
    return sessionId;
  }

  /** @missingRailsCall delete — PERMANENT */
  override deleteSession(
    _req: PersistedRequest,
    sessionId: SessionId,
    options: Record<string, unknown>,
  ): SessionId | null {
    delete this.pool[sessionId.publicId];
    delete this.pool[sessionId.privateId];
    if (!isTruthy(options["drop"])) return this.generateSid({ useMutex: false });
    return null;
  }

  /** @internal */
  getSessionWithFallback(sid: SessionId): Record<string, unknown> | undefined {
    return isTruthy(this.pool[sid.privateId])
      ? this.pool[sid.privateId]
      : isTruthy(this.allowFallback)
        ? this.pool[sid.publicId]
        : undefined;
  }
}

setRubyClassPath(Pool, "Rack::Session::Pool");
