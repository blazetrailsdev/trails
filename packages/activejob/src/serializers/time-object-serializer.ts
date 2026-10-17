import { registerConstant } from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class TimeObjectSerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  static NANO_PRECISION: any = 9;

  serialize(time: any): any {
    return super.serialize({ ["value"]: time.iso8601(TimeObjectSerializer.NANO_PRECISION) });
  }
}
registerConstant("ActiveJob::Serializers::TimeObjectSerializer", TimeObjectSerializer);
