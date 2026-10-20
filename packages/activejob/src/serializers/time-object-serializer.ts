import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class TimeObjectSerializer extends ObjectSerializer {
  static readonly NANO_PRECISION = 9;

  static toString(): string {
    return "ActiveJob::Serializers::TimeObjectSerializer";
  }

  serialize(time: { iso8601(fractionDigits?: number): string }): Record<string, unknown> {
    return super.serialize({ value: time.iso8601(TimeObjectSerializer.NANO_PRECISION) });
  }
}
rbModConstSet(Serializers, "TimeObjectSerializer", TimeObjectSerializer);
