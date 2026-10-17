import {
  isSymbol,
  symbolToS,
  rbObjAsString,
  BigDecimal,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class BigDecimalSerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  serialize(bigDecimal: any): any {
    return super.serialize({
      ["value"]: isSymbol(bigDecimal) ? symbolToS(bigDecimal) : rbObjAsString(bigDecimal),
    });
  }

  deserialize(hash: any): any {
    return new BigDecimal(hash["value"]);
  }

  /** @internal */
  protected klass(): any {
    return BigDecimal;
  }
}
registerConstant("ActiveJob::Serializers::BigDecimalSerializer", BigDecimalSerializer);
