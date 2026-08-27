import { extend, include, type CodeGenerator, included } from "@blazetrails/activesupport";
import { Type } from "./type/value.js";
import { AttributeSet } from "./attribute-set.js";
import {
  AttrNames,
  ClassMethods as AttributeMethodsClassMethods,
  InstanceMethods as AttributeMethodsInstanceMethods,
  defineMethodAttribute,
  type AttributeMethodHost,
  type AttributeMethod,
} from "./attribute-methods.js";
import {
  ClassMethods as AttributeRegistrationClassMethods,
  attribute as registrationAttribute,
  type AttributeRegistrationHost,
} from "./attribute-registration.js";

/**
 * Return all attributes as a plain hash.
 *
 * Mirrors: ActiveModel::Attributes#attributes
 */
export function attributes(attrs: AttributeSet): Record<string, unknown> {
  return attrs.toHash();
}

/**
 * Mirrors: ActiveModel::Attributes::ClassMethods#attribute_names
 * (attributes.rb:74-76) — `attribute_types.keys`.
 */
export function attributeNames(this: { attributeTypes(): Record<string, Type> }): string[] {
  return Object.keys(this.attributeTypes());
}

export type AttributeInstanceHost = { _attributes: AttributeSet };

/**
 * Mirrors: ActiveModel::Attributes#_write_attribute (attributes.rb:156-158) —
 * `@attributes.write_from_user(attr_name, value)`.
 *
 * Rails computes nothing here: `write_from_user` builds a `FromUser` whose
 * `@value` stays uncomputed, so `has_been_read?` is false after a write and
 * `accessed_fields` is empty on a freshly built record
 * (attribute_methods_test.rb:1308).
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
 * Mirrors: ActiveModel::Attributes::ClassMethods#attribute (attributes.rb:59-62)
 * — `super; define_attribute_method(name)`. The `super` is
 * `AttributeRegistration::ClassMethods#attribute`
 * (attribute_registration.rb:12-20); TS has no `super` for a module outside the
 * prototype chain, so the registration half is called through its import alias.
 *
 * A name the class already answers (`toJSON`, `freeze`, `attributes`)
 * gets no accessor, because `define_attribute_method_pattern`'s
 * `instance_method_already_implemented?` arm rejects it; such an attribute still
 * round-trips through `readAttribute` / `writeAttribute`.
 */
