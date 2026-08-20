import type { CodeGenerator } from "@blazetrails/activesupport";
import { Type } from "./type/value.js";
import { typeRegistry } from "./type/registry.js";
import { AttributeSet } from "./attribute-set.js";
import {
  AttrNames,
  attributeMissing,
  isAttributeMethod as _isAttributeMethod,
  matchedAttributeMethod as _matchedAttributeMethod,
  missingAttribute as _missingAttribute,
  _readAttribute as __readAttribute,
  attributeAliases as _attributeAliases,
  isAttributeAliases as _isAttributeAliases,
  attributeMethodPatterns as _attributeMethodPatterns,
  buildMangledName,
  defineAttributeMethod as _defineAttributeMethod,
  isAttributeMethodPatterns as _isAttributeMethodPatterns,
  isRespondToWithoutAttributes as _isRespondToWithoutAttributes,
  type AttributeMethodHost,
  type AttributeMethodPattern,
} from "./attribute-methods.js";
import {
  pendingAttributeModifications,
  PendingType,
  PendingDefault,
  resetDefaultAttributes,
} from "./attribute-registration.js";
import { type InstanceHost } from "./attribute-methods.js";

export interface AttributeDefinition {
  name: string;
  type: Type;
  defaultValue: unknown;
  virtual?: boolean;
  limit?: number | null;
  /**
   * Mirrors: the `user_provided_default:` keyword on
   * `ActiveRecord::Attributes::ClassMethods#define_attribute`
   * (activerecord/lib/active_record/attributes.rb:235-238), which Rails passes
   * through to `define_default_attribute`'s `from_user:` and never stores.
   * trails records it on the definition because schema reflection re-registers
   * definitions and must not overwrite a user-declared one (model-schema.ts
   * `ensureSchemaLoaded`).
   *
   * Optional for backwards compatibility with downstream consumers that
   * construct `AttributeDefinition` directly. When absent, treated as
   * `true` (user-authored).
   */
  userProvidedDefault?: boolean;
}

/**
 * Return all attributes as a plain hash.
 *
 * Mirrors: ActiveModel::Attributes#attributes
 */
export function attributes(attrs: AttributeSet): Record<string, unknown> {
  return attrs.toHash();
}

/**
 * Mirrors: ActiveModel::Attributes#_write_attribute
 *
 * Writes a value into the attribute store via the user-write path (casts
 * through the type's `cast` method before storing).
 *
 * @internal Rails-private helper.
 */
export function _writeAttribute(
  this: AttributeInstanceHost,
  attrName: string,
  value: unknown,
): void {
  this._attributes.writeFromUser(attrName, value);
}

// ---------------------------------------------------------------------------
// Class methods — Mirrors: ActiveModel::Attributes::ClassMethods
// ---------------------------------------------------------------------------

/**
 * Declare a typed attribute with an optional default.
 *
 * Mirrors: ActiveModel::Attributes::ClassMethods#attribute
 *
 * Model.attribute() delegates here. This is the canonical implementation
 * of the class-level `attribute` declaration.
 *
 * @internal
 */
export interface AttributeOptions {
  default?: unknown;
  virtual?: boolean;
  /**
   * Mirrors Rails' `user_provided_default:` keyword. Defaults to true —
   * any call to `attribute(...)` is treated as user-authored. Internal
   * schema-reflection paths pass `false` so user-declared attributes win
   * on re-registration.
   */
  userProvidedDefault?: boolean;
  limit?: number | null;
  /**
   * PG type modifiers, forwarded to the registry as Rails' `**options` are:
   * `attribute :tags, :string, array: true` / `:my_range, :string, range: true`
   * (postgresql_adapter.rb:1166-1167 register them via `add_modifier`).
   */
  array?: boolean;
  range?: boolean;
}

/**
 * Mirrors: ActiveModel::Attributes::ClassMethods#attribute (attributes.rb:59-61)
 * — registers the attribute, then `define_attribute_method(name)` generates its
 * methods. A name the class already answers (`toJSON`, `freeze`, `attributes`)
 * gets no accessor, because `define_attribute_method_pattern`'s
 * `instance_method_already_implemented?` arm rejects it; such an attribute still
 * round-trips through `readAttribute` / `writeAttribute`.
 *
 * @internal
 */
