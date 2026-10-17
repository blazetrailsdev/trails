import { DateTime as RubyDateTime } from "@blazetrails/date";
import { registerConstant } from "@blazetrails/ruby-compat";
import { TimeObjectSerializer } from "../serializers/time-object-serializer.js";

export class DateTimeSerializer extends TimeObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  deserialize(hash: any): any {
    return RubyDateTime.iso8601(hash["value"]);
  }

  /** @internal */
  protected klass(): any {
    return RubyDateTime;
  }
}
registerConstant("ActiveJob::Serializers::DateTimeSerializer", DateTimeSerializer);
