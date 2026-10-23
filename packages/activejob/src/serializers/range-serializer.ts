import { Range, valuesAt, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob, Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class RangeSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::RangeSerializer";
  }

  static readonly KEYS = Object.freeze(["begin", "end", "exclude_end"]);

  serialize(range: Range): Record<string, unknown> {
    const args = ActiveJob.Arguments.serialize([range.begin, range.end, range.excludeEnd]);
    return super.serialize(
      Object.fromEntries(RangeSerializer.KEYS.map((key, i) => [key, args[i]])),
    );
  }

  async deserialize(hash: Record<string, unknown> | Map<string, unknown>): Promise<Range> {
    return new (this.klass())(
      ...((await ActiveJob.Arguments.deserialize(valuesAt(hash, ...RangeSerializer.KEYS))) as [
        unknown,
        unknown,
        boolean,
      ]),
    );
  }

  /** @internal */
  protected klass(): typeof Range {
    return Range;
  }
}
rbModConstSet(Serializers, "RangeSerializer", RangeSerializer);
