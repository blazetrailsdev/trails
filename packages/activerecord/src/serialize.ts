import type { Base } from "./base.js";
import type { Type } from "@blazetrails/activemodel";
import { Json } from "./type/json.js";
import { Serialized, type Coder } from "./type/serialized.js";
import { SerializationTypeMismatch } from "./errors.js";
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
 * The default coder. Mirrors Rails' `ActiveRecord::Coders::JSON` — `dump`
 * encodes via the Json type, `load` decodes (returning `null` on blank/invalid
 * input, matching `Json#deserialize`).
 */
const JSON_INNER: InnerCoder = {
  dump(value: unknown): string {
    return _jsonType.serialize(value) ?? "null";
  },
  load(raw: unknown): unknown {
    return _jsonType.deserialize(raw);
  },
};

function typeName(value: unknown): string {
  if (value === null) return "NilClass";
  if (Array.isArray(value)) return "Array";
  if (typeof value === "object") return "Hash";
  return typeof value;
}

/**
 * Wraps an inner coder with an `object_class` constraint, mirroring Rails'
 * `ActiveRecord::Coders::ColumnSerializer`. Used for the `array`/`hash`
 * coders (and any `type:`-constrained serialize): `load`/`dump` raise
 * `SerializationTypeMismatch` when the value is not of the expected class,
 * and a `null` payload loads as a fresh empty instance of `objectClass`.
 *
 * Mirrors: ActiveRecord::Coders::ColumnSerializer
 *
 * @internal
 */
class ColumnSerializerCoder implements Coder {
  readonly objectClass: new (...args: any[]) => any;

  constructor(
    private readonly attrName: string,
    private readonly inner: InnerCoder,
    objectClass: new (...args: any[]) => any,
    private readonly label: string,
  ) {
    this.objectClass = objectClass;
  }

  load(payload: unknown): unknown {
    if (payload === null || payload === undefined) return new this.objectClass();
    // Rails: `return payload unless payload.is_a?(String)`. Structured column
    // types (e.g. PG OID::Array) hand the Serialized subtype an already-decoded
    // value; pass it straight to the coder rather than re-parsing.
    if (typeof payload !== "string") {
      const decoded = this.inner.load(payload);
      this.assertValidValue(decoded, "load");
      return decoded ?? new this.objectClass();
    }
    const object = this.inner.load(payload);
    this.assertValidValue(object, "load");
    return object ?? new this.objectClass();
  }

  dump(object: unknown): string | null {
    this.assertValidValue(object, "dump");
    return this.inner.dump(object);
  }

  assertValidValue(object: unknown, action = "serialize"): void {
    if (object === null || object === undefined) return;
    // A string is an as-yet-undecoded payload (our `Type::Serialized.cast`
    // accepts pre-serialized strings and routes them through `load`, which
    // validates the decoded result). Rails' ColumnSerializer likewise only
    // type-checks the decoded object, never the raw payload.
    if (typeof object === "string") return;
    const valid = object instanceof this.objectClass;
    if (!valid) {
      throw new SerializationTypeMismatch(
        `can't ${action} \`${this.attrName}\`: was supposed to be a ${this.label}, ` +
          `but was a ${typeName(object)}.`,
      );
    }
  }
}

type CoderOption = "json" | "array" | "hash" | InnerCoder | (new (...args: any[]) => any);

export interface SerializeOptions {
  coder?: CoderOption;
  type?: "Array" | "Hash" | typeof Array | typeof Object | (new (...args: any[]) => any);
}

/**
 * Resolves the `coder`/`type` options into the final `Coder` handed to
 * `Type::Serialized`, plus the inner coder and JS class used for the
 * `type_incompatible_with_serialize?` check.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ClassMethods#build_column_serializer
 */
function buildCoder(
  attribute: string,
  options: SerializeOptions,
): { coder: Coder; inner: InnerCoder; incompatibleType: unknown } {
  const { coder: coderOpt } = options;

  let inner: InnerCoder = JSON_INNER;
  let objectClass: (new (...args: any[]) => any) | undefined;
  let label: string | undefined;

  if (!coderOpt || coderOpt === "json") {
    // default JSON coder
  } else if (coderOpt === "array") {
    objectClass = globalThis.Array;
    label = "Array";
  } else if (coderOpt === "hash") {
    objectClass = Object;
    label = "Hash";
  } else if (
    typeof (coderOpt as InnerCoder).load === "function" &&
    typeof (coderOpt as InnerCoder).dump === "function"
  ) {
    inner = coderOpt as InnerCoder;
  } else if (typeof coderOpt === "function") {
    // Class-coder protocol: static `load`/`dump` (Rails' `coder: MyTags`).
    inner = coderOpt as unknown as InnerCoder;
  }

  // An explicit `type:` constrains the object class (Rails `serialize :x, type: Array`).
  const t = options.type;
  if (t === globalThis.Array || t === "Array") {
    objectClass = globalThis.Array;
    label = "Array";
  } else if (t === "Hash") {
    objectClass = Object;
    label = "Hash";
  } else if (typeof t === "function" && t !== Object) {
    objectClass = t as new (...args: any[]) => any;
    label = (t as { name?: string }).name ?? "Object";
  }

  const incompatibleType = label === "Array" ? globalThis.Array : objectClass;

  const coder: Coder =
    objectClass !== undefined
      ? new ColumnSerializerCoder(attribute, inner, objectClass, label ?? "Object")
      : (inner as Coder);

  return { coder, inner, incompatibleType };
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
  const { coder, inner, incompatibleType } = buildCoder(attribute, options);

  modelClass.decorateAttributes([attribute], (name: string, castType: Type): Type => {
    if (isTypeIncompatibleWithSerialize(castType, inner, incompatibleType)) {
      throw new ColumnNotSerializableError(name);
    }
    // Re-declaring serialize on the same attribute (e.g. switching coders)
    // must wrap the underlying cast type, not stack a second Serialized.
    const subtype = castType instanceof Serialized ? castType.subtype : castType;
    return new Serialized(subtype, coder);
  });
}
