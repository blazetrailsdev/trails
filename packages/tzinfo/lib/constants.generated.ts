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
import * as m11 from "./format1/country-definer.js";
import * as m12 from "./format1/timezone-definer.js";
import * as m13 from "./format2/country-definer.js";
import * as m14 from "./format2/country-index-definer.js";
import * as m15 from "./format2/country-index-definition.js";
import * as m16 from "./format2/timezone-definer.js";
import * as m17 from "./format2/timezone-definition.js";
import * as m18 from "./format2/timezone-index-definer.js";
import * as m19 from "./format2/timezone-index-definition.js";
import * as m20 from "./info-timezone.js";
import * as m21 from "./linked-timezone.js";
import * as m22 from "./offset-timezone-period.js";
import * as m23 from "./string-deduper.js";
import * as m24 from "./timestamp.js";
import * as m25 from "./timezone-offset.js";
import * as m26 from "./timezone-period.js";
import * as m27 from "./timezone-proxy.js";
import * as m28 from "./timezone-transition.js";
import * as m29 from "./timezone.js";
import * as m30 from "./transitions-timezone-period.js";

defineConstants([
  [m11, "CountryDefiner", "Format1::CountryDefiner"],
  [m12, "TimezoneDefiner", "Format1::TimezoneDefiner"],
  [m29, "AmbiguousTime", "TZInfo::AmbiguousTime"],
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
  [m13, "CountryDefiner", "TZInfo::Format2::CountryDefiner"],
  [m14, "CountryIndexDefiner", "TZInfo::Format2::CountryIndexDefiner"],
  [m15, "CountryIndexDefinition", "TZInfo::Format2::CountryIndexDefinition"],
  [m15, "ClassMethods", "TZInfo::Format2::CountryIndexDefinition::ClassMethods"],
  [m16, "TimezoneDefiner", "TZInfo::Format2::TimezoneDefiner"],
  [m17, "TimezoneDefinition", "TZInfo::Format2::TimezoneDefinition"],
  [m17, "ClassMethods", "TZInfo::Format2::TimezoneDefinition::ClassMethods"],
  [m18, "TimezoneIndexDefiner", "TZInfo::Format2::TimezoneIndexDefiner"],
  [m19, "TimezoneIndexDefinition", "TZInfo::Format2::TimezoneIndexDefinition"],
  [m19, "ClassMethods", "TZInfo::Format2::TimezoneIndexDefinition::ClassMethods"],
  [m20, "InfoTimezone", "TZInfo::InfoTimezone"],
  [m1, "InvalidCountryCode", "TZInfo::InvalidCountryCode"],
  [m2, "InvalidDataSource", "TZInfo::InvalidDataSource"],
  [m29, "InvalidTimezoneIdentifier", "TZInfo::InvalidTimezoneIdentifier"],
  [m21, "LinkedTimezone", "TZInfo::LinkedTimezone"],
  [m22, "OffsetTimezonePeriod", "TZInfo::OffsetTimezonePeriod"],
  [m29, "PeriodNotFound", "TZInfo::PeriodNotFound"],
  [m23, "StringDeduper", "TZInfo::StringDeduper"],
  [m24, "Timestamp", "TZInfo::Timestamp"],
  [m29, "Timezone", "TZInfo::Timezone"],
  [m25, "TimezoneOffset", "TZInfo::TimezoneOffset"],
  [m26, "TimezonePeriod", "TZInfo::TimezonePeriod"],
  [m27, "TimezoneProxy", "TZInfo::TimezoneProxy"],
  [m28, "TimezoneTransition", "TZInfo::TimezoneTransition"],
  [m30, "TransitionsTimezonePeriod", "TZInfo::TransitionsTimezonePeriod"],
  [m23, "UnaryMinusGlobalStringDeduper", "TZInfo::UnaryMinusGlobalStringDeduper"],
  [m29, "UnknownTimezone", "TZInfo::UnknownTimezone"],
]);
