import { BigDecimal, hashAref, rbModConstSet } from "@blazetrails/ruby-compat";
import { Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class BigDecimalSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::BigDecimalSerializer";
  }

  serialize(bigDecimal: BigDecimal): Record<string, unknown> {
    return super.serialize({ value: bigDecimal.toString() });
  }

  deserialize(hash: Record<string, unknown> | Map<string, unknown>): BigDecimal {
    return new BigDecimal(hashAref(hash, "value") as string);
  }

  /** @internal */
  protected klass(): typeof BigDecimal {
    return BigDecimal;
  }
}
rbModConstSet(Serializers, "BigDecimalSerializer", BigDecimalSerializer);
