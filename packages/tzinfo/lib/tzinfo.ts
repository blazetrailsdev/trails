import "./constants.generated.js";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { InvalidCountryCode } from "./country.js";
import { ConstantOffsetDataTimezoneInfo } from "./data-sources/constant-offset-data-timezone-info.js";
import { AmbiguousTime, InvalidTimezoneIdentifier, PeriodNotFound, Timezone } from "./timezone.js";
import { TimezoneOffset } from "./timezone-offset.js";
import { TimezonePeriod } from "./timezone-period.js";
import { TimezoneTransition } from "./timezone-transition.js";

export {
  AmbiguousTime,
  ConstantOffsetDataTimezoneInfo,
  InvalidCountryCode,
  InvalidTimezoneIdentifier,
  PeriodNotFound,
  Timezone,
  TimezoneOffset,
  TimezonePeriod,
  TimezoneTransition,
};

export const TZInfo = {
  Timezone,
  DataTimezone: Timezone,
  TimezonePeriod,
  TimezoneOffset,
  TimezoneTransition,
  AmbiguousTime,
  PeriodNotFound,
  InvalidTimezoneIdentifier,
  InvalidCountryCode,
  DataSources: { ConstantOffsetDataTimezoneInfo },
  Data: { name: "TZInfo::Data" },
};
constSet(TopLevel, "TZInfo", TZInfo);
