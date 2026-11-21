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
import * as m12 from "./format1/country-index-definition.js";
import * as m13 from "./format1/timezone-definer.js";
import * as m14 from "./format1/timezone-definition.js";
import * as m15 from "./format1/timezone-index-definition.js";
import * as m16 from "./format2/country-definer.js";
import * as m17 from "./format2/country-index-definer.js";
import * as m18 from "./format2/country-index-definition.js";
import * as m19 from "./format2/timezone-definer.js";
import * as m20 from "./format2/timezone-definition.js";
import * as m21 from "./format2/timezone-index-definer.js";
import * as m22 from "./format2/timezone-index-definition.js";
import * as m23 from "./info-timezone.js";
import * as m24 from "./linked-timezone.js";
import * as m25 from "./offset-timezone-period.js";
import * as m26 from "./string-deduper.js";
import * as m27 from "./timestamp.js";
import * as m28 from "./timezone-offset.js";
import * as m29 from "./timezone-period.js";
import * as m30 from "./timezone-proxy.js";
import * as m31 from "./timezone-transition.js";
import * as m32 from "./timezone.js";
import * as m33 from "./transitions-timezone-period.js";

defineConstants([
  [m26, "ConcurrentStringDeduper", "StringDeduper::ConcurrentStringDeduper"],
  [m32, "AmbiguousTime", "TZInfo::AmbiguousTime"],
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
  [m11, "CountryDefiner", "TZInfo::Format1::CountryDefiner"],
  [m12, "CountryIndexDefinition", "TZInfo::Format1::CountryIndexDefinition"],
  [m12, "ClassMethods", "TZInfo::Format1::CountryIndexDefinition::ClassMethods"],
  [m13, "TimezoneDefiner", "TZInfo::Format1::TimezoneDefiner"],
  [m14, "TimezoneDefinition", "TZInfo::Format1::TimezoneDefinition"],
  [m14, "ClassMethods", "TZInfo::Format1::TimezoneDefinition::ClassMethods"],
  [m15, "TimezoneIndexDefinition", "TZInfo::Format1::TimezoneIndexDefinition"],
  [m15, "ClassMethods", "TZInfo::Format1::TimezoneIndexDefinition::ClassMethods"],
  [m16, "CountryDefiner", "TZInfo::Format2::CountryDefiner"],
  [m17, "CountryIndexDefiner", "TZInfo::Format2::CountryIndexDefiner"],
  [m18, "CountryIndexDefinition", "TZInfo::Format2::CountryIndexDefinition"],
  [m18, "ClassMethods", "TZInfo::Format2::CountryIndexDefinition::ClassMethods"],
  [m19, "TimezoneDefiner", "TZInfo::Format2::TimezoneDefiner"],
  [m20, "TimezoneDefinition", "TZInfo::Format2::TimezoneDefinition"],
  [m20, "ClassMethods", "TZInfo::Format2::TimezoneDefinition::ClassMethods"],
  [m21, "TimezoneIndexDefiner", "TZInfo::Format2::TimezoneIndexDefiner"],
  [m22, "TimezoneIndexDefinition", "TZInfo::Format2::TimezoneIndexDefinition"],
  [m22, "ClassMethods", "TZInfo::Format2::TimezoneIndexDefinition::ClassMethods"],
  [m23, "InfoTimezone", "TZInfo::InfoTimezone"],
  [m1, "InvalidCountryCode", "TZInfo::InvalidCountryCode"],
  [m2, "InvalidDataSource", "TZInfo::InvalidDataSource"],
  [m32, "InvalidTimezoneIdentifier", "TZInfo::InvalidTimezoneIdentifier"],
  [m24, "LinkedTimezone", "TZInfo::LinkedTimezone"],
  [m25, "OffsetTimezonePeriod", "TZInfo::OffsetTimezonePeriod"],
  [m32, "PeriodNotFound", "TZInfo::PeriodNotFound"],
  [m26, "StringDeduper", "TZInfo::StringDeduper"],
  [m27, "Timestamp", "TZInfo::Timestamp"],
  [m32, "Timezone", "TZInfo::Timezone"],
  [m28, "TimezoneOffset", "TZInfo::TimezoneOffset"],
  [m29, "TimezonePeriod", "TZInfo::TimezonePeriod"],
  [m30, "TimezoneProxy", "TZInfo::TimezoneProxy"],
  [m31, "TimezoneTransition", "TZInfo::TimezoneTransition"],
  [m33, "TransitionsTimezonePeriod", "TZInfo::TransitionsTimezonePeriod"],
  [m26, "UnaryMinusGlobalStringDeduper", "TZInfo::UnaryMinusGlobalStringDeduper"],
  [m32, "UnknownTimezone", "TZInfo::UnknownTimezone"],
]);
