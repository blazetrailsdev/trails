# @blazetrails/tzinfo

A stand-in for the [tzinfo](https://github.com/tzinfo/tzinfo) 2.x gem: the
`Timezone` / `TimezonePeriod` surface ActiveSupport::TimeZone reads, answered
from `Intl` and the tzdata `@blazetrails/date` carries.

**This package is not API-compared.** tzinfo is not vendored: its Ruby body is a
tzdata reader (`DataSources::ZoneinfoDataSource`, `RubyDataSource`), which the
JS runtime's `Intl` already is, so a line-for-line port would duplicate the
runtime's zone database rather than mirror a Rails body. Members keep tzinfo's
names (`period_for_local`, `local_to_utc`, `observed_utc_offset`) camelCased.
