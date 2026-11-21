import { include, rbModAncestors, rbObjClass } from "@blazetrails/ruby-compat";
import type { Coder } from "./coder.js";
import { PG } from "./namespaces.js";
import { _pgTypemapAllStrings } from "./type-map-all-strings.js";
import { DefaultTypeMappable, TypeMap } from "./type-map.js";

type Encoder = Coder & { encode(value: unknown, encoding?: unknown): string | null };

export class TypeMapByClass extends TypeMap {
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _defaultTypemap: TypeMap = _pgTypemapAllStrings;
  declare defaultTypeMap: DefaultTypeMappable["defaultTypeMap"];
  declare withDefaultTypeMap: DefaultTypeMappable["withDefaultTypeMap"];

  readonly #klassToCoder = new Map<object, Encoder>();

  set(klass: object, coder: Encoder | null): Encoder | null {
    if (coder == null) {
      this.#klassToCoder.delete(klass);
    } else {
      this.#klassToCoder.set(klass, coder);
    }
    return coder;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  _lookupKlass(paramValue: unknown): { encode(value: unknown): string | null } | null {
    const klass = rbObjClass(paramValue);
    const obj = this.#klassToCoder.get(klass);
    if (obj != null) return obj;
    const ancestors = rbModAncestors(klass);
    for (let i = 1; i < ancestors.length; i++) {
      const coder = this.#klassToCoder.get(ancestors[i]);
      if (coder != null) return coder;
    }
    return this.defaultTypeMap._lookupKlass(paramValue);
  }
}

include(TypeMapByClass, DefaultTypeMappable);

PG.TypeMapByClass = TypeMapByClass;
