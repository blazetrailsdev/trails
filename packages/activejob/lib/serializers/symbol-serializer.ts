import { hashAref } from "@blazetrails/ruby-compat/hash";
import { rbCSymbol, toSym } from "@blazetrails/ruby-compat/object";
import { symbolToS } from "@blazetrails/ruby-compat/symbol";
import { Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class SymbolSerializer extends ObjectSerializer {
  serialize(argument: string): Record<string, unknown> {
    return super.serialize({ value: symbolToS(argument) });
  }

  deserialize(argument: Record<string, unknown> | Map<string, unknown>): string {
    return toSym(hashAref(argument, "value"));
  }

  /** @internal */
  protected klass(): typeof rbCSymbol {
    return rbCSymbol;
  }
}
Serializers.SymbolSerializer = SymbolSerializer;
