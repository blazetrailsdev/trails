import { DateTime, strftime } from "@blazetrails/date";
import { ArgumentError, rbObjAsString, warn } from "@blazetrails/ruby-compat";
import { ReceivedParser } from "../parsers/received-parser.js";
import { Utilities } from "../utilities.js";

export class ReceivedElement {
  info: string | null;
  dateTime: ReturnType<typeof DateTime.parse> | null;

  constructor(string: string | null) {
    if (Utilities.isBlank(string)) {
      this.dateTime = null;
      this.info = null;
    } else {
      const received = ReceivedParser.parse(string);
      this.dateTime = this.datetimeFor(received);
      this.info = received.info;
    }
  }

  toString(..._args: unknown[]): string {
    const dateTime = this.dateTime == null ? "" : strftime(this.dateTime, "%Y-%m-%dT%H:%M:%S%:z");
    return `${rbObjAsString(this.info)}; ${dateTime}`;
  }

  /** @internal */
  private datetimeFor(received: {
    date: string;
    time: string;
  }): ReturnType<typeof DateTime.parse> | null {
    try {
      return DateTime.parse(`${received.date} ${received.time}`);
    } catch (e) {
      if (!(e instanceof ArgumentError)) throw e;
      if (e.message !== "invalid date") throw e;
      warn(
        `WARNING: Invalid date field for received element (${received.date} ${received.time}): ${e.constructor.name}: ${e.message}`,
      );
      return null;
    }
  }
}
