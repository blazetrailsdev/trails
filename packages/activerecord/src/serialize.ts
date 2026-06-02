import type { Base } from "./base.js";
import type { Type } from "@blazetrails/activemodel";
import { Json } from "./type/json.js";
import { Serialized, type Coder } from "./type/serialized.js";
import { ColumnSerializer } from "./coders/column-serializer.js";
import {
  ColumnNotSerializableError,
  isTypeIncompatibleWithSerialize,
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
class HashObject {
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
 * Resolves the `coder`/`type` options to the underlying coder, the JS class
 * the value is expected to be an instance of (Rails' `object_class`), and the
 * coder used for the `type_incompatible_with_serialize?` check. Mirrors the
 * `coder`/`type` handling of Rails' `build_column_serializer`; the
 * string-keyed `coder: "json" | "array" | "hash"` forms are a trails
 * convenience for `coder: JSON, type: Array | Hash`.
 */
function resolveCoder(options: SerializeOptions): {
  inner: InnerCoder;
  objectClass: (new (...args: any[]) => any) | undefined;
} {
  const { coder: coderOpt } = options;

  let inner: InnerCoder = JSON_INNER;
  let objectClass: (new (...args: any[]) => any) | undefined;

  if (!coderOpt || coderOpt === "json") {
    // default JSON coder
  } else if (coderOpt === "array") {
    objectClass = globalThis.Array;
  } else if (coderOpt === "hash") {
    objectClass = HashObject;
  } else if (
    typeof (coderOpt as InnerCoder).load === "function" &&
    typeof (coderOpt as InnerCoder).dump === "function"
  ) {
    // A coder object/class with `load` + `dump` (Rails' `coder: MyTags`).
    inner = coderOpt as InnerCoder;
  } else if (typeof coderOpt === "function") {
    inner = coderOpt as unknown as InnerCoder;
  }

  // An explicit `type:` constrains the object class (Rails `serialize :x, type: Array`).
  const t = options.type;
  if (t === globalThis.Array || t === "Array") {
    objectClass = globalThis.Array;
  } else if (t === "Hash") {
    objectClass = HashObject;
  } else if (typeof t === "function" && t !== Object) {
    objectClass = t as new (...args: any[]) => any;
  }

  return { inner, objectClass };
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
  const { inner, objectClass } = resolveCoder(options);

  // Mirrors Rails' build_column_serializer: wrap in a ColumnSerializer (which
  // enforces object_class and supplies the empty-collection default) only when
  // a non-Object type is requested; otherwise use the coder directly.
  const coder: Coder =
    objectClass !== undefined
      ? (new ColumnSerializer(attribute, inner, objectClass) as unknown as Coder)
      : (inner as Coder);

  modelClass.decorateAttributes([attribute], (name: string, castType: Type): Type => {
    if (isTypeIncompatibleWithSerialize(castType, inner, objectClass)) {
      throw new ColumnNotSerializableError(name);
    }
    // Re-declaring serialize on the same attribute (e.g. switching coders)
    // must wrap the underlying cast type, not stack a second Serialized.
    const subtype = castType instanceof Serialized ? castType.subtype : castType;
    return new Serialized(subtype, coder);
  });
}
