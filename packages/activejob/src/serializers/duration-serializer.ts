import { Duration } from "@blazetrails/activesupport";
import { hashAref, registerConstant } from "@blazetrails/ruby-compat";
import { Arguments } from "../arguments.js";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class DurationSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::DurationSerializer";
  }

  serialize(duration: Duration): Record<string, unknown> {
    return super.serialize({ value: duration.value, parts: Arguments.serialize(duration.parts) });
  }

  async deserialize(hash: Map<unknown, unknown>): Promise<Duration> {
    const value = hashAref(hash, "value");
    const parts = await Arguments.deserialize(hashAref(hash, "parts"));
    return new (this.klass())(value as number, Object.fromEntries(parts));
  }

  /** @internal */
  protected klass(): typeof Duration {
    return Duration;
  }
}
registerConstant("ActiveJob::Serializers::DurationSerializer", DurationSerializer);
