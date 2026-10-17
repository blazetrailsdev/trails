import { zone, TimeWithZone } from "@blazetrails/activesupport";
import { Time as RubyTime } from "@blazetrails/date";
import { rbFSend, registerConstant } from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class TimeWithZoneSerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  static NANO_PRECISION: any = 9;

  serialize(timeWithZone: any): any {
    return super.serialize({
      ["value"]: timeWithZone.iso8601(TimeWithZoneSerializer.NANO_PRECISION),
      ["time_zone"]: timeWithZone.timeZone.tzinfo.name,
    });
  }

  deserialize(hash: any): any {
    return rbFSend(RubyTime.iso8601(hash["value"]), "inTimeZone", hash["time_zone"] ?? zone());
  }

  /** @internal */
  protected klass(): any {
    return TimeWithZone;
  }
}
registerConstant("ActiveJob::Serializers::TimeWithZoneSerializer", TimeWithZoneSerializer);
