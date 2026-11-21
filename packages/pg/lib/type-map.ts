import { PG } from "./namespaces.js";

/** @noRailsEquivalent CONVERGEABLE pg-ruby-api-manifest-reads-ext-c-classes */
export class TypeMap {
  static DefaultTypeMappable: typeof DefaultTypeMappable;

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _lookupOid(
    _format: number,
    _oid: number,
  ): { decode(string: string, tuple?: number, field?: number): unknown } | null {
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

/** @noRailsEquivalent CONVERGEABLE pg-ruby-api-manifest-reads-ext-c-classes */
export const DefaultTypeMappable = {
  get defaultTypeMap(): TypeMap {
    return (this as unknown as { _defaultTypemap: TypeMap })._defaultTypemap;
  },
  set defaultTypeMap(typemap: TypeMap) {
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
