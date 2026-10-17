import { zip, valuesAt, Range, registerConstant } from "@blazetrails/ruby-compat";
import { Arguments } from "../arguments.js";
import { rbAryEnsure } from "../codegen-runtime.js";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class RangeSerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  static KEYS: any = Object.freeze(["begin", "end", "exclude_end"]);

  serialize(range: any): any {
    const args: any = Arguments.serialize([range.begin, range.end, range.excludeEnd]);
    return super.serialize(Object.fromEntries(zip(RangeSerializer.KEYS, args)));
  }

  async deserialize(hash: any): Promise<any> {
    return new (this.klass())(
      ...(await Arguments.deserialize(valuesAt(hash, ...rbAryEnsure(RangeSerializer.KEYS)))),
    );
  }

  /** @internal */
  protected klass(): any {
    return Range;
  }
}
registerConstant("ActiveJob::Serializers::RangeSerializer", RangeSerializer);
