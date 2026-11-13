import "./constants.generated.js";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { InvalidCountryCode } from "./country.js";
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

export {
  AmbiguousTime,
  ConstantOffsetDataTimezoneInfo,
  CountryInfo,
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
  },
};
constSet(TopLevel, "TZInfo", TZInfo);

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    TZInfo?: typeof TZInfo;
  }
}
