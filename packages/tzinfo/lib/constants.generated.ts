import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./country.js";
import * as m1 from "./data-sources/constant-offset-data-timezone-info.js";
import * as m2 from "./data-sources/data-timezone-info.js";
import * as m3 from "./data-sources/timezone-info.js";
import * as m4 from "./data-timezone.js";
import * as m5 from "./info-timezone.js";
import * as m6 from "./offset-timezone-period.js";
import * as m7 from "./timestamp.js";
import * as m8 from "./timezone-offset.js";
import * as m9 from "./timezone-period.js";
import * as m10 from "./timezone-transition.js";
import * as m11 from "./timezone.js";
import * as m12 from "./transitions-timezone-period.js";

defineConstants([
  [() => m11.AmbiguousTime, "TZInfo::AmbiguousTime"],
  [() => m1.ConstantOffsetDataTimezoneInfo, "TZInfo::DataSources::ConstantOffsetDataTimezoneInfo"],
  [() => m2.DataTimezoneInfo, "TZInfo::DataSources::DataTimezoneInfo"],
  [() => m3.TimezoneInfo, "TZInfo::DataSources::TimezoneInfo"],
  [() => m4.DataTimezone, "TZInfo::DataTimezone"],
  [() => m5.InfoTimezone, "TZInfo::InfoTimezone"],
  [() => m0.InvalidCountryCode, "TZInfo::InvalidCountryCode"],
  [() => m11.InvalidTimezoneIdentifier, "TZInfo::InvalidTimezoneIdentifier"],
  [() => m6.OffsetTimezonePeriod, "TZInfo::OffsetTimezonePeriod"],
  [() => m11.PeriodNotFound, "TZInfo::PeriodNotFound"],
  [() => m7.Timestamp, "TZInfo::Timestamp"],
  [() => m11.Timezone, "TZInfo::Timezone"],
  [() => m8.TimezoneOffset, "TZInfo::TimezoneOffset"],
  [() => m9.TimezonePeriod, "TZInfo::TimezonePeriod"],
  [() => m10.TimezoneTransition, "TZInfo::TimezoneTransition"],
  [() => m12.TransitionsTimezonePeriod, "TZInfo::TransitionsTimezonePeriod"],
]);
