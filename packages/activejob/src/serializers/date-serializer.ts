import { Date as RubyDate } from "@blazetrails/date";
import { registerConstant } from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class DateSerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  serialize(date: any): any {
    return super.serialize({ ["value"]: date.iso8601() });
  }

  deserialize(hash: any): any {
    return RubyDate.iso8601(hash["value"]);
  }

  /** @internal */
  protected klass(): any {
    return RubyDate;
  }
}
registerConstant("ActiveJob::Serializers::DateSerializer", DateSerializer);
