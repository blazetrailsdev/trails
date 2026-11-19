import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./country-timezone.js";
import * as m1 from "./country.js";
import * as m2 from "./data-source.js";
import * as m3 from "./data-sources/constant-offset-data-timezone-info.js";
import * as m4 from "./data-sources/country-info.js";
import * as m5 from "./data-sources/data-timezone-info.js";
import * as m6 from "./data-sources/linked-timezone-info.js";
import * as m7 from "./data-sources/ruby-data-source.js";
import * as m8 from "./data-sources/timezone-info.js";
import * as m9 from "./data-sources/transitions-data-timezone-info.js";
import * as m10 from "./data-timezone.js";
import * as m11 from "./format2/country-definer.js";
import * as m12 from "./format2/country-index-definer.js";
import * as m13 from "./format2/country-index-definition.js";
import * as m14 from "./format2/timezone-definer.js";
import * as m15 from "./format2/timezone-definition.js";
import * as m16 from "./format2/timezone-index-definer.js";
import * as m17 from "./format2/timezone-index-definition.js";
import * as m18 from "./info-timezone.js";
import * as m19 from "./linked-timezone.js";
import * as m20 from "./offset-timezone-period.js";
import * as m21 from "./string-deduper.js";
import * as m22 from "./timestamp.js";
import * as m23 from "./timezone-offset.js";
import * as m24 from "./timezone-period.js";
import * as m25 from "./timezone-proxy.js";
import * as m26 from "./timezone-transition.js";
import * as m27 from "./timezone.js";
import * as m28 from "./transitions-timezone-period.js";

defineConstants([
  [m27, "AmbiguousTime", "TZInfo::AmbiguousTime"],
  [m1, "Country", "TZInfo::Country"],
  [m0, "CountryTimezone", "TZInfo::CountryTimezone"],
  [m2, "DataSource", "TZInfo::DataSource"],
  [m2, "DataSourceNotFound", "TZInfo::DataSourceNotFound"],
  [m3, "ConstantOffsetDataTimezoneInfo", "TZInfo::DataSources::ConstantOffsetDataTimezoneInfo"],
  [m4, "CountryInfo", "TZInfo::DataSources::CountryInfo"],
  [m5, "DataTimezoneInfo", "TZInfo::DataSources::DataTimezoneInfo"],
  [m6, "LinkedTimezoneInfo", "TZInfo::DataSources::LinkedTimezoneInfo"],
  [m7, "RubyDataSource", "TZInfo::DataSources::RubyDataSource"],
  [m8, "TimezoneInfo", "TZInfo::DataSources::TimezoneInfo"],
  [m9, "TransitionsDataTimezoneInfo", "TZInfo::DataSources::TransitionsDataTimezoneInfo"],
  [m7, "TZInfoDataNotFound", "TZInfo::DataSources::TZInfoDataNotFound"],
  [m10, "DataTimezone", "TZInfo::DataTimezone"],
  [m11, "CountryDefiner", "TZInfo::Format2::CountryDefiner"],
  [m12, "CountryIndexDefiner", "TZInfo::Format2::CountryIndexDefiner"],
  [m13, "CountryIndexDefinition", "TZInfo::Format2::CountryIndexDefinition"],
  [m13, "ClassMethods", "TZInfo::Format2::CountryIndexDefinition::ClassMethods"],
  [m14, "TimezoneDefiner", "TZInfo::Format2::TimezoneDefiner"],
  [m15, "TimezoneDefinition", "TZInfo::Format2::TimezoneDefinition"],
  [m15, "ClassMethods", "TZInfo::Format2::TimezoneDefinition::ClassMethods"],
  [m16, "TimezoneIndexDefiner", "TZInfo::Format2::TimezoneIndexDefiner"],
  [m17, "TimezoneIndexDefinition", "TZInfo::Format2::TimezoneIndexDefinition"],
  [m17, "ClassMethods", "TZInfo::Format2::TimezoneIndexDefinition::ClassMethods"],
  [m18, "InfoTimezone", "TZInfo::InfoTimezone"],
  [m1, "InvalidCountryCode", "TZInfo::InvalidCountryCode"],
  [m2, "InvalidDataSource", "TZInfo::InvalidDataSource"],
  [m27, "InvalidTimezoneIdentifier", "TZInfo::InvalidTimezoneIdentifier"],
  [m19, "LinkedTimezone", "TZInfo::LinkedTimezone"],
  [m20, "OffsetTimezonePeriod", "TZInfo::OffsetTimezonePeriod"],
  [m27, "PeriodNotFound", "TZInfo::PeriodNotFound"],
  [m21, "StringDeduper", "TZInfo::StringDeduper"],
  [m22, "Timestamp", "TZInfo::Timestamp"],
  [m27, "Timezone", "TZInfo::Timezone"],
  [m23, "TimezoneOffset", "TZInfo::TimezoneOffset"],
  [m24, "TimezonePeriod", "TZInfo::TimezonePeriod"],
  [m25, "TimezoneProxy", "TZInfo::TimezoneProxy"],
  [m26, "TimezoneTransition", "TZInfo::TimezoneTransition"],
  [m28, "TransitionsTimezonePeriod", "TZInfo::TransitionsTimezonePeriod"],
  [m21, "UnaryMinusGlobalStringDeduper", "TZInfo::UnaryMinusGlobalStringDeduper"],
  [m27, "UnknownTimezone", "TZInfo::UnknownTimezone"],
]);
