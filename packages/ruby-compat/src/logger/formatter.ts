import { sprintf } from "../kernel-format.js";
import { TEMPORAL_METHOD_TABLE, rbInspect } from "../object.js";
import { Process } from "../process.js";

/**
 * Ruby stdlib `Logger::Formatter` (`vendor/ruby/v3.3.11/lib/logger/formatter.rb:5`).
 * A Ruby Time is a JS `Date` here, whose `strftime` the date package seats.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Formatter {
  /** @noRailsEquivalent PERMANENT */
  static readonly Format = "%.1s, [%s #%d] %5s -- %s: %s\n";
  /** @noRailsEquivalent PERMANENT */
  static readonly DatetimeFormat = "%Y-%m-%dT%H:%M:%S.%6N";

  /** @noRailsEquivalent PERMANENT */
  datetimeFormat: string | null;

  /** @noRailsEquivalent PERMANENT */
  constructor() {
    this.datetimeFormat = null;
  }

  /** @noRailsEquivalent PERMANENT */
  call(severity: string, time: Date, progname: unknown, msg: unknown): string {
    return sprintf(
      Formatter.Format,
      severity,
      this.formatDatetime(time),
      Process.pid,
      severity,
      progname,
      this.msg2str(msg),
    );
  }

  private formatDatetime(time: Date): string {
    const strftime = TEMPORAL_METHOD_TABLE.Date.strftime as (time: Date, format: string) => string;
    return strftime(time, this.datetimeFormat ?? Formatter.DatetimeFormat);
  }

  private msg2str(msg: unknown): string {
    if (typeof msg === "string") {
      return msg;
    } else if (msg instanceof Error) {
      return `${msg.message} (${msg.constructor.name})\n${msg.stack ?? ""}`;
    } else {
      return rbInspect(msg);
    }
  }
}
