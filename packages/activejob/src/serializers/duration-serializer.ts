import { Duration } from "@blazetrails/activesupport";
import { toH, registerConstant } from "@blazetrails/ruby-compat";
import { Arguments } from "../arguments.js";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class DurationSerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  serialize(duration: any): any {
    return super.serialize({
      ["value"]: duration.value,
      ["parts"]: Arguments.serialize(duration.parts),
    });
  }

  async deserialize(hash: any): Promise<any> {
    const value: any = hash["value"];
    const parts: any = await Arguments.deserialize(hash["parts"]);
    return new (this.klass())(value, toH(parts));
  }

  /** @internal */
  protected klass(): any {
    return Duration;
  }
}
registerConstant("ActiveJob::Serializers::DurationSerializer", DurationSerializer);
