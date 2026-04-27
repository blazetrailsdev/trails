export class Event extends Base {
  declare starts_at: import("@blazetrails/activesupport/temporal").Temporal.Instant | import("@blazetrails/activesupport/temporal").Temporal.PlainDateTime;
  declare starts_on: import("@blazetrails/activesupport/temporal").Temporal.PlainDate;
  declare duration: import("@blazetrails/activesupport/temporal").Temporal.PlainTime;

  static {
    this.attribute("starts_at", "datetime");
    this.attribute("starts_on", "date");
    this.attribute("duration", "time");
  }
}
