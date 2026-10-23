import {
  BigDecimal,
  isSymbol,
  symbolToS,
  rbObjAsString,
  hashAref,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class BigDecimalSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::BigDecimalSerializer";
  }

  serialize(bigDecimal: BigDecimal): Record<string, unknown> {
    return super.serialize({
      value: isSymbol(bigDecimal) ? symbolToS(bigDecimal) : rbObjAsString(bigDecimal),
    });
  }

  deserialize(hash: Map<unknown, unknown>): BigDecimal {
    return new BigDecimal(
      hashAref(hash, "value") as
        | string
        | number
        | bigint
        | BigDecimal
        | { numerator: bigint; denominator: bigint },
    );
  }

  /** @internal */
  protected klass(): typeof BigDecimal {
    return BigDecimal;
  }
}
registerConstant("ActiveJob::Serializers::BigDecimalSerializer", BigDecimalSerializer);
