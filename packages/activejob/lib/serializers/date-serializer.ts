import { Date, dNewByFrags } from "@blazetrails/date";
import { hashAref } from "@blazetrails/ruby-compat/hash";
import { Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class DateSerializer extends ObjectSerializer {
  /** @inventedArm if — PERMANENT */
  serialize(date: Date | Temporal.PlainDate): Record<string, unknown> {
    let rbDate = date;
    if (!(rbDate instanceof Date)) rbDate = new Date(rbDate);
    return super.serialize({ value: rbDate.iso8601() });
  }

  deserialize(hash: Record<string, unknown> | Map<string, unknown>): Date {
    return dNewByFrags(Date._iso8601(hashAref(hash, "value") as string));
  }

  /** @internal */
  protected klass(): typeof Date {
    return Date;
  }
}
Serializers.DateSerializer = DateSerializer;
