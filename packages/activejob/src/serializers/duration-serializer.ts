import { Duration } from "@blazetrails/activesupport";
import { hashAref, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob, Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class DurationSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::DurationSerializer";
  }

  serialize(duration: Duration): Record<string, unknown> {
    return super.serialize({
      value: duration.value,
      parts: ActiveJob.Arguments.serialize(duration.parts),
    });
  }

  async deserialize(hash: Record<string, unknown> | Map<string, unknown>): Promise<Duration> {
    const value = hashAref(hash, "value") as number;
    const parts = await ActiveJob.Arguments.deserialize(hashAref(hash, "parts") as unknown[]);
    return new (this.klass())(value, Object.fromEntries(parts as [string, number][]));
  }

  /** @internal */
  protected klass(): typeof Duration {
    return Duration;
  }
}
rbModConstSet(Serializers, "DurationSerializer", DurationSerializer);
