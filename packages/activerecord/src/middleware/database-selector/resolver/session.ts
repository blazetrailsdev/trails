import { Temporal } from "@blazetrails/date";
import type { Hash } from "@blazetrails/ruby-compat";

export class Session {
  readonly session: Pick<Hash<string, unknown>, "get" | "set">;

  constructor(session: Pick<Hash<string, unknown>, "get" | "set">) {
    this.session = session;
  }

  static call(request: { session: Pick<Hash<string, unknown>, "get" | "set"> }): Session {
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
    return Session.convertTimestampToTime(this.session.get("lastWrite") as number | undefined);
  }

  /** @missingRailsName now — PERMANENT */
  updateLastWriteTimestamp(): number {
    const lastWrite = Session.convertTimeToTimestamp(Temporal.Now.instant());
    this.session.set("lastWrite", lastWrite);
    return lastWrite;
  }

  save(_response: unknown): void {}
}
