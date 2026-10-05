import { ActiveSupportJSON, isBlank } from "@blazetrails/activesupport";
import { registerConstant } from "@blazetrails/ruby-compat";

export class JSON {
  static dump(obj: unknown): string {
    return ActiveSupportJSON.encode(obj);
  }

  static load(json: unknown): unknown {
    return isBlank(json) ? null : ActiveSupportJSON.decode(json as string);
  }
}

registerConstant("ActiveRecord::Coders::JSON", JSON);
