import type { Temporal as Polyfill } from "@js-temporal/polyfill";

declare global {
  var Temporal: typeof Polyfill;
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Temporal {
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
}

import Temporal = globalThis.Temporal;
export { Temporal };
import "./acts-like.js";
export {
  ArgumentError,
  Date,
  DateTime,
  cCivilToJd,
  dNewByFrags,
  dtNewByFrags,
  strftime,
  type DateParts,
  type StrftimeSubject,
} from "./date.js";
export { Time, Timezone, nowTimeZoneId, resetLocalTimeZoneId } from "./time.js";
export {
  tzdataBaseOffsets,
  tzdataIsdst,
  tzdataIsdstFlips,
  tzdataOffsetInstant,
} from "./tzdata-isdst.js";
export { tzdataAbbreviation, tzdataAbbreviationChanges } from "./tzdata-abbreviations.js";
import "./constants.generated.js";
