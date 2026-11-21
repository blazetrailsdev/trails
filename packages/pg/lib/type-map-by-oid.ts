import { ArgumentError, include, rbObjClassname, TypeError } from "@blazetrails/ruby-compat";
import { Coder } from "./coder.js";
import { PG } from "./namespaces.js";
import { _pgTypemapAllStrings } from "./type-map-all-strings.js";
import { DefaultTypeMappable, TypeMap } from "./type-map.js";

type Decoder = Coder & { decode(string: string, tuple?: number, field?: number): unknown };

/** @noRailsEquivalent PERMANENT */
export class TypeMapByOid extends TypeMap {
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _defaultTypemap: TypeMap = _pgTypemapAllStrings;
  declare defaultTypeMap: DefaultTypeMappable["defaultTypeMap"];
  declare withDefaultTypeMap: DefaultTypeMappable["withDefaultTypeMap"];

  readonly #format: [Map<number, Decoder>, Map<number, Decoder>] = [new Map(), new Map()];

  addCoder(coder: Decoder): this {
    if (!(coder instanceof Coder)) {
      throw new TypeError(
        `wrong argument type ${rbObjClassname(coder)} (expected kind of PG::Coder)`,
      );
    }
    if (coder.format < 0 || coder.format > 1) {
      throw new ArgumentError(`invalid format code ${coder.format}`);
    }
    this.#format[coder.format].set(coder.oid, coder);
    return this;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _lookupOid(format: number, oid: number): Decoder | null {
    return (
      this.#format[format]?.get(oid) ??
      (this.defaultTypeMap._lookupOid(format, oid) as Decoder | null)
    );
  }
}

include(TypeMapByOid, DefaultTypeMappable);

PG.TypeMapByOid = TypeMapByOid;
