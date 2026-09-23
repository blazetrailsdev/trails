import { deprecator } from "./deprecator.js";
import { preserveTimezone, setPreserveTimezone } from "./core-ext/date-and-time/compatibility.js";

export function toTimePreservesTimezone(): boolean | string {
  return preserveTimezone();
}

export function setToTimePreservesTimezone(value: boolean | string | null): void {
  if (value == null || value === false) {
    deprecator().warn(
      "`to_time` will always preserve the receiver timezone rather than system local time in Rails 8.1. " +
        "To opt in to the new behavior, set `config.active_support.to_time_preserves_timezone = :zone`.",
    );
  } else if (value !== ":zone") {
    deprecator().warn(
      "`to_time` will always preserve the full timezone rather than offset of the receiver in Rails 8.1. " +
        "To opt in to the new behavior, set `config.active_support.to_time_preserves_timezone = :zone`.",
    );
  }

  setPreserveTimezone(value);
}

let _testOrder: string | null = null;

export function testOrder(): string | null {
  return _testOrder;
}

export function setTestOrder(value: string | null): void {
  _testOrder = value;
}
