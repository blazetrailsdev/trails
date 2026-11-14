import "./constants.generated.js";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Country, InvalidCountryCode } from "./country.js";
import { CountryTimezone } from "./country-timezone.js";
import { CountryDefiner } from "./format2/country-definer.js";
import { CountryIndexDefiner } from "./format2/country-index-definer.js";
import { TimezoneDefiner } from "./format2/timezone-definer.js";
import { TimezoneIndexDefiner } from "./format2/timezone-index-definer.js";
import { CountryIndexDefinition } from "./format2/country-index-definition.js";
import { TimezoneDefinition } from "./format2/timezone-definition.js";
import { TimezoneIndexDefinition } from "./format2/timezone-index-definition.js";
import { RubyDataSource, TZInfoDataNotFound } from "./data-sources/ruby-data-source.js";
import { StringDeduper, UnaryMinusGlobalStringDeduper } from "./string-deduper.js";
import { ConstantOffsetDataTimezoneInfo } from "./data-sources/constant-offset-data-timezone-info.js";
import { CountryInfo } from "./data-sources/country-info.js";
import { DataTimezoneInfo } from "./data-sources/data-timezone-info.js";
import { LinkedTimezoneInfo } from "./data-sources/linked-timezone-info.js";
import { TransitionsDataTimezoneInfo } from "./data-sources/transitions-data-timezone-info.js";
import { DataSource, DataSourceNotFound, InvalidDataSource } from "./data-source.js";
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

export { RubyDataSource, TZInfoDataNotFound } from "./data-sources/ruby-data-source.js";
export {
  AmbiguousTime,
  ConstantOffsetDataTimezoneInfo,
  Country,
  CountryInfo,
  CountryTimezone,
  DataSource,
  DataSourceNotFound,
  DataTimezone,
  DataTimezoneInfo,
  InfoTimezone,
  InvalidCountryCode,
  InvalidDataSource,
  InvalidTimezoneIdentifier,
  LinkedTimezoneInfo,
  OffsetTimezonePeriod,
  PeriodNotFound,
  Timestamp,
  Timezone,
  TimezoneInfo,
  TimezoneOffset,
  TimezonePeriod,
  TimezoneTransition,
  TransitionsDataTimezoneInfo,
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
  InvalidDataSource,
  DataSourceNotFound,
  DataSource,
  Country,
  CountryTimezone,
  StringDeduper,
  UnaryMinusGlobalStringDeduper,
  Format2: {
    CountryDefiner,
    CountryIndexDefiner,
    TimezoneDefiner,
    TimezoneIndexDefiner,
    CountryIndexDefinition,
    TimezoneDefinition,
    TimezoneIndexDefinition,
  },
  eagerLoadBang(): null {
    return DataSource.get().eagerLoadBang();
  },
  DataSources: {
    TimezoneInfo,
    DataTimezoneInfo,
    ConstantOffsetDataTimezoneInfo,
    LinkedTimezoneInfo,
    TransitionsDataTimezoneInfo,
    CountryInfo,
    RubyDataSource,
    TZInfoDataNotFound,
  },
  /** @noRailsEquivalent PERMANENT */
  loadPath: {} as Record<string, () => Promise<unknown>>,
};
constSet(TopLevel, "TZInfo", TZInfo);

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    TZInfo?: typeof TZInfo;
  }
}
