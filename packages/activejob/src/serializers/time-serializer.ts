import { Time as RubyTime } from "@blazetrails/date";
import { hashAref, registerConstant } from "@blazetrails/ruby-compat";
import { TimeObjectSerializer } from "../serializers/time-object-serializer.js";

export class TimeSerializer extends TimeObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::TimeSerializer";
  }

  deserialize(hash: Map<unknown, unknown>): RubyTime {
    return RubyTime.iso8601(hashAref(hash, "value") as string);
  }

  /** @internal */
  protected klass(): typeof RubyTime {
    return RubyTime;
  }
}
registerConstant("ActiveJob::Serializers::TimeSerializer", TimeSerializer);
