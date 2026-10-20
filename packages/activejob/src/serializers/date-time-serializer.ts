import { DateTime } from "@blazetrails/date";
import { hashAref, rbModConstSet } from "@blazetrails/ruby-compat";
import { Serializers } from "../namespaces.js";
import { TimeObjectSerializer } from "./time-object-serializer.js";

export class DateTimeSerializer extends TimeObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::DateTimeSerializer";
  }

  deserialize(hash: Record<string, unknown> | Map<string, unknown>): unknown {
    return DateTime.iso8601(hashAref(hash, "value") as string);
  }

  /** @internal */
  protected klass(): typeof DateTime {
    return DateTime;
  }
}
rbModConstSet(Serializers, "DateTimeSerializer", DateTimeSerializer);
