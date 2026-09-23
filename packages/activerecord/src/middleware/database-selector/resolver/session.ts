import { Temporal } from "@blazetrails/date";

/** @noRailsEquivalent CONVERGEABLE database-selector-session-typed-against-the-rack-session */
export interface SessionStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

export class Session {
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

  /** @missingRailsCall at — PERMANENT */
  static convertTimestampToTime(timestamp: number | undefined): Temporal.Instant {
    return Temporal.Instant.fromEpochMilliseconds(timestamp ?? 0);
  }

  lastWriteTimestamp(): Temporal.Instant {
    const raw = this.session.get("lastWrite");
    return Session.convertTimestampToTime(Number.isFinite(raw) ? (raw as number) : undefined);
  }

  updateLastWriteTimestamp(): number {
    const lastWrite = Session.convertTimeToTimestamp(Temporal.Now.instant());
    this.session.set("lastWrite", lastWrite);
    return lastWrite;
  }

  save(_response: unknown): void {}
}
