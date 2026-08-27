import {
  extend,
  type Extended,
  include,
  type CodeGenerator,
  type Included,
  included,
  prepend,
} from "@blazetrails/activesupport";
import { Type } from "./type/value.js";
import { AttributeSet } from "./attribute-set.js";
import {
  AttributeMethodPattern,
  AttrNames,
  ClassMethods as AttributeMethodsClassMethods,
  InstanceMethods as AttributeMethodsInstanceMethods,
  defineMethodAttribute,
  type AttributeMethodHost,
  type AttributeMethod,
} from "./attribute-methods.js";
import {
  AttributeRegistration,
  ClassMethods as AttributeRegistrationClassMethods,
  attribute as registrationAttribute,
  type AttributeRegistrationHost,
} from "./attribute-registration.js";

export function attributes(attrs: AttributeSet): Record<string, unknown> {
  return attrs.toHash();
}

export function attributeNames(this: { attributeTypes(): Record<string, Type> }): string[] {
  return Object.keys(this.attributeTypes());
}

export type AttributeInstanceHost = { _attributes: AttributeSet };

/** @internal */
export function _writeAttribute(
  this: AttributeInstanceHost,
  attrName: string,
  value: unknown,
): void {
  this._attributes.writeFromUser(attrName, value);
}

/** @internal */
export interface AttributeOptions {
  default?: unknown;
  limit?: number | null;
  array?: boolean;
  range?: boolean;
}

export function attribute(
  this: AttributeRegistrationHost & { defineAttributeMethod(attrName: string): void },
  name: string,
  typeName?: string | Type | AttributeOptions,
  options?: AttributeOptions,
): void {
  registrationAttribute.call(this, name, typeName, options);
  this.defineAttributeMethod(name);
}

/** @internal */
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
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function initialize(
  this: AttributeInstanceHost & { constructor: { _defaultAttributes(): AttributeSet } },
  super_: () => void,
): void {
  this._attributes = this.constructor._defaultAttributes().deepDup();
  super_();
}

export function initializeDup(
  this: AttributeInstanceHost,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  this._attributes = this._attributes.deepDup();
  super_(other);
}

export function freeze<T>(this: AttributeInstanceHost, super_: () => T): T {
  if (!Object.isFrozen(this)) {
    const attributes = this._attributes;
    const cloned = Object.create(Object.getPrototypeOf(attributes) as object) as AttributeSet;
    Object.assign(cloned, attributes);
    cloned.initializeClone(attributes);
    this._attributes = cloned.freeze();
  }
  return super_();
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ActiveModel::AttributeMethods` (attributes.rb:8); the class/interface merge is how `include()` surfaces on the type side.
export interface Attributes extends Included<typeof AttributeMethodsInstanceMethods> {
  attributeMissing(match: AttributeMethod, ...args: unknown[]): unknown;

  /** @internal */
  _writeAttribute(name: string, value: unknown): void;
  /** @internal */
  "attribute="(name: string, value: unknown): void;
}

type AttributeMethodSuffixHost = AttributeMethodHost &
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `include()`'s own AnyClass shape.
  (new (...args: any[]) => any) & { prototype: object } & {
    attributeMethodSuffix(
      ...suffixes: Array<string | { parameters?: string | null | false }>
    ): void;
  };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Attributes {
  static [included](base: AttributeMethodSuffixHost): void {
    include(base, AttributeRegistration);
    extend(base, AttributeMethodsClassMethods);
    include(base, AttributeMethodsInstanceMethods);

    include(base, { _writeAttribute, "attribute=": _writeAttribute });

    extend(base, ClassMethods);
    extend(base, { defineMethodAttribute });

    prepend(base.prototype, { initInternals: initialize });
    prepend(base.prototype, { initializeDup });
    prepend(base.prototype, { freeze });

    base.attributeMethodSuffix("=", { parameters: "value" });
  }

  _attributes: AttributeSet;

  constructor(..._args: unknown[]) {
    const ctor = this.constructor as { _defaultAttributes?(): AttributeSet };
    this._attributes = ctor._defaultAttributes
      ? ctor._defaultAttributes().deepDup()
      : new AttributeSet();
  }

  attribute(attrName: string): unknown {
    return this._attributes.fetchValue(attrName) ?? null;
  }

  get attributes(): Record<string, unknown> {
    return this._attributes.toHash();
  }

  attributeNames(): string[] {
    return this._attributes.keys();
  }
}

include(Attributes, { attributeMissing: AttributeMethodsInstanceMethods.attributeMissing });

export const ClassMethods = {
  attribute,
  attributeNames,
  setDefineMethodAttribute,
};

/** @noRailsEquivalent PERMANENT */
export type AttributesClassHalf = AttributeRegistrationClassHalf &
  AttributeMethodsClassHalf &
  Extended<typeof ClassMethods> & {
    attributeAliases: Record<string, string>;
    isAttributeAliases: boolean;
    attributeMethodPatterns: AttributeMethodPattern[];
    isAttributeMethodPatterns: boolean;
    /** @internal */
    _aliasesByAttributeName: Map<string, string[]>;
  };

/** @noRailsEquivalent PERMANENT */
export type AttributeRegistrationClassHalf = Extended<typeof AttributeRegistrationClassMethods>;

/** @noRailsEquivalent PERMANENT */
export type AttributeMethodsClassHalf = Extended<typeof AttributeMethodsClassMethods>;