export function attribute(
  this: AttributeRegistrationHost & { defineAttributeMethod(attrName: string): void },
  name: string,
  typeName?: string | Type | AttributeOptions,
  options?: AttributeOptions,
): void {
  registrationAttribute.call(this, name, typeName, options);
  this.defineAttributeMethod(name);
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
  const tempMethodName = AttributeMethodsClassMethods.buildMangledName(methodName);
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
 * Deep-dups the attribute set on the copy, then hands control down the
 * `initialize_dup` chain.
 *
 * Mirrors: ActiveModel::Attributes#initialize_dup (attributes.rb:111-114).
 * `ActiveModel::Model` includes `ActiveModel::API`, which includes
 * `Attributes`, so this link sits BELOW Validations and Dirty in the chain —
 * their `super` unwinds into it.
 */
export function initializeDup(
  this: AttributeInstanceHost,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  this._attributes = this._attributes.deepDup();
  super_(other);
}

/**
 * Mirrors: ActiveModel::Attributes#freeze (attributes.rb:150-153)
 *
 *   def freeze # :nodoc:
 *     @attributes = @attributes.clone.freeze unless frozen?
 *     super
 *   end
 *
 * One link of Rails' `freeze` chain; `Model#freeze` runs it where Rails' `super`
 * from `Validations#freeze` (validations.rb:372-377) reaches it, since TS has no
 * `super` across mixins. Ruby's `Object#clone` copies the ivars and dispatches
 * `initialize_clone`, which `AttributeSet` overrides to dup its inner hash
 * (attribute_set.rb:82-85) — spelled here as the same allocate-and-copy `dup()`
 * uses.
 */
export function freeze(this: AttributeInstanceHost): void {
  if (!Object.isFrozen(this)) {
    const attributes = this._attributes;
    const cloned = Object.create(Object.getPrototypeOf(attributes) as object) as AttributeSet;
    Object.assign(cloned, attributes);
    cloned.initializeClone(attributes);
    this._attributes = cloned.freeze();
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ActiveModel::AttributeMethods` (attributes.rb:8); the class/interface merge is how `include()` surfaces on the type side.
export interface Attributes {
  /** Mirrors: attribute_methods.rb:520-522 — `attribute_missing(match, ...)`. */
  attributeMissing(match: AttributeMethod, ...args: unknown[]): unknown;
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
/** The class Ruby's `included(base)` hook receives (attributes.rb:35). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- `include()`'s own AnyClass shape.
type IncludingClass = (new (...args: any[]) => any) & { prototype: object };

/** A class with `ActiveModel::AttributeMethods` already extended onto it. */
type AttributeMethodSuffixHost = AttributeMethodHost & {
  attributeMethodSuffix(...suffixes: Array<string | { parameters?: string | null | false }>): void;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Attributes {
  /**
   * Mirrors: attributes.rb:35-37
   *   included do
   *     attribute_method_suffix "=", parameters: "value"
   *   end
   */
  static [included](base: AttributeMethodSuffixHost): void {
    // attributes.rb:32-33 — `include ActiveModel::AttributeRegistration` and
    // `include ActiveModel::AttributeMethods`. Both are Concerns whose whole
    // contribution is a `ClassMethods` extend (attribute_registration.rb has no
    // `included do` block); AttributeMethods lands second, which is what makes
    // its alias-resolving `resolve_attribute_name` (attribute_methods.rb:396-398)
    // win over the registration one (attribute_registration.rb:101-103).
    extend(base, AttributeRegistrationClassMethods);
    extend(base, AttributeMethodsClassMethods);
    include(base as unknown as IncludingClass, AttributeMethodsInstanceMethods);

    // attributes.rb:39 — the module's own `ClassMethods`, whose `attribute`
    // (:59-61) and `define_method_attribute=` (:92-104) override the
    // registration halves.
    extend(base, ClassMethods);
    extend(base, { defineMethodAttribute });

    // attributes.rb:35 — the `included do` block.
    base.attributeMethodSuffix("=", { parameters: "value" });

    // attributes.rb:156-159 — `_write_attribute` and
    // `alias :attribute= :_write_attribute`, private instance methods this
    // file declares as free functions rather than on the prototype.
    include(base as unknown as IncludingClass, {
      _writeAttribute,
      "attribute=": _writeAttribute,
    });
  }

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

  /**
   * Mirrors: attributes.rb:160-163
   *   private
   *     def attribute(attr_name)
   *       @attributes.fetch_value(attr_name)
   *     end
   *
   * The reader `define_proxy_call` generates for the bare attribute pattern
   * dispatches here (attribute_methods.rb:333-346).
   */
  attribute(attrName: string): unknown {
    return this._attributes.fetchValue(attrName) ?? null;
  }

  /** Mirrors: attributes.rb:131-133 — `def attributes; @attributes.to_hash; end` */
  get attributes(): Record<string, unknown> {
    return this._attributes.toHash();
  }

  /** Mirrors: attributes.rb:146-148 — `def attribute_names; @attributes.keys; end` */
  attributeNames(): string[] {
    return this._attributes.keys();
  }

  /** Mirrors: attributes.rb:150-153 — `@attributes = @attributes.clone.freeze unless frozen?` */
  freeze(): this {
    freeze.call(this);
    // attributes.rb:152 — `super`, which ends at `Object#freeze`.
    Object.freeze(this);
    return this;
  }
}

// Ruby `include ActiveModel::AttributeMethods` (attributes.rb:8) — the module
// brings `attribute_missing` with it; the interface merge above is its type
// side.
include(Attributes, { attributeMissing: AttributeMethodsInstanceMethods.attributeMissing });

/**
 * Mirrors: ActiveModel::Attributes::ClassMethods (attributes.rb:38-104) — the
 * class half `include ActiveModel::Attributes` contributes, issued from the
 * module's own `[included]` hook.
 */
export const ClassMethods = {
  attribute,
  attributeNames,
  setDefineMethodAttribute,
};
