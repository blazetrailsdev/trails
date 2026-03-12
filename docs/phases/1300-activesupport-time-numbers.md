# Phase 1300: ActiveSupport — Time, Duration, Numbers

**Goal**: Implement time manipulation and numeric utilities. These are among
the most beloved parts of ActiveSupport.

## Duration

The `5.days`, `2.hours.ago` pattern from Rails.

### API to implement

```typescript
// Factory functions (since TS doesn't have monkey-patching)
duration(5, "days"); // or: days(5), hours(2), minutes(30)
days(5).ago(); // Date in the past
hours(2).fromNow(); // Date in the future
days(5).since(date); // Date relative to another date
days(5).until(date); // Date relative to another date
```

### Duration arithmetic

- `add(other)` / `subtract(other)`
- `toSeconds()` / `toMinutes()` / `toHours()` / `toDays()`
- `iso8601()` — `"P5D"` format
- `Duration.parse(iso8601String)`

### Duration parts

- `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds`
- Compound durations: `days(1).and(hours(12))`

### Key Rails reference

- `activesupport/lib/active_support/duration.rb`
- `activesupport/test/duration_test.rb` (~100 tests)

## Time extensions

### Methods to implement

- `beginningOfDay()` / `endOfDay()`
- `beginningOfWeek()` / `endOfWeek()`
- `beginningOfMonth()` / `endOfMonth()`
- `beginningOfYear()` / `endOfYear()`
- `nextWeek()` / `prevWeek()`
- `nextMonth()` / `prevMonth()`
- `advance({ years, months, days, hours, minutes, seconds })`
- `ago(duration)` / `since(duration)` / `in(duration)`

### TimeZone support ✓

- `TimeZone` class with IANA timezone database (150+ Rails name mappings)
- `TimeWithZone` class — timezone-aware time with DST handling
- `inTimeZone(zone)` — convert between zones
- Named zones: `"Eastern Time (US & Canada)"` etc.
- 203 passing tests ported from Rails test suite

### Key Rails reference

- `activesupport/test/core_ext/time_ext_test.rb`
- `activesupport/test/time_zone_test.rb`

## Numeric extensions

### Bytes

- `kilobytes(n)`, `megabytes(n)`, `gigabytes(n)`, `terabytes(n)`

### Formatting

- `numberToHumanSize(bytes)` — `"1.2 MB"`
- `numberToHuman(number)` — `"1.2 Million"`
- `numberToCurrency(number, options)` — `"$1,234.56"`
- `numberToPercentage(number, options)` — `"99.5%"`
- `numberWithDelimiter(number)` — `"1,234,567"`
- `numberWithPrecision(number, precision)` — `"1234.57"`
- `numberToPhone(number, options)` — `"(555) 123-4567"`

### Key Rails reference

- `activesupport/test/core_ext/numeric_ext_test.rb`
- `activesupport/test/number_helper_test.rb`
