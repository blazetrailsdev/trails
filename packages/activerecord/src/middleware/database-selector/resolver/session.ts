/**
 * Mirrors: ActiveRecord::Middleware::DatabaseSelector::Resolver::Session
 */

import { Temporal } from "@blazetrails/date";

/**
 * The duck type `Resolver::Session` requires of `request.session` — Rails
 * calls `session[]`/`session[]=`/`session.delete` bare, naming no constant.
 *
 * @noRailsEquivalent PERMANENT — name collision only. Ruby's `SessionStore`
 * (`ActionController::RequestForgeryProtection::SessionStore`) is the CSRF
 * token store strategy, unrelated to this session-hash shape.
 */
export interface SessionStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export class Session {
  /** @internal */
  readonly session: SessionStore;

  constructor(session: SessionStore) {
    this.session = session;
  }

  static call(request: { session: SessionStore }): Session {
    return new Session(request.session);
  }

  static convertTimeToTimestamp(time: Temporal.Instant): number {
    return time.epochMilliseconds;
  }

  /**
   * @missingRailsCall at — PERMANENT: Verified per-site (RFC 0106): `Time.at(timestamp /
   *   1000, (timestamp % 1000) * 1000)` (`resolver/session.rb:25`) — trails'
   *   time type is `Temporal.Instant`, whose epoch constructor is
   *   `fromEpochMilliseconds`; there is no `at` to call.
   */
  static convertTimestampToTime(timestamp: number | undefined): Temporal.Instant {
    return Temporal.Instant.fromEpochMilliseconds(timestamp ?? 0);
  }

  lastWriteTimestamp(): Temporal.Instant {
    const raw = this.session.get("lastWrite");
    // Non-numeric/NaN session value → epoch 0 → "very long ago" → time_since_last_write_ok? is true → route to replica.
    return Session.convertTimestampToTime(Number.isFinite(raw) ? (raw as number) : undefined);
  }

  updateLastWriteTimestamp(): void {
    this.session.set("lastWrite", Session.convertTimeToTimestamp(Temporal.Now.instant()));
  }

  save(_response: unknown): void {}
}
