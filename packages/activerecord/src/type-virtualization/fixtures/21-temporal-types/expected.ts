export class Event extends Base {
  declare starts_at: import("@blazetrails/date").Temporal.Instant | import("@blazetrails/date").Temporal.PlainDateTime;
  declare starts_on: import("@blazetrails/date").Temporal.PlainDate;
  declare duration: import("@blazetrails/date").Temporal.PlainTime;

  static {
    this.attribute("starts_at", "datetime");
    this.attribute("starts_on", "date");
    this.attribute("duration", "time");
  }
}
