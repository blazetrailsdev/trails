import type { Temporal as Polyfill } from "@js-temporal/polyfill";

/** @noRailsEquivalent PERMANENT */
export const Temporal = (globalThis as unknown as { Temporal: typeof Polyfill }).Temporal;

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Temporal {
  type Duration = Polyfill.Duration;
  type DurationLike = Polyfill.DurationLike;
  type Instant = Polyfill.Instant;
  type PlainDate = Polyfill.PlainDate;
  type PlainDateTime = Polyfill.PlainDateTime;
  type PlainMonthDay = Polyfill.PlainMonthDay;
  type PlainTime = Polyfill.PlainTime;
  type PlainYearMonth = Polyfill.PlainYearMonth;
  type ToStringPrecisionOptions = Polyfill.ToStringPrecisionOptions;
  type ZonedDateTime = Polyfill.ZonedDateTime;
}
