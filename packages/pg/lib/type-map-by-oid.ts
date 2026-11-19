import { ArgumentError, rbObjClassname, TypeError } from "@blazetrails/ruby-compat";
import { Coder } from "./coder.js";
import { PG } from "./namespaces.js";

type Decoder = Coder & { decode(string: string, tuple?: number, field?: number): unknown };

export class TypeMapByOid {
  readonly #format: [Map<number, Decoder>, Map<number, Decoder>] = [new Map(), new Map()];

  defaultTypeMap: TypeMapByOid | null = null;

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

  rmCoder(format: number, oid: number): Decoder | null {
    const coder = this.#format[format]?.get(oid) ?? null;
    this.#format[format]?.delete(oid);
    return coder;
  }

  coders(): Decoder[] {
    return [...this.#format[0].values(), ...this.#format[1].values()];
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _lookupOid(format: number, oid: number): Decoder | null {
    return this.#format[format]?.get(oid) ?? this.defaultTypeMap?._lookupOid(format, oid) ?? null;
  }
}

PG.TypeMapByOid = TypeMapByOid;
