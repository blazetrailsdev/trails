export class Event extends Base {
  static {
    this.attribute("starts_at", "datetime");
    this.attribute("starts_on", "date");
    this.attribute("duration", "time");
  }
}
export interface Event {
  get starts_at(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  set starts_at(value: import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time | string);
  starts_atPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  starts_atChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  starts_atChange(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  starts_atWillChange(): unknown;
  starts_atWas(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  starts_atPreviousChange(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  starts_atPreviouslyWas(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  restoreStarts_at(): void;
  clearStarts_atChange(): void;
  isSavedChangeToStarts_at(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToStarts_at(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  starts_atBeforeLastSave(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  isWillSaveChangeToStarts_at(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  starts_atChangeToBeSaved(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  starts_atInDatabase(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  get starts_on(): Temporal.PlainDate;
  set starts_on(value: Temporal.PlainDate | string | { toDate(): unknown });
  starts_onPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  starts_onChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  starts_onChange(): [Temporal.PlainDate, Temporal.PlainDate] | null;
  starts_onWillChange(): unknown;
  starts_onWas(): Temporal.PlainDate;
  starts_onPreviousChange(): [Temporal.PlainDate, Temporal.PlainDate] | null;
  starts_onPreviouslyWas(): Temporal.PlainDate;
  restoreStarts_on(): void;
  clearStarts_onChange(): void;
  isSavedChangeToStarts_on(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToStarts_on(): [Temporal.PlainDate, Temporal.PlainDate] | null;
  starts_onBeforeLastSave(): Temporal.PlainDate;
  isWillSaveChangeToStarts_on(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  starts_onChangeToBeSaved(): [Temporal.PlainDate, Temporal.PlainDate] | null;
  starts_onInDatabase(): Temporal.PlainDate;
  get duration(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  set duration(value: import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time | string);
  durationPreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  durationChanged(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  durationChange(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  durationWillChange(): unknown;
  durationWas(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  durationPreviousChange(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  durationPreviouslyWas(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  restoreDuration(): void;
  clearDurationChange(): void;
  isSavedChangeToDuration(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  savedChangeToDuration(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  durationBeforeLastSave(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
  isWillSaveChangeToDuration(options?: { from?: unknown; to?: unknown }): boolean | undefined;
  durationChangeToBeSaved(): [import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time, import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time] | null;
  durationInDatabase(): import("@blazetrails/activesupport").TimeWithZone | import("@blazetrails/date").Time;
}

