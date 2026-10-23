import { rbFSend, registerConstant } from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class TimeObjectSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::TimeObjectSerializer";
  }

  static NANO_PRECISION: unknown = 9;

  serialize(time: unknown): Record<string, unknown> {
    return super.serialize({
      value: rbFSend(time, "iso8601", TimeObjectSerializer.NANO_PRECISION),
    });
  }
}
registerConstant("ActiveJob::Serializers::TimeObjectSerializer", TimeObjectSerializer);
