import { rbModAncestors, rbObjClass } from "@blazetrails/ruby-compat";
import type { Coder } from "./coder.js";
import { PG } from "./namespaces.js";

type Encoder = Coder & { encode(value: unknown, encoding?: unknown): string | null };

export class TypeMapByClass {
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
  _lookupKlass(paramValue: unknown): Encoder | null {
    const klass = rbObjClass(paramValue);
    const obj = this.#klassToCoder.get(klass);
    if (obj != null) return obj;
    const ancestors = rbModAncestors(klass as { prototype: object });
    for (let i = 1; i < ancestors.length; i++) {
      const coder = this.#klassToCoder.get(ancestors[i]);
      if (coder != null) return coder;
    }
    return null;
  }
}

PG.TypeMapByClass = TypeMapByClass;
