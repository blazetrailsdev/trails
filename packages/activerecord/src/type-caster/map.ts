import { Type, ValueType } from "@blazetrails/activemodel";
import { rbObjAsString as toS } from "@blazetrails/ruby-compat";
import { enumTypeOf } from "../enum.js";

export class Map {
  private _klass: any;

  constructor(klass: any) {
    this._klass = klass;
  }

  typeCastForDatabase(attrName: unknown, value: unknown): unknown {
    const enumType = enumTypeOf(this._klass, toS(attrName));
    if (enumType) return enumType.serialize(value);
    const type = this.typeForAttribute(attrName);
    return type.serialize(value);
  }

  typeForAttribute(name: unknown): Type {
    return this._baseTypeForAttribute(toS(name));
  }

  private _baseTypeForAttribute(name: string): Type {
    const klass = this._klass;

    if (typeof klass.typeForAttribute === "function") {
      return klass.typeForAttribute(name) as Type;
    }

    return new ValueType();
  }

  /** @internal */
  get klass(): any {
    return this._klass;
  }
}
