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
import { type AttributeOptions, type Type, ArgumentError } from "@blazetrails/activemodel";
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

/**
 * Stand-in for Ruby's `Hash` class, passed as `serialize`'s `type:` object
 * class where Rails writes `type: Hash` (serialization.rb:183). JS has no
 * distinct hash class — an object literal is a plain `Object` and so is an
 * array — so there is no constructor with Ruby `Hash`'s two properties that
 * `Coders::ColumnSerializer` needs: `object_class === value` must reject an
 * Array (assert_valid_value, column_serializer.rb:64-69) and `object_class.new`
 * must produce an empty hash (`load`, column_serializer.rb:40-49). A
 * `Symbol.hasInstance` shim supplies both. Passing `Object` instead would make
 * ColumnSerializer's check vacuous, which is a behavior change, not a spelling
 * one.
 *
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export class HashObject {
  constructor() {
    return {};
  }
  static [Symbol.hasInstance](value: unknown): boolean {
    return value != null && typeof value === "object" && !Array.isArray(value);
  }
}

export interface SerializeOptions extends AttributeOptions {
  /** Rails `coder:` (serialization.rb:183) — `JSON`, `YAML`, or any coder object. */
  coder?: unknown;
  /** Rails `type:` (serialization.rb:183) — the object class, default `Object`. */
  type?: unknown;
  /** Rails `serialize :x, coder: YAML, yaml: { permitted_classes: [...] }`. */
  yaml?: YamlColumnOptions;
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
 *   User.serialize('preferences', { coder: JSON })
 *   User.serialize('tags', { coder: JSON, type: Array })
 *   User.serialize('data', { coder: customCoder })
 *   Post.serialize('tags', { type: Array })
 */
export function serialize(
  this: typeof Base,
  attrName: string,
  options: SerializeOptions = {},
): void {
  // serialization.rb:183-190 — `coder: nil, type: Object, yaml: {}, **options`,
  // then `coder ||= default_column_serializer` and the missing-keyword raise.
  // Ruby's `||=` and `unless` are false for nil and false ONLY, so a `false`
  // coder falls back to the default and an empty-string one does not raise.
  const { type = Object, yaml = {} } = options;
  let coder = options.coder;
  if (coder == null || coder === false) coder = this.defaultColumnSerializer;
  if (coder == null || coder === false) {
    throw new ArgumentError(
      "missing keyword: :coder. If no default coder is configured, a coder must be provided to `serialize`.",
    );
  }

  // serialization.rb:191 — `column_serializer = build_column_serializer(attr_name, coder, type, yaml)`.
  const columnSerializer = buildColumnSerializer(attrName, coder, type, yaml) as Coder;

  // serialization.rb:193 — `attribute(attr_name, **options)`: the kwargs left
  // over once `coder:` / `type:` / `yaml:` are bound are attribute options.
  const attributeOptions: AttributeOptions = { ...options };
  delete (attributeOptions as SerializeOptions).coder;
  delete (attributeOptions as SerializeOptions).type;
  delete (attributeOptions as SerializeOptions).yaml;
  this.attribute(attrName, attributeOptions);

  const decorator = (name: string, castType: Type): Type => {
    // Already wrapped by this same coder (post-reflection replay) — no-op so the
    // decoration stays idempotent and we don't stack a fresh Serialized each time
    // a schema reload resets the column's type back to its raw DB form.
    if (castType instanceof Serialized && castType.coder === columnSerializer) return castType;
    // `castType instanceof Json` (computed here, where Json is already imported)
    // catches both Type::Json and its OID::Jsonb subclass — Rails' `is_a?(Json)`.
    if (isTypeIncompatibleWithSerialize(castType, coder, type, castType instanceof Json)) {
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
