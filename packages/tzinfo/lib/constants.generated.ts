import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./country-timezone.js";
import * as m1 from "./country.js";
import * as m2 from "./data-source.js";
import * as m3 from "./data-sources/constant-offset-data-timezone-info.js";
import * as m4 from "./data-sources/country-info.js";
import * as m5 from "./data-sources/data-timezone-info.js";
import * as m6 from "./data-sources/linked-timezone-info.js";
import * as m7 from "./data-sources/timezone-info.js";
import * as m8 from "./data-sources/transitions-data-timezone-info.js";
import * as m9 from "./data-timezone.js";
import * as m10 from "./format2/country-definer.js";
import * as m11 from "./format2/country-index-definer.js";
import * as m12 from "./format2/timezone-definer.js";
import * as m13 from "./format2/timezone-index-definer.js";
import * as m14 from "./info-timezone.js";
import * as m15 from "./offset-timezone-period.js";
import * as m16 from "./string-deduper.js";
import * as m17 from "./timestamp.js";
import * as m18 from "./timezone-offset.js";
import * as m19 from "./timezone-period.js";
import * as m20 from "./timezone-transition.js";
import * as m21 from "./timezone.js";
import * as m22 from "./transitions-timezone-period.js";

defineConstants([
  [() => m21.AmbiguousTime, "TZInfo::AmbiguousTime"],
  [() => m0.CountryTimezone, "TZInfo::CountryTimezone"],
  [() => m2.DataSource, "TZInfo::DataSource"],
  [() => m2.DataSourceNotFound, "TZInfo::DataSourceNotFound"],
  [() => m3.ConstantOffsetDataTimezoneInfo, "TZInfo::DataSources::ConstantOffsetDataTimezoneInfo"],
  [() => m4.CountryInfo, "TZInfo::DataSources::CountryInfo"],
  [() => m5.DataTimezoneInfo, "TZInfo::DataSources::DataTimezoneInfo"],
  [() => m6.LinkedTimezoneInfo, "TZInfo::DataSources::LinkedTimezoneInfo"],
  [() => m7.TimezoneInfo, "TZInfo::DataSources::TimezoneInfo"],
  [() => m8.TransitionsDataTimezoneInfo, "TZInfo::DataSources::TransitionsDataTimezoneInfo"],
  [() => m9.DataTimezone, "TZInfo::DataTimezone"],
  [() => m10.CountryDefiner, "TZInfo::Format2::CountryDefiner"],
  [() => m11.CountryIndexDefiner, "TZInfo::Format2::CountryIndexDefiner"],
  [() => m12.TimezoneDefiner, "TZInfo::Format2::TimezoneDefiner"],
  [() => m13.TimezoneIndexDefiner, "TZInfo::Format2::TimezoneIndexDefiner"],
  [() => m14.InfoTimezone, "TZInfo::InfoTimezone"],
  [() => m1.InvalidCountryCode, "TZInfo::InvalidCountryCode"],
  [() => m2.InvalidDataSource, "TZInfo::InvalidDataSource"],
  [() => m21.InvalidTimezoneIdentifier, "TZInfo::InvalidTimezoneIdentifier"],
  [() => m15.OffsetTimezonePeriod, "TZInfo::OffsetTimezonePeriod"],
  [() => m21.PeriodNotFound, "TZInfo::PeriodNotFound"],
  [() => m16.StringDeduper, "TZInfo::StringDeduper"],
  [() => m17.Timestamp, "TZInfo::Timestamp"],
  [() => m21.Timezone, "TZInfo::Timezone"],
  [() => m18.TimezoneOffset, "TZInfo::TimezoneOffset"],
  [() => m19.TimezonePeriod, "TZInfo::TimezonePeriod"],
  [() => m20.TimezoneTransition, "TZInfo::TimezoneTransition"],
  [() => m22.TransitionsTimezonePeriod, "TZInfo::TransitionsTimezonePeriod"],
  [() => m16.UnaryMinusGlobalStringDeduper, "TZInfo::UnaryMinusGlobalStringDeduper"],
]);
