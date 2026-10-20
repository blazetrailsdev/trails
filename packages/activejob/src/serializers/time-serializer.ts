import { Time } from "@blazetrails/date";
import { hashAref, rbModConstSet } from "@blazetrails/ruby-compat";
import { Serializers } from "../namespaces.js";
import { TimeObjectSerializer } from "./time-object-serializer.js";

export class TimeSerializer extends TimeObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::TimeSerializer";
  }

  deserialize(hash: Record<string, unknown> | Map<string, unknown>): Time {
    return Time.iso8601(hashAref(hash, "value") as string);
  }

  /** @internal */
  protected klass(): typeof Time {
    return Time;
  }
}
rbModConstSet(Serializers, "TimeSerializer", TimeSerializer);
