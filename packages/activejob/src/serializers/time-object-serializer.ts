import type { Temporal } from "@blazetrails/date";
import { DateTime } from "@blazetrails/date";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class TimeObjectSerializer extends ObjectSerializer {
  static readonly NANO_PRECISION = 9;

  static toString(): string {
    return "ActiveJob::Serializers::TimeObjectSerializer";
  }

  /** @inventedArm if — CONVERGEABLE activejob-date-serializers-serialize-temporal-dates */
  serialize(
    time:
      | { iso8601(fractionDigits?: number): string }
      | Temporal.PlainDateTime
      | Temporal.ZonedDateTime,
  ): Record<string, unknown> {
    if (!("iso8601" in time)) time = new DateTime(time);
    return super.serialize({ value: time.iso8601(TimeObjectSerializer.NANO_PRECISION) });
  }
}
rbModConstSet(Serializers, "TimeObjectSerializer", TimeObjectSerializer);
