import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./country.js";
import * as m1 from "./data-sources/constant-offset-data-timezone-info.js";
import * as m2 from "./timestamp.js";
import * as m3 from "./timezone-offset.js";
import * as m4 from "./timezone-period.js";
import * as m5 from "./timezone-transition.js";
import * as m6 from "./timezone.js";

defineConstants([
  [() => m6.AmbiguousTime, "TZInfo::AmbiguousTime"],
  [() => m1.ConstantOffsetDataTimezoneInfo, "TZInfo::DataSources::ConstantOffsetDataTimezoneInfo"],
  [() => m0.InvalidCountryCode, "TZInfo::InvalidCountryCode"],
  [() => m6.InvalidTimezoneIdentifier, "TZInfo::InvalidTimezoneIdentifier"],
  [() => m6.PeriodNotFound, "TZInfo::PeriodNotFound"],
  [() => m2.Timestamp, "TZInfo::Timestamp"],
  [() => m6.Timezone, "TZInfo::Timezone"],
  [() => m3.TimezoneOffset, "TZInfo::TimezoneOffset"],
  [() => m4.TimezonePeriod, "TZInfo::TimezonePeriod"],
  [() => m5.TimezoneTransition, "TZInfo::TimezoneTransition"],
]);
