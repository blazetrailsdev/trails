export class Event extends Base {
  static {
    this.attribute("starts_at", "datetime");
    this.attribute("starts_on", "date");
    this.attribute("duration", "time");
  }
}
export interface Event {
  get starts_at(): import("@blazetrails/date").Temporal.Instant | import("@blazetrails/date").Temporal.PlainDateTime;
  set starts_at(value: unknown);
  get starts_on(): import("@blazetrails/date").Temporal.PlainDate;
  set starts_on(value: unknown);
  get duration(): import("@blazetrails/date").Temporal.Instant | import("@blazetrails/activesupport").TimeWithZone;
  set duration(value: unknown);
}

