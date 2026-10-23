import { Range, zip, valuesAt, registerConstant } from "@blazetrails/ruby-compat";
import { Arguments } from "../arguments.js";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class RangeSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::RangeSerializer";
  }

  static KEYS: unknown = Object.freeze(["begin", "end", "exclude_end"]);

  serialize(range: Range): Record<string, unknown> {
    const args = Arguments.serialize([range.begin, range.end, range.excludeEnd]);
    return super.serialize(Object.fromEntries(zip(RangeSerializer.KEYS as unknown[], args)));
  }

  async deserialize(hash: Map<unknown, unknown>): Promise<Range> {
    return new (this.klass())(
      ...(await Arguments.deserialize(
        valuesAt(
          hash,
          ...(RangeSerializer.KEYS == null
            ? []
            : Array.isArray(RangeSerializer.KEYS)
              ? (RangeSerializer.KEYS as unknown[])
              : [RangeSerializer.KEYS]),
        ),
      )),
    );
  }

  /** @internal */
  protected klass(): typeof Range {
    return Range;
  }
}
registerConstant("ActiveJob::Serializers::RangeSerializer", RangeSerializer);
