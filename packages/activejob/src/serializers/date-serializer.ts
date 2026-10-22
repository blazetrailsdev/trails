import type { Temporal } from "@blazetrails/date";
import { Date, dNewByFrags } from "@blazetrails/date";
import { hashAref, rbModConstSet } from "@blazetrails/ruby-compat";
import { Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class DateSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::DateSerializer";
  }

  /** @inventedArm if — CONVERGEABLE activejob-date-serializers-serialize-temporal-dates */
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
rbModConstSet(Serializers, "DateSerializer", DateSerializer);
