/**
 * Rack::Session::Pool
 *
 * Mirrors `rack-session-2.1.0/lib/rack/session/pool.rb`. Like the
 * `Persisted` / `PersistedSecure` base classes it sits beside in
 * `abstract-store.ts`, this class belongs to the `rack-session` gem rather
 * than to Rails; it is ported here because it is the store Rails' own
 * integration tests and `ActionDispatch::Session` fall back to when no
 * cookie-backed store is configured.
 *
 * Ruby's `@mutex.synchronize` has no JS analogue — a JS event loop runs one
 * body to completion — so the mutex is dropped and the bodies inside it are
 * kept verbatim.
 */

import type { RackApp } from "@blazetrails/rack";
import { DEFAULT_OPTIONS, PersistedSecure, SessionId } from "./abstract-store.js";

/** Rails: `class Pool < Abstract::PersistedSecure` (`pool.rb:26`). */
export class Pool extends PersistedSecure {
  /** Rails: `DEFAULT_OPTIONS = ...merge(drop: false, allow_fallback: true)` (`pool.rb:28`). */
  static override DEFAULT_OPTIONS: Readonly<Record<string, unknown>> = Object.freeze({
    ...DEFAULT_OPTIONS,
    drop: false,
    allowFallback: true,
  });

  readonly pool = new Map<string, Record<string, unknown>>();
  private allowFallback: unknown;

  constructor(app?: RackApp, options: Record<string, unknown> = {}) {
    super(app, options);
    this.allowFallback = this.defaultOptions["allowFallback"];
    delete this.defaultOptions["allowFallback"];
  }

  /** Rails: `generate_sid(*args, use_mutex: true)` (`pool.rb:37-42`). */
  override generateSid(secure?: unknown): SessionId {
    for (;;) {
      const sid = super.generateSid(secure);
      if (!this.pool.has(sid.privateId)) return sid;
    }
  }

  /** Rails: `find_session(req, sid)` (`pool.rb:44-52`). */
  override findSession(_req: unknown, sid: SessionId | null): [SessionId, Record<string, unknown>] {
    let session = sid ? this.getSessionWithFallback(sid) : undefined;
    if (!sid || !session) {
      sid = this.generateSid();
      session = {};
      this.pool.set(sid.privateId, session);
    }
    return [sid, session];
  }

  /** Rails: `write_session(req, session_id, new_session, options)` (`pool.rb:54-59`). */
  override writeSession(
    _req: unknown,
    sessionId: SessionId,
    newSession: Record<string, unknown>,
  ): SessionId {
    this.pool.set(sessionId.privateId, newSession);
    return sessionId;
  }

  /** Rails: `delete_session(req, session_id, options)` (`pool.rb:61-67`). */
  override deleteSession(
    _req: unknown,
    sessionId: SessionId,
    options: Record<string, unknown>,
  ): SessionId | undefined {
    this.pool.delete(sessionId.publicId);
    this.pool.delete(sessionId.privateId);
    return options["drop"] ? undefined : this.generateSid();
  }

  /** @internal Rails: `get_session_with_fallback(sid)` (`pool.rb:71-73`). */
  getSessionWithFallback(sid: SessionId): Record<string, unknown> | undefined {
    return (
      this.pool.get(sid.privateId) ?? (this.allowFallback ? this.pool.get(sid.publicId) : undefined)
    );
  }
}
