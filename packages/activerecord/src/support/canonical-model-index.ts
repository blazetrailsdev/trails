import { Base } from "../base.js";
import { _setCanonicalModelAutoloadIndex } from "../associations.js";
import { qualifiedName } from "../inheritance.js";
import "./canonical-model-index-encryption-setup.js";
import * as canonicalModels from "../test-helpers/models/index.js";

function buildCanonicalModelIndex(): ReadonlyMap<string, typeof Base> {
  const index = new Map<string, typeof Base>();
  for (const exported of Object.values(canonicalModels)) {
    if (typeof exported === "function" && exported !== Base && exported.prototype instanceof Base) {
      const cls = exported as typeof Base;
      for (const key of new Set([cls.name, qualifiedName(cls)])) {
        if (key && !index.has(key)) index.set(key, cls);
      }
    }
  }
  return index;
}

export const canonicalModelIndex = buildCanonicalModelIndex();

_setCanonicalModelAutoloadIndex(canonicalModelIndex);
