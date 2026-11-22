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
import { CountryDefiner as Format1CountryDefiner } from "./format1/country-definer.js";
import { TimezoneDefiner as Format1TimezoneDefiner } from "./format1/timezone-definer.js";
import { CountryIndexDefinition as Format1CountryIndexDefinition } from "./format1/country-index-definition.js";
import { TimezoneDefinition as Format1TimezoneDefinition } from "./format1/timezone-definition.js";
import { TimezoneIndexDefinition as Format1TimezoneIndexDefinition } from "./format1/timezone-index-definition.js";
import { RubyDataSource, TZInfoDataNotFound } from "./data-sources/ruby-data-source.js";
import {
  ConcurrentStringDeduper,
  StringDeduper,
  UnaryMinusGlobalStringDeduper,
} from "./string-deduper.js";
import { ConstantOffsetDataTimezoneInfo } from "./data-sources/constant-offset-data-timezone-info.js";
import { CountryInfo } from "./data-sources/country-info.js";
import { DataTimezoneInfo } from "./data-sources/data-timezone-info.js";
import { LinkedTimezoneInfo } from "./data-sources/linked-timezone-info.js";
import { TransitionsDataTimezoneInfo } from "./data-sources/transitions-data-timezone-info.js";
import { DataSource, DataSourceNotFound, InvalidDataSource } from "./data-source.js";
import { TimezoneInfo } from "./data-sources/timezone-info.js";
import { DataTimezone } from "./data-timezone.js";
import { InfoTimezone } from "./info-timezone.js";
import { LinkedTimezone } from "./linked-timezone.js";
import { TimezoneProxy } from "./timezone-proxy.js";
import {
  AmbiguousTime,
  InvalidTimezoneIdentifier,
  PeriodNotFound,
  Timezone,
  UnknownTimezone,
} from "./timezone.js";
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
  LinkedTimezone,
  LinkedTimezoneInfo,
  OffsetTimezonePeriod,
  PeriodNotFound,
  Timestamp,
  Timezone,
  TimezoneInfo,
  TimezoneOffset,
  TimezonePeriod,
  TimezoneProxy,
  TimezoneTransition,
  TransitionsDataTimezoneInfo,
  TransitionsTimezonePeriod,
  UnknownTimezone,
};

export const TZInfo = {
  Timestamp,
  Timezone,
  InfoTimezone,
  DataTimezone,
  LinkedTimezone,
  TimezoneProxy,
  TimezonePeriod,
  OffsetTimezonePeriod,
  TransitionsTimezonePeriod,
  TimezoneOffset,
  TimezoneTransition,
  AmbiguousTime,
  PeriodNotFound,
  InvalidTimezoneIdentifier,
  UnknownTimezone,
  InvalidCountryCode,
  InvalidDataSource,
  DataSourceNotFound,
  DataSource,
  Country,
  CountryTimezone,
  StringDeduper,
  ConcurrentStringDeduper,
  UnaryMinusGlobalStringDeduper,
  Format1: {
    CountryDefiner: Format1CountryDefiner,
    TimezoneDefiner: Format1TimezoneDefiner,
    CountryIndexDefinition: Format1CountryIndexDefinition,
    TimezoneDefinition: Format1TimezoneDefinition,
    TimezoneIndexDefinition: Format1TimezoneIndexDefinition,
  },
  CountryIndexDefinition: Format1CountryIndexDefinition,
  TimezoneDefinition: Format1TimezoneDefinition,
  TimezoneIndexDefinition: Format1TimezoneIndexDefinition,
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
