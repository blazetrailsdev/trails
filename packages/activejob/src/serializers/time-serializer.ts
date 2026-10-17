import { Time as RubyTime } from "@blazetrails/date";
import { registerConstant } from "@blazetrails/ruby-compat";
import { TimeObjectSerializer } from "../serializers/time-object-serializer.js";

export class TimeSerializer extends TimeObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  deserialize(hash: any): any {
    return RubyTime.iso8601(hash["value"]);
  }

  /** @internal */
  protected klass(): any {
    return RubyTime;
  }
}
registerConstant("ActiveJob::Serializers::TimeSerializer", TimeSerializer);
