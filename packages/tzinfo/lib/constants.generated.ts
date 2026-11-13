import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./country.js";
import * as m1 from "./data-source.js";
import * as m2 from "./data-sources/constant-offset-data-timezone-info.js";
import * as m3 from "./data-sources/country-info.js";
import * as m4 from "./data-sources/data-timezone-info.js";
import * as m5 from "./data-sources/linked-timezone-info.js";
import * as m6 from "./data-sources/timezone-info.js";
import * as m7 from "./data-sources/transitions-data-timezone-info.js";
import * as m8 from "./data-timezone.js";
import * as m9 from "./info-timezone.js";
import * as m10 from "./offset-timezone-period.js";
import * as m11 from "./timestamp.js";
import * as m12 from "./timezone-offset.js";
import * as m13 from "./timezone-period.js";
import * as m14 from "./timezone-transition.js";
import * as m15 from "./timezone.js";
import * as m16 from "./transitions-timezone-period.js";

defineConstants([
  [() => m15.AmbiguousTime, "TZInfo::AmbiguousTime"],
  [() => m1.DataSource, "TZInfo::DataSource"],
  [() => m1.DataSourceNotFound, "TZInfo::DataSourceNotFound"],
  [() => m2.ConstantOffsetDataTimezoneInfo, "TZInfo::DataSources::ConstantOffsetDataTimezoneInfo"],
  [() => m3.CountryInfo, "TZInfo::DataSources::CountryInfo"],
  [() => m4.DataTimezoneInfo, "TZInfo::DataSources::DataTimezoneInfo"],
  [() => m5.LinkedTimezoneInfo, "TZInfo::DataSources::LinkedTimezoneInfo"],
  [() => m6.TimezoneInfo, "TZInfo::DataSources::TimezoneInfo"],
  [() => m7.TransitionsDataTimezoneInfo, "TZInfo::DataSources::TransitionsDataTimezoneInfo"],
  [() => m8.DataTimezone, "TZInfo::DataTimezone"],
  [() => m9.InfoTimezone, "TZInfo::InfoTimezone"],
  [() => m0.InvalidCountryCode, "TZInfo::InvalidCountryCode"],
  [() => m1.InvalidDataSource, "TZInfo::InvalidDataSource"],
  [() => m15.InvalidTimezoneIdentifier, "TZInfo::InvalidTimezoneIdentifier"],
  [() => m10.OffsetTimezonePeriod, "TZInfo::OffsetTimezonePeriod"],
  [() => m15.PeriodNotFound, "TZInfo::PeriodNotFound"],
  [() => m11.Timestamp, "TZInfo::Timestamp"],
  [() => m15.Timezone, "TZInfo::Timezone"],
  [() => m12.TimezoneOffset, "TZInfo::TimezoneOffset"],
  [() => m13.TimezonePeriod, "TZInfo::TimezonePeriod"],
  [() => m14.TimezoneTransition, "TZInfo::TimezoneTransition"],
  [() => m16.TransitionsTimezonePeriod, "TZInfo::TransitionsTimezonePeriod"],
]);
