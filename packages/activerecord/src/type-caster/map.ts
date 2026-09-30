import { ValueType } from "@blazetrails/activemodel";
import { rbObjAsString as toS } from "@blazetrails/ruby-compat";

export class Map {
  private _klass: any;

  constructor(klass: any) {
    this._klass = klass;
  }

  typeCastForDatabase(attrName: unknown, value: unknown): unknown {
    const type = this.typeForAttribute(attrName);
    return type.serialize(value);
  }

  typeForAttribute(name: unknown): ValueType {
    return this._baseTypeForAttribute(toS(name));
  }

  private _baseTypeForAttribute(name: string): ValueType {
    const klass = this._klass;

    if (typeof klass.typeForAttribute === "function") {
      return klass.typeForAttribute(name) as ValueType;
    }

    return new ValueType();
  }

  /** @internal */
  get klass(): any {
    return this._klass;
  }
}
