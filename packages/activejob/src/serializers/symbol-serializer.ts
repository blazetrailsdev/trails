import {
  isSymbol,
  symbolToS,
  rbObjAsString,
  hashAref,
  stringToSym,
  rbCSymbol,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class SymbolSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::SymbolSerializer";
  }

  serialize(argument: string): Record<string, unknown> {
    return super.serialize({
      value: isSymbol(argument) ? symbolToS(argument) : rbObjAsString(argument),
    });
  }

  deserialize(argument: Map<unknown, unknown>): string {
    return stringToSym(hashAref(argument, "value") as string);
  }

  /** @internal */
  protected klass() {
    return rbCSymbol;
  }
}
registerConstant("ActiveJob::Serializers::SymbolSerializer", SymbolSerializer);
