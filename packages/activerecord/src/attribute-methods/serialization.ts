/**
 * Serialized attribute support for ActiveRecord.
 *
 * Configures attributes to serialize/deserialize values (e.g. JSON, YAML)
 * when reading from and writing to the database.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization
 */

import { classAttribute, extend, included } from "@blazetrails/activesupport";
import type { Base } from "../base.js";
import { type Type, ArgumentError } from "@blazetrails/activemodel";
import { Json } from "../type/json.js";
import { Serialized, type Coder } from "../type/serialized.js";
import { JSON as CodersJSON } from "../coders/json.js";
import { ColumnSerializer as CodersColumnSerializer } from "../coders/column-serializer.js";
import { YAMLColumn, type YamlColumnOptions } from "../coders/yaml-column.js";

/**
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ClassMethods
 * (serialization.rb:22-229).
 */
export const ClassMethods = {
  serialize,
};

export interface Serialization {
  serialize(attribute: string, options?: { coder?: unknown }): void;
}

/** The host `include ActiveRecord::AttributeMethods::Serialization` needs. */
interface SerializationIncludeHost {
  name: string;
}

/**
 * `ActiveRecord::AttributeMethods::Serialization` — the module
 * `attribute_methods.rb:20` includes. It defines no instance methods; the
 * module object carries its `included do` block (serialization.rb:19-21), which
 * is what declares the `default_column_serializer` class attribute `serialize`
 * falls back on (`coder ||= default_column_serializer`, serialization.rb:184).
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization (serialization.rb:6-230)
 */
export const Serialization = {
  [included](base: SerializationIncludeHost): void {
    extend(base, ClassMethods);
    classAttribute.call(base, "defaultColumnSerializer", {
      instanceAccessor: false,
      default: YAMLColumn,
    });
  },
};

/**
 * Raised when attempting to serialize a column that doesn't support it.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ColumnNotSerializableError
 */
export class ColumnNotSerializableError extends Error {
  constructor(name: string, type?: unknown) {
    const typeName =
      type == null
        ? "unknown"
        : ((type as { constructor?: { name?: string } }).constructor?.name ?? String(type));
    super(
      `Column \`${name}\` of type ${typeName} does not support \`serialize\` feature.\n` +
        `Usually it means that you are trying to use \`serialize\`\n` +
        `on a column that already implements serialization natively.`,
    );
    this.name = "ColumnNotSerializableError";
  }
}

/**
 * Column serializer — wraps a coder for a specific column.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ColumnSerializer
 */
export class ColumnSerializer {
  readonly attribute: string;
  readonly coder: { dump(value: unknown): string; load(raw: unknown): unknown };

  constructor(
    attribute: string,
    coder: { dump(value: unknown): string; load(raw: unknown): unknown },
  ) {
    this.attribute = attribute;
    this.coder = coder;
  }

  dump(value: unknown): string {
    return this.coder.dump(value);
  }

  load(raw: unknown): unknown {
    return this.coder.load(raw);
  }
}

/**
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ClassMethods#type_incompatible_with_serialize?
 *
 * @internal
 */
export function isTypeIncompatibleWithSerialize(
  castType: unknown,
  coder: unknown,
  type: unknown,
  isJsonType?: boolean,
): boolean {
  const resolvedCoder = coder === globalThis.JSON ? CodersJSON : coder;
  // Mirrors `cast_type.is_a?(ActiveRecord::Type::Json)`. The caller passes the
  // `instanceof Json` result (so OID::Jsonb, which extends Json, is also
  // caught); falls back to a name duck-type for callers that don't supply it.
  const jsonish = isJsonType ?? (castType as any)?.name === "json";
  if (jsonish && resolvedCoder === CodersJSON) return true;
  if (castType != null && typeof (castType as any).typeCastArray === "function" && type === Array)
    return true;
  return false;
}

type CoderLike = { dump(v: unknown): string; load(v: unknown): unknown };

/**
 * Builds the inner coder for a store column given raw options.
 * If coder responds to both load and dump, uses it directly.
 * If coder is a constructor (responds to new but not load), instantiates it.
 * Falls back to returning coder as-is when type is Object or unspecified.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Serialization::ClassMethods#build_column_serializer
 *
 * @internal
 */
export function buildColumnSerializer(
  attrName: string,
  coder: unknown,
  type: unknown,
  yaml?: YamlColumnOptions,
): unknown {
  // When ::JSON is used, force it to go through the Active Support JSON encoder
  // to ensure special objects (e.g. Active Record models) are dumped correctly
  // using the #as_json hook.
  if (coder === globalThis.JSON) coder = CodersJSON;

  // Mirrors Rails' `coder == ::YAML || coder == Coders::YAMLColumn`. The string
  // "YAML" is the trails analog of Ruby's `::YAML` module constant. Rails forwards
  // `**(yaml || {})` (permitted_classes/unsafe_load) into the YAMLColumn ctor.
  if (coder === "YAML" || coder === YAMLColumn) {
    return new YAMLColumn(attrName, type as new (...args: unknown[]) => unknown, yaml ?? {});
  }

  if (typeof coder === "function" && !("load" in coder)) {
    return new (coder as any)(attrName, type);
  }

  if (type && type !== Object) {
    return new CodersColumnSerializer(attrName, coder as any, type as any);
  }

  return coder;
}