export function attribute(
  this: {
    _attributeDefinitions: Map<string, AttributeDefinition>;
    prototype: object;
    _cachedDefaultAttributes?: AttributeSet | null;
    resolveTypeName(name: string, options?: Record<string, unknown>): Type;
    resolveAttributeName(name: string): string;
  },
  name: string,
  // Mirrors Rails' `attribute(name, type = nil, **options)`: the type is
  // optional. When omitted, the attribute keeps its existing (schema-reflected
  // or previously-declared) type and only the default/decorator is applied —
  // backing the `attribute :col, default: "x"` idiom. See
  // activemodel/lib/active_model/attribute_registration.rb:18,55-63.
  typeName?: string | Type | AttributeOptions,
  options?: AttributeOptions,
): void {
  name = this.resolveAttributeName(name);
  // Type-optional form: `attribute(name, options)`. The second positional is
  // the options hash rather than a type when it isn't a string or Type.
  if (typeName !== undefined && typeof typeName !== "string" && !(typeName instanceof Type)) {
    options = typeName;
    typeName = undefined;
  }
  const typeProvided = typeName !== undefined;
  const userProvidedDefault = options?.userProvidedDefault !== false;
  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
    this._attributeDefinitions = new Map(this._attributeDefinitions);
  }
  const existing = this._attributeDefinitions.get(name);
  // When the type is omitted, preserve the existing attribute's type (Rails'
  // PendingType `with_type` inheritance path); fall back to the value type only
  // when nothing is known about the attribute yet.
  // Rails' `attribute(name, ...)` forwards `**options` straight to the type
  // registry (attributes.rb:59-62 → attribute_registration.rb:18); the three
  // keys consumed here — `default`, `virtual`, `user_provided_default` — are
  // the ones Rails names explicitly, so only the rest reach the registry.
  const {
    default: _default,
    virtual: _virtual,
    userProvidedDefault: _upd,
    ...typeOptions
  } = options ?? {};
  const type = typeProvided
    ? typeName instanceof Type
      ? typeName
      : this.resolveTypeName(
          typeName as string,
          Object.keys(typeOptions).length > 0
            ? (typeOptions as Record<string, unknown>)
            : undefined,
        )
    : (existing?.type ?? typeRegistry.lookup("value"));
  // Preserve the existing defaultValue when no default is explicitly provided,
  // matching Rails' PendingType behavior: with_type only changes the type and
  // leaves the current default/value untouched.
  const defaultValue =
    options?.default !== undefined ? options.default : (existing?.defaultValue ?? null);
  this._attributeDefinitions.set(name, {
    ...existing,
    name,
    type,
    defaultValue,
    virtual: options?.virtual ?? existing?.virtual,
    userProvidedDefault,
    ...(options?.limit != null ? { limit: options.limit } : {}),
  });

  // Push to pending-modification queue so _defaultAttributes() replays in
  // the correct order relative to schema-reflected columns (AR) or other
  // pending modifications (AM inheritance).
  // Mirrors: ActiveModel::AttributeRegistration#attribute —
  //   pending << PendingType.new(name, type) if type || no_default
  //   pending << PendingDefault.new(name, default) unless no_default
  // A bare re-declaration (no type, no default) still pushes a PendingType with
  // a nil type so it re-anchors to the attribute's current type at replay; a
  // default-only call pushes only PendingDefault, preserving the existing type.
  const noDefault = options?.default === undefined;
  if (typeProvided || noDefault) {
    pendingAttributeModifications
      .call(this)
      .push(new PendingType(name, typeProvided ? type : null));
  }
  if (!noDefault) {
    pendingAttributeModifications.call(this).push(new PendingDefault(name, defaultValue));
  }

  // Mirrors: Rails reset_default_attributes — invalidate cache on this class
  // and all known subclasses so they recompute on next _defaultAttributes() call.
  resetDefaultAttributes(this);

  _defineAttributeMethod.call(this as unknown as AttributeMethodHost, name);
}

/**
 * Mirrors: ActiveModel::Attributes::ClassMethods#define_method_attribute=
 * (attributes.rb:92-102) — the writer hook `define_attribute_method_pattern`
 * dispatches the `"="` suffix pattern (attributes.rb:35) through
 * (attribute_methods.rb:333-335), generating
 * `def name=(value); _write_attribute("name", value); end`.
 *
 * Ruby's `name=` writer takes the `set*` spelling here
 * (docs/ruby-ts-conventions.md) because the bare camel name belongs to the
 * bare pattern's generated reader, as it does in Ruby. The generated method
 * keeps Rails' own name, `"#{as}="`; a JS assignment (`person.name = x`)
 * reaches the `set` half of that reader's accessor property instead, because a
 * `MethodSet` applies one descriptor per generated name
 * (code_generator.rb:32-36) and a property cannot take its halves from two.
 *
 * ActiveModel has no `define_method_attribute` upstream — only ActiveRecord
 * does (attribute_methods/read.rb:11). That it exists here is the repo-wide
 * rule ratified in CLAUDE.md § "Generated attribute readers are properties",
 * not a local decision; see that section rather than re-deriving it.
 *
 * @internal Rails-private helper.
 */
export function setDefineMethodAttribute(
  this: unknown,
  canonicalName: string,
  { owner, as = canonicalName }: { owner: CodeGenerator; as?: string },
): void {
  const { methodName } = AttrNames.defineAttributeAccessorMethod(owner, canonicalName, {
    writer: true,
  });
  const tempMethodName = buildMangledName(methodName);
  owner.defineCachedMethod(tempMethodName, { namespace: "active_model", as: `${as}=` }, (batch) => {
    batch.push((mod) => {
      Object.defineProperty(mod, tempMethodName, {
        value: function (this: { _writeAttribute(n: string, v: unknown): void }, value: unknown) {
          this._writeAttribute(canonicalName, value);
        },
        writable: true,
        configurable: true,
      });
    });
  });
}

