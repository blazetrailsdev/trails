import { TimeWithZone, zone } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { hashAref, registerConstant } from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class TimeWithZoneSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::TimeWithZoneSerializer";
  }

  static NANO_PRECISION: unknown = 9;

  serialize(timeWithZone: TimeWithZone): Record<string, unknown> {
    return super.serialize({
      value: timeWithZone.iso8601(TimeWithZoneSerializer.NANO_PRECISION as undefined | number),
      time_zone: timeWithZone.timeZone.tzinfo.name,
    });
  }

  deserialize(hash: Map<unknown, unknown>) {
    return RubyTime.iso8601(hashAref(hash, "value") as string).inTimeZone(
      hashAref(hash, "time_zone") ?? zone(),
    );
  }

  /** @internal */
  protected klass(): typeof TimeWithZone {
    return TimeWithZone;
  }
}
registerConstant("ActiveJob::Serializers::TimeWithZoneSerializer", TimeWithZoneSerializer);