interface InnerCoder {
  dump(value: unknown): string | null;
  load(raw: unknown): unknown;
}

// Resolved on first use rather than at module eval: Ruby names `Coders::JSON`
// from inside the method body (serialization.rb:211), and eager construction
// here evaluates `Json` while `type/json.ts` → `store.ts` → this module is
// still in flight (CLAUDE.md, "Call-time constant resolution").
let _jsonType: Json | undefined;

/**
 * The default coder. Mirrors Rails' `ActiveRecord::Coders::JSON`, but loads
 * through the `Json` type so invalid JSON deserializes to `null` (rescue)
 * rather than raising — matching `Type::Json#deserialize`.
 */
const JSON_INNER: InnerCoder = {
  dump(value: unknown): string {
    return (_jsonType ??= new Json()).serialize(value) ?? "null";
  },
  load(raw: unknown): unknown {
    return (_jsonType ??= new Json()).deserialize(raw);
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
  /** Rails `serialize :x, coder: YAML, yaml: { permitted_classes: [...] }`. */
  yaml?: YamlColumnOptions;
}

/**
 * Maps trails' `coder`/`type` option spellings onto the `(coder, type)` pair
 * Rails reads straight off its kwargs (serialization.rb:183). The string-keyed
 * `coder: "json" | "array" | "hash"` forms are a trails convenience for
 * `coder: JSON, type: Array | Hash`.
 */
function resolveCoderAndType(
  attrName: string,
  options: SerializeOptions,
  defaultSerializer: unknown,
): { coder: unknown; coderIdentity: unknown; type: unknown } {
  const { coder: coderOpt } = options;

  // Mirrors `coder ||= default_column_serializer` (serialization.rb:183). With
  // no explicit coder, fall back to the class-level configurable default
  // (YAMLColumn by default) rather than a hardcoded path.
  let rawCoder: unknown = defaultSerializer;
  let coderIdentity: unknown = defaultSerializer;
  let objectType: unknown = Object;

  if (!coderOpt) {
    // Mirrors `unless coder; raise ArgumentError, "missing keyword: :coder"`
    // (serialization.rb:184-189): a coderless serialize with no configured
    // default has nothing to fall back to.
    if (!defaultSerializer) {
      throw new ArgumentError(
        "missing keyword: :coder. If no default coder is configured, a coder must be provided to `serialize`.",
      );
    }
  } else if (coderOpt === "json") {
    rawCoder = JSON_INNER;
    // The JSON arm of type_incompatible_with_serialize? fires for `coder == ::JSON`.
    coderIdentity = globalThis.JSON;
  } else if (coderOpt === "array") {
    // trails shorthand for `coder: JSON, type: Array`.
    rawCoder = JSON_INNER;
    coderIdentity = globalThis.JSON;
    objectType = globalThis.Array;
  } else if (coderOpt === "hash") {
    // trails shorthand for `coder: JSON, type: Hash`.
    rawCoder = JSON_INNER;
    coderIdentity = globalThis.JSON;
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

  return { coder: rawCoder, coderIdentity, type: objectType };
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
 * (serialization.rb:183-205).
 *
 * Usage:
 *   User.serialize('preferences', { coder: 'json' })
 *   User.serialize('tags', { coder: 'array' })
 *   User.serialize('settings', { coder: 'hash' })
 *   User.serialize('data', { coder: customCoder })
 *   Post.serialize('tags', { type: Array })
 */
export function serialize(
  this: typeof Base,
  attrName: string,
  options: SerializeOptions = {},
): void {
  const { coder, coderIdentity, type } = resolveCoderAndType(
    attrName,
    options,
    this.defaultColumnSerializer,
  );

  // serialization.rb:191 — `column_serializer = build_column_serializer(attr_name, coder, type, yaml)`.
  const columnSerializer = buildColumnSerializer(attrName, coder, type, options.yaml) as Coder;

  const decorator = (name: string, castType: Type): Type => {
    // Already wrapped by this same coder (post-reflection replay) — no-op so the
    // decoration stays idempotent and we don't stack a fresh Serialized each time
    // a schema reload resets the column's type back to its raw DB form.
    if (castType instanceof Serialized && castType.coder === columnSerializer) return castType;
    // `castType instanceof Json` (computed here, where Json is already imported)
    // catches both Type::Json and its OID::Jsonb subclass — Rails' `is_a?(Json)`.
    if (isTypeIncompatibleWithSerialize(castType, coderIdentity, type, castType instanceof Json)) {
      throw new ColumnNotSerializableError(name, castType);
    }
    // Re-declaring serialize on the same attribute (e.g. switching coders)
    // must wrap the underlying cast type, not stack a second Serialized.
    const subtype = castType instanceof Serialized ? castType.subtype : castType;
    return new Serialized(subtype, columnSerializer);
  };

  // `decorateAttributes` pushes a durable pending decorator that replays on every
  // `_defaultAttributes` rebuild, so the query-side lookup (`type_for_attribute` /
  // `TypeCaster::Map`), which now resolves through `attribute_types` (the decorated
  // default attribute set), sees the `Serialized` cast type once columns reflect —
  // no per-feature post-reflection replay needed.
  this.decorateAttributes([attrName], decorator);
}
