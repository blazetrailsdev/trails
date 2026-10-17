import {
  isSymbol,
  symbolToS,
  rbObjAsString,
  stringToSym,
  rbCSymbol,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { ObjectSerializer } from "../serializers/object-serializer.js";

export class SymbolSerializer extends ObjectSerializer {
  [key: string]: any;
  static [key: string]: any;

  serialize(argument: any): any {
    return super.serialize({
      ["value"]: isSymbol(argument) ? symbolToS(argument) : rbObjAsString(argument),
    });
  }

  deserialize(argument: any): any {
    return stringToSym(argument["value"]);
  }

  /** @internal */
  protected klass(): any {
    return rbCSymbol;
  }
}
registerConstant("ActiveJob::Serializers::SymbolSerializer", SymbolSerializer);
