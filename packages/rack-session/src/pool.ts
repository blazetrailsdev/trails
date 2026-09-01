import type { RackApp } from "@blazetrails/rack";

import {
  DEFAULT_OPTIONS as ID_DEFAULT_OPTIONS,
  PersistedSecure,
  type PersistedRequest,
  type SessionOptions,
  SessionId,
} from "./abstract/id.js";

export class Pool extends PersistedSecure {
  pool: Record<string, Record<string, unknown>> = {};

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

  /** @missingRailsCall key? — PERMANENT */
  override generateSid({ useMutex = true }: { useMutex?: boolean } = {}): SessionId {
    void useMutex;
    for (;;) {
      const sid = super.generateSid();
      if (!Object.hasOwn(this.pool, sid.privateId)) return sid;
    }
  }

  /** @missingRailsCall store — PERMANENT */
  override findSession(
    req: PersistedRequest,
    sid: SessionId | null,
  ): [SessionId, Record<string, unknown>] {
    void req;
    let session = sid != null ? this.getSessionWithFallback(sid) : undefined;
    if (sid == null || session == null) {
      sid = this.generateSid({ useMutex: false });
      session = {};
      this.pool[sid.privateId] = session;
    }
    return [sid, session];
  }

  /** @missingRailsCall store — PERMANENT */
  override writeSession(
    req: PersistedRequest,
    sessionId: SessionId,
    newSession: Record<string, unknown>,
    options: SessionOptions,
  ): SessionId {
    void req;
    void options;
    this.pool[sessionId.privateId] = newSession;
    return sessionId;
  }

  /** @missingRailsCall delete — PERMANENT */
  override deleteSession(
    req: PersistedRequest,
    sessionId: SessionId,
    options: SessionOptions,
  ): SessionId | undefined {
    void req;
    delete this.pool[sessionId.publicId];
    delete this.pool[sessionId.privateId];
    if (!(options.get("drop") != null && options.get("drop") !== false)) {
      return this.generateSid({ useMutex: false });
    }
    return undefined;
  }

  /** @internal */
  getSessionWithFallback(sid: SessionId): Record<string, unknown> | undefined {
    return (
      this.pool[sid.privateId] ??
      (this.allowFallback != null && this.allowFallback !== false
        ? this.pool[sid.publicId]
        : undefined)
    );
  }
}
