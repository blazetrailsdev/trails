import { DateTime as RubyDateTime } from "@blazetrails/date";
import { hashAref, registerConstant } from "@blazetrails/ruby-compat";
import { TimeObjectSerializer } from "../serializers/time-object-serializer.js";

export class DateTimeSerializer extends TimeObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::DateTimeSerializer";
  }

  deserialize(hash: Map<unknown, unknown>): RubyDateTime {
    return RubyDateTime.iso8601(hashAref(hash, "value") as undefined | string);
  }

  /** @internal */
  protected klass(): typeof RubyDateTime {
    return RubyDateTime;
  }
}
registerConstant("ActiveJob::Serializers::DateTimeSerializer", DateTimeSerializer);
