import { TimeWithZone, type TimeZone, zone } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { hashAref, rbModConstSet } from "@blazetrails/ruby-compat";
import { Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class TimeWithZoneSerializer extends ObjectSerializer {
  static readonly NANO_PRECISION = 9;

  static toString(): string {
    return "ActiveJob::Serializers::TimeWithZoneSerializer";
  }

  serialize(timeWithZone: TimeWithZone): Record<string, unknown> {
    return super.serialize({
      value: timeWithZone.iso8601(TimeWithZoneSerializer.NANO_PRECISION),
      time_zone: (timeWithZone.timeZone as TimeZone).tzinfo.name,
    });
  }

  deserialize(hash: Record<string, unknown> | Map<string, unknown>): TimeWithZone {
    return Time.iso8601(hashAref(hash, "value") as string).inTimeZone(
      (hashAref(hash, "time_zone") as string | null) ?? zone(),
    ) as TimeWithZone;
  }

  /** @internal */
  protected klass(): typeof TimeWithZone {
    return TimeWithZone;
  }
}
rbModConstSet(Serializers, "TimeWithZoneSerializer", TimeWithZoneSerializer);
