import { deprecator } from "../../deprecator.js";

let _preserveTimezone: boolean | string | null = null;

let _utcToLocalReturnsUtcOffsetTimes = false;

export function preserveTimezone(): boolean | string {
  if (_preserveTimezone === null) {
    deprecator().warn(
      "`to_time` will always preserve the receiver timezone rather than system local time in Rails 8.1." +
        "To opt in to the new behavior, set `config.active_support.to_time_preserves_timezone = :zone`.",
    );

    _preserveTimezone = false;
  }

  return _preserveTimezone;
}

export function setPreserveTimezone(value: boolean | string | null): void {
  _preserveTimezone = value;
}

export function utcToLocalReturnsUtcOffsetTimes(): boolean {
  return _utcToLocalReturnsUtcOffsetTimes;
}

export function setUtcToLocalReturnsUtcOffsetTimes(value: boolean): void {
  _utcToLocalReturnsUtcOffsetTimes = value;
}