/**
 * Concrete mixin host for `ActiveModel::Attributes`. Rails ships
 * `Attributes` as a module included into a model; in TS this class is
 * the canonical instance-side surface. `Model` composes the same
 * behavior into its own constructor for ergonomic subclassing without
 * forcing inheritance from `Attributes`, but any lighter-weight host
 * that wants the bare attribute machinery can extend this class
 * directly.
 *
 * Mirrors: ActiveModel::Attributes (instance side, attributes.rb:31-160)
 */
export class Attributes {
  _attributes: AttributeSet;

  /**
   * Mirrors: attributes.rb:106-109
   *   def initialize(*) # :nodoc:
   *     @attributes = self.class._default_attributes.deep_dup
   *     super
   *   end
   *
   * The rest parameter mirrors Rails' `(*)` splat: subclasses can
   * forward arbitrary arguments via `super(...args)` even though this
   * base ignores them.
   */
  constructor(..._args: unknown[]) {
    const ctor = this.constructor as { _defaultAttributes?(): AttributeSet };
    this._attributes = ctor._defaultAttributes
      ? ctor._defaultAttributes().deepDup()
      : new AttributeSet();
  }

  /** Mirrors: attributes.rb:131-133 — `def attributes; @attributes.to_hash; end` */
  get attributes(): Record<string, unknown> {
    return this._attributes.toHash();
  }

  /** Mirrors: attributes.rb:146-148 — `def attribute_names; @attributes.keys; end` */
  attributeNames(): string[] {
    return this._attributes.keys();
  }

  /**
   * Mirrors: attribute_methods.rb:520-522 — `attribute_missing(match, ...)`
   * surfaces on Attributes via `include AttributeMethods`. Defined as a
   * prototype method (not a class field) so subclass overrides take
   * effect — class fields would shadow them.
   */
  attributeMissing(match: { proxyTarget: string; attrName: string }, ...args: unknown[]): unknown {
    return attributeMissing.call(this as unknown as Record<string, unknown>, match, ...args);
  }
}

// ---------------------------------------------------------------------------
// Rails privates surfaced by attributes.rb
// ---------------------------------------------------------------------------

/** @internal Rails-private helper. Mirrors: #attribute_method? (via AttributeMethods include) */
export function isAttributeMethod(this: InstanceHost, attrName: string): boolean {
  return _isAttributeMethod.call(this, attrName);
}

/** @internal Rails-private helper. Mirrors: #matched_attribute_method (via AttributeMethods include) */
export function matchedAttributeMethod(
  this: InstanceHost,
  methodName: string,
): { proxyTarget: string; attrName: string } | null {
  return _matchedAttributeMethod.call(this, methodName);
}

type AttributeInstanceHost = { _attributes: AttributeSet };

/** @internal Rails-private helper. Mirrors: #missing_attribute (via AttributeMethods include) */
export function missingAttribute(this: InstanceHost, attrName: string, stack?: string): never {
  return _missingAttribute.call(this, attrName, stack);
}

/** @internal Rails-private helper. Mirrors: #_read_attribute (via AttributeMethods include) */
export function _readAttribute(this: InstanceHost, attr: string): unknown {
  type ReadAttributeThis = InstanceHost & {
    _attributes?: { fetchValue(name: string): unknown };
    _readAttribute?(name: string): unknown;
  };
  return __readAttribute.call(this as unknown as ReadAttributeThis, attr);
}

/** @internal Rails class_attribute. Mirrors: #attribute_aliases (via AttributeMethods include) */
export function attributeAliases(this: AttributeMethodHost): Record<string, string> {
  return _attributeAliases.call(this);
}

/** @internal Rails class_attribute predicate. Mirrors: #attribute_aliases? (via AttributeMethods include) */
export function isAttributeAliases(this: AttributeMethodHost): boolean {
  return _isAttributeAliases.call(this);
}

/** @internal Rails class_attribute. Mirrors: #attribute_method_patterns (via AttributeMethods include) */
export function attributeMethodPatterns(this: AttributeMethodHost): AttributeMethodPattern[] {
  return _attributeMethodPatterns.call(this);
}

/** @internal Rails class_attribute predicate. Mirrors: #attribute_method_patterns? (via AttributeMethods include) */
export function isAttributeMethodPatterns(this: AttributeMethodHost): boolean {
  return _isAttributeMethodPatterns.call(this);
}

/** @internal Rails-private helper. Mirrors: #respond_to_without_attributes? (via AttributeMethods include) */
export function isRespondToWithoutAttributes(
  this: object,
  method: string,
  includePrivateMethods: boolean = false,
): boolean {
  return _isRespondToWithoutAttributes.call(this, method, includePrivateMethods);
}
