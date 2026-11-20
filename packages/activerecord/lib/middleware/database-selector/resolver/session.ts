import { Time } from "@blazetrails/date";
import { fixDiv, fixMod, type Hash } from "@blazetrails/ruby-compat";

export class Session {
  readonly session: Pick<Hash<string, unknown>, "get" | "set">;

  constructor(session: Pick<Hash<string, unknown>, "get" | "set">) {
    this.session = session;
  }

  static call(request: { session: Pick<Hash<string, unknown>, "get" | "set"> }): Session {
    return new Session(request.session);
  }

  static convertTimeToTimestamp(time: Time): number {
    return time.toI() * 1000 + fixDiv(time.usec, 1000);
  }

  static convertTimestampToTime(timestamp: number | null | undefined): Time {
    return timestamp != null
      ? Time.at(fixDiv(timestamp, 1000), fixMod(timestamp, 1000) * 1000)
      : Time.at(0);
  }

  async lastWriteTimestamp(): Promise<Time> {
    return Session.convertTimestampToTime(
      (await this.session.get("lastWrite")) as number | undefined,
    );
  }

  async updateLastWriteTimestamp(): Promise<number> {
    const lastWrite = Session.convertTimeToTimestamp(Time.now());
    await this.session.set("lastWrite", lastWrite);
    return lastWrite;
  }

  save(_response: unknown): void {}
}
