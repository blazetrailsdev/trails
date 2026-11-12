import "./constants.generated.js";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { InvalidCountryCode } from "./country.js";
import { ConstantOffsetDataTimezoneInfo } from "./data-sources/constant-offset-data-timezone-info.js";
import { DataTimezoneInfo } from "./data-sources/data-timezone-info.js";
import { TimezoneInfo } from "./data-sources/timezone-info.js";
import { DataTimezone } from "./data-timezone.js";
import { InfoTimezone } from "./info-timezone.js";
import { AmbiguousTime, InvalidTimezoneIdentifier, PeriodNotFound, Timezone } from "./timezone.js";
import { OffsetTimezonePeriod } from "./offset-timezone-period.js";
import { TimezoneOffset } from "./timezone-offset.js";
import { TimezonePeriod } from "./timezone-period.js";
import { TimezoneTransition } from "./timezone-transition.js";
import { Timestamp } from "./timestamp.js";
import { TransitionsTimezonePeriod } from "./transitions-timezone-period.js";

export {
  AmbiguousTime,
  ConstantOffsetDataTimezoneInfo,
  DataTimezone,
  DataTimezoneInfo,
  InfoTimezone,
  InvalidCountryCode,
  InvalidTimezoneIdentifier,
  OffsetTimezonePeriod,
  PeriodNotFound,
  Timestamp,
  Timezone,
  TimezoneInfo,
  TimezoneOffset,
  TimezonePeriod,
  TimezoneTransition,
  TransitionsTimezonePeriod,
};

export const TZInfo = {
  Timestamp,
  Timezone,
  InfoTimezone,
  DataTimezone,
  TimezonePeriod,
  OffsetTimezonePeriod,
  TransitionsTimezonePeriod,
  TimezoneOffset,
  TimezoneTransition,
  AmbiguousTime,
  PeriodNotFound,
  InvalidTimezoneIdentifier,
  InvalidCountryCode,
  DataSources: { TimezoneInfo, DataTimezoneInfo, ConstantOffsetDataTimezoneInfo },
};
constSet(TopLevel, "TZInfo", TZInfo);

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    TZInfo?: typeof TZInfo;
  }
}
