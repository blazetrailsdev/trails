import type { Base } from "./base.js";
import type { Type } from "@blazetrails/activemodel";
import { Json } from "./type/json.js";
import { Serialized, type Coder } from "./type/serialized.js";
import {
  ColumnNotSerializableError,
  isTypeIncompatibleWithSerialize,
  buildColumnSerializer,
} from "./attribute-methods/serialization.js";

interface InnerCoder {
  dump(value: unknown): string | null;
  load(raw: unknown): unknown;
}

const _jsonType = new Json();

/**
 * The default coder. Mirrors Rails' `ActiveRecord::Coders::JSON`, but loads
 * through the `Json` type so invalid JSON deserializes to `null` (rescue)
 * rather than raising — matching `Type::Json#deserialize`.
 */
const JSON_INNER: InnerCoder = {
  dump(value: unknown): string {
    return _jsonType.serialize(value) ?? "null";
  },
  load(raw: unknown): unknown {
    return _jsonType.deserialize(raw);
  },
};

/**
 * Stand-in for Ruby's `Hash` class, used as the `object_class` for the
 * `hash`/`type: Hash` coders. JS has no distinct hash class (object literals
 * are plain `Object`, and arrays are also `Object`), so a `Symbol.hasInstance`
 * shim lets `Coders::ColumnSerializer` validate "is a plain object, not an
 * array" via `instanceof` and default to `{}` via `new`.
 *
 * @internal
 */
export class HashObject {
  constructor() {
    return {};
  }
  static [Symbol.hasInstance](value: unknown): boolean {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }
}

type CoderOption = "json" | "array" | "hash" | InnerCoder | (new (...args: any[]) => any);

export interface SerializeOptions {
  coder?: CoderOption;
  type?: "Array" | "Hash" | typeof Array | typeof Object | (new (...args: any[]) => any);
}

/**
 * Maps the `coder`/`type` options to Rails' `serialize(attr, coder:, type:)`
 * shape, then delegates to the canonical `build_column_serializer`. The
 * string-keyed `coder: "json" | "array" | "hash"` forms are a trails
 * convenience for `coder: JSON, type: Array | Hash`. Returns the built coder
 * plus the `(coder, type)` pair used by `type_incompatible_with_serialize?`.
 */
function resolveSerializer(
  attribute: string,
  options: SerializeOptions,
): { coder: Coder; coderIdentity: unknown; objectType: unknown } {
  const { coder: coderOpt } = options;

  let rawCoder: unknown = JSON_INNER;
  // Identity passed to type_incompatible_with_serialize?; the JSON arm fires
  // for `coder == ::JSON`, so default/"json" report as the global JSON.
  let coderIdentity: unknown = globalThis.JSON;
  let objectType: unknown = Object;

  if (!coderOpt || coderOpt === "json") {
    // default JSON coder
  } else if (coderOpt === "array") {
    objectType = globalThis.Array;
  } else if (coderOpt === "hash") {
    objectType = HashObject;
  } else {
    rawCoder = coderOpt;
    coderIdentity = coderOpt;
  }

  // An explicit `type:` constrains the object class (Rails `serialize :x, type: Array`).
  const t = options.type;
  if (t === globalThis.Array || t === "Array") {
    objectType = globalThis.Array;
  } else if (t === "Hash") {
    objectType = HashObject;
  } else if (typeof t === "function" && t !== Object) {
    objectType = t;
  }

  const coder = buildColumnSerializer(attribute, rawCoder, objectType) as Coder;
  return { coder, coderIdentity, objectType };
}

/**
 * Declare that an attribute should be serialized before saving and
 * deserialized when loading.
 *
 * Wraps the attribute's cast type with `Type::Serialized`, so the coder runs
 * on both the read path (deserialize/cast) and the write path (serialize for
 * the database) — matching Rails' `decorate_attributes` step rather than a
 * read-only accessor override.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ClassMethods#serialize
 *
 * Usage:
 *   serialize(User, 'preferences', { coder: 'json' })
 *   serialize(User, 'tags', { coder: 'array' })
 *   serialize(User, 'settings', { coder: 'hash' })
 *   serialize(User, 'data', { coder: customCoder })
 *   serialize(Post, 'tags', { type: Array })
 */
export function serialize(
  modelClass: typeof Base,
  attribute: string,
  options: SerializeOptions = {},
): void {
  const { coder, coderIdentity, objectType } = resolveSerializer(attribute, options);

  modelClass.decorateAttributes([attribute], (name: string, castType: Type): Type => {
    // `castType instanceof Json` (computed here, where Json is already imported)
    // catches both Type::Json and its OID::Jsonb subclass — Rails' `is_a?(Json)`.
    if (
      isTypeIncompatibleWithSerialize(castType, coderIdentity, objectType, castType instanceof Json)
    ) {
      throw new ColumnNotSerializableError(name, castType);
    }
    // Re-declaring serialize on the same attribute (e.g. switching coders)
    // must wrap the underlying cast type, not stack a second Serialized.
    const subtype = castType instanceof Serialized ? castType.subtype : castType;
    return new Serialized(subtype, coder);
  });
}
