import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./country.js";
import * as m1 from "./data-sources/constant-offset-data-timezone-info.js";
import * as m2 from "./timezone-offset.js";
import * as m3 from "./timezone-period.js";
import * as m4 from "./timezone-transition.js";
import * as m5 from "./timezone.js";

defineConstants([
  [() => m5.AmbiguousTime, "TZInfo::AmbiguousTime"],
  [() => m1.ConstantOffsetDataTimezoneInfo, "TZInfo::DataSources::ConstantOffsetDataTimezoneInfo"],
  [() => m0.InvalidCountryCode, "TZInfo::InvalidCountryCode"],
  [() => m5.InvalidTimezoneIdentifier, "TZInfo::InvalidTimezoneIdentifier"],
  [() => m5.PeriodNotFound, "TZInfo::PeriodNotFound"],
  [() => m5.Timezone, "TZInfo::Timezone"],
  [() => m2.TimezoneOffset, "TZInfo::TimezoneOffset"],
  [() => m3.TimezonePeriod, "TZInfo::TimezonePeriod"],
  [() => m4.TimezoneTransition, "TZInfo::TimezoneTransition"],
]);
