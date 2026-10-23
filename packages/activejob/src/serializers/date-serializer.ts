import { Date as RubyDate } from "@blazetrails/date";
import { rbFSend, hashAref, registerConstant } from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class DateSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::DateSerializer";
  }

  serialize(date: unknown): Record<string, unknown> {
    return super.serialize({ value: rbFSend(date, "iso8601") });
  }

  deserialize(hash: Map<unknown, unknown>): RubyDate {
    return RubyDate.iso8601(hashAref(hash, "value") as undefined | string);
  }

  /** @internal */
  protected klass(): typeof RubyDate {
    return RubyDate;
  }
}
registerConstant("ActiveJob::Serializers::DateSerializer", DateSerializer);
