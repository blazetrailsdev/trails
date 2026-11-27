import { FrozenError } from "@blazetrails/ruby-compat/frozen-error";
import { rbInspect, rbObjClassname } from "@blazetrails/ruby-compat/object";
import { TypeError } from "@blazetrails/ruby-compat/type-error";
import type { Coder } from "./coder.js";
import { PG } from "./namespaces.js";

export class TypeMap {
  static DefaultTypeMappable: typeof DefaultTypeMappable;

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _lookupOid(
    _format: number,
    _oid: number,
  ): (Coder & { decode(string: string, tuple?: number, field?: number): unknown }) | null {
    return null;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _lookupKlass(_paramValue: unknown): { encode(value: unknown): string | null } | null {
    return null;
  }
}

export const DefaultTypeMappable = {
  get defaultTypeMap(): TypeMap {
    return (this as unknown as { _defaultTypemap: TypeMap })._defaultTypemap;
  },
  set defaultTypeMap(typemap: TypeMap) {
    if (Object.isFrozen(this)) {
      throw new FrozenError(`can't modify frozen ${rbObjClassname(this)}: ${rbInspect(this)}`, {
        receiver: this,
      });
    }
    if (!((typemap as unknown) instanceof TypeMap)) {
      throw new TypeError(`wrong argument type ${rbObjClassname(typemap)} (expected PG::TypeMap)`);
    }
    (this as unknown as { _defaultTypemap: TypeMap })._defaultTypemap = typemap;
  },
  withDefaultTypeMap<T>(this: T, typemap: TypeMap): T {
    (this as unknown as { defaultTypeMap: TypeMap }).defaultTypeMap = typemap;
    return this;
  },
};

/** @internal */
export interface DefaultTypeMappable {
  defaultTypeMap: TypeMap;
  withDefaultTypeMap(typemap: TypeMap): this;
}

TypeMap.DefaultTypeMappable = DefaultTypeMappable;

PG.TypeMap = TypeMap;
