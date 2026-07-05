import { Base } from "../base.js";
import { _setCanonicalModelAutoloadIndex } from "../associations.js";
import { qualifiedName } from "../inheritance.js";
// The canonical models barrel eagerly evaluates encrypted models
// (`EncryptedTrafficLight.encrypts(...)`, `EncryptedPost`'s eager key provider,
// etc.) at module load, which requires the encryption namespace to be
// registered AND a key config present. This side-effect import registers +
// configures the standard test keys, and MUST precede the barrel import — it
// lives in its own module because ESM hoists sibling `import`s ahead of any
// top-level statement, so an inline config call would run too late.
import "./canonical-model-index-encryption-setup.js";
import * as canonicalModels from "./models/index.js";

/**
 * Zeitwerk analog for the canonical test models.
 *
 * Rails autoloads a model constant on first reference from the already-indexed
 * `test/models/` tree; a test that names a model only as an association
 * _target_ (a `hasMany` target with no fixture set of its own) never needs a
 * manual `registerModel`. ESM has no synchronous `autoload`, so we build an
 * eager name→class index from the canonical models barrel and hand it to the
 * `associations` autoload fallback. Importing this module for its side effect
 * is the trails equivalent of "Zeitwerk has indexed `test/models/`."
 *
 * A genuine miss (a name in neither the model registry nor this index) still
 * throws a constant-not-found error, so the fallback can never silently mask a
 * missing or misnamed model.
 */
function buildCanonicalModelIndex(): ReadonlyMap<string, typeof Base> {
  const index = new Map<string, typeof Base>();
  for (const exported of Object.values(canonicalModels)) {
    if (typeof exported === "function" && exported !== Base && exported.prototype instanceof Base) {
      const cls = exported as typeof Base;
      // Index by both the flat JS constructor name AND the `::`-qualified Ruby
      // name (`Publisher::Magazine`), so a namespaced association target resolves
      // whether the reflection's namespace-walk asks for the qualified candidate
      // or a caller asks for the bare name. First export wins on a name clash;
      // the barrel never re-exports two distinct classes under one name, so this
      // only guards STI re-exports.
      for (const key of new Set([cls.name, qualifiedName(cls)])) {
        if (key && !index.has(key)) index.set(key, cls);
      }
    }
  }
  return index;
}

export const canonicalModelIndex = buildCanonicalModelIndex();

_setCanonicalModelAutoloadIndex(canonicalModelIndex);
