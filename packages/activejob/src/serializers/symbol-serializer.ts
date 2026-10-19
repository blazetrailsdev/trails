import { hashAref, rbCSymbol, rbModConstSet, symbolToS, toSym } from "@blazetrails/ruby-compat";
import { Serializers } from "../namespaces.js";
import { ObjectSerializer } from "./object-serializer.js";

export class SymbolSerializer extends ObjectSerializer {
  static toString(): string {
    return "ActiveJob::Serializers::SymbolSerializer";
  }

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
rbModConstSet(Serializers, "SymbolSerializer", SymbolSerializer);
