/**
 * Mirrors: `DateAndTime::Compatibility`
 * (`core_ext/date_and_time/compatibility.rb`) — the two `to_time` /
 * `utc_to_local` switches Rails mixes into `Date`, `Time`, `DateTime` and
 * `ActiveSupport::TimeWithZone`.
 *
 * Ruby declares both with `mattr_accessor`, so the state is module-level and
 * every includer reads the one value. A TS module-level binding is the same
 * seat; the readers and `setX()` writers below are what `mattr_accessor`
 * generates, and `preserveTimezone` additionally re-implements the reader by
 * hand exactly as the Ruby does (compatibility.rb:19-37) rather than
 * prepending onto the generated one.
 */

import { deprecator } from "../../deprecation.js";

/**
 * `mattr_accessor :preserve_timezone, instance_accessor: false, default: nil`
 * (compatibility.rb:15). `null` is the un-set third state the reader below
 * warns on — it is not the same as `false`.
 */
let _preserveTimezone: boolean | string | null = null;

/**
 * `mattr_accessor :utc_to_local_returns_utc_offset_times, instance_writer:
 * false, default: false` (compatibility.rb:56).
 */
let _utcToLocalReturnsUtcOffsetTimes = false;

/**
 * If true, `to_time` preserves the timezone offset of the receiver.
 *
 * Mirrors: `DateAndTime::Compatibility.preserve_timezone`
 * (compatibility.rb:24-37). Reading it while still unset warns once and then
 * latches to `false`, which is what makes the warning fire on the first
 * `#to_time` rather than at load.
 */
export function preserveTimezone(): boolean | string {
  if (_preserveTimezone === null) {
    // Only warn once, the first time the value is used (which should
    // be the first time #to_time is called).
    deprecator.warn(
      "`to_time` will always preserve the receiver timezone rather than system local time in Rails 8.1." +
        "To opt in to the new behavior, set `config.active_support.to_time_preserves_timezone = :zone`.",
    );

    _preserveTimezone = false;
  }

  return _preserveTimezone;
}

/** The `mattr_accessor`-generated writer for {@link preserveTimezone}. */
export function setPreserveTimezone(value: boolean | string | null): void {
  _preserveTimezone = value;
}

/**
 * Change the output of `ActiveSupport::TimeZone.utc_to_local`.
 *
 * When `true`, it returns local times with a UTC offset; with `false` local
 * times are returned as UTC.
 *
 * Mirrors: `DateAndTime::Compatibility.utc_to_local_returns_utc_offset_times`
 * (compatibility.rb:56).
 */
export function utcToLocalReturnsUtcOffsetTimes(): boolean {
  return _utcToLocalReturnsUtcOffsetTimes;
}

/**
 * The `mattr_accessor`-generated writer for
 * {@link utcToLocalReturnsUtcOffsetTimes}. Rails passes `instance_writer:
 * false`, so this is the module-level seat only.
 */
export function setUtcToLocalReturnsUtcOffsetTimes(value: boolean): void {
  _utcToLocalReturnsUtcOffsetTimes = value;
}
