import {
  extend,
  type Extended,
  include,
  type CodeGenerator,
  type Included,
  included,
  prepend,
} from "@blazetrails/activesupport";
import { rbObjClone } from "@blazetrails/ruby-compat";
import { ValueType } from "./type/value.js";
import { AttributeSet } from "./attribute-set.js";
import {
  AttributeMethodPattern,
  AttributeMethods,
  AttrNames,
  ClassMethods as AttributeMethodsClassMethods,
  InstanceMethods as AttributeMethodsInstanceMethods,
  defineMethodAttribute,
  completeHalfAccessor,
  type AttributeMethodHost,
  type AttributeMethod,
} from "./attribute-methods.js";
import {
  AttributeRegistration,
  ClassMethods as AttributeRegistrationClassMethods,
  type AttributeRegistrationHost,
} from "./attribute-registration.js";

export function constructor(
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

export type AttributeInstanceHost = { _attributes: AttributeSet };

export function attributes(attrs: AttributeSet): Record<string, unknown> {
  return attrs.toHash();
}

/** @internal */
export interface AttributeOptions {
  default?: unknown;
  limit?: number | null;
  precision?: number | null;
  scale?: number | null;
  array?: boolean;
  range?: boolean;
}

export function attributeNames(this: { attributeTypes(): Record<string, ValueType> }): string[] {
  return Object.keys(this.attributeTypes());
}

/** @internal */
export function _writeAttribute(
  this: AttributeInstanceHost,
  attrName: string,
  value: unknown,
): void {
  this._attributes.writeFromUser(attrName, value);
}

export function attribute(
  this: AttributeRegistrationHost & { defineAttributeMethod(attrName: string): void },
  name: string,
  typeName?: string | ValueType | AttributeOptions,
  options?: AttributeOptions,
): void {
  AttributeRegistrationClassMethods.attribute.call(this, name, typeName, options);
  this.defineAttributeMethod(name);
}

/** @internal */
export function setDefineMethodAttribute(
  this: unknown,
  canonicalName: string,
  { owner, as = canonicalName }: { owner: CodeGenerator; as?: string },
): void {
  completeHalfAccessor(
    this,
    as,
    "set",
    function (this: { _writeAttribute(n: string, v: unknown): void }, value: unknown) {
      this._writeAttribute(canonicalName, value);
    },
  );
  AttrNames.defineAttributeAccessorMethod(
    owner,
    canonicalName,
    { writer: true },
    (tempMethodName) => {
      owner.defineCachedMethod(
        tempMethodName,
        { namespace: "active_model", as: `${as}=` },
        (batch) => {
          batch.push((mod) => {
            Object.defineProperty(mod, tempMethodName, {
              value: function (
                this: { _writeAttribute(n: string, v: unknown): void },
                value: unknown,
              ) {
                this._writeAttribute(canonicalName, value);
              },
              writable: true,
              configurable: true,
            });
          });
        },
      );
    },
  );
}

export function freeze<T>(this: AttributeInstanceHost, super_: () => T): T {
  if (!Object.isFrozen(this)) {
    this._attributes = rbObjClone(this._attributes).freeze();
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
    include(base, AttributeMethods);

    include(base, { _writeAttribute, "attribute=": _writeAttribute });

    extend(base, ClassMethods);
    extend(base, { defineMethodAttribute });

    prepend(base.prototype, { initInternals: constructor });
    prepend(base.prototype, { initializeDup });
    prepend(base.prototype, { freeze });

    base.attributeMethodSuffix("=", { parameters: "value" });
  }

  declare _attributes: AttributeSet;

  /** @internal */
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

export type AttributeRegistrationClassHalf = Extended<typeof AttributeRegistrationClassMethods>;

export type AttributeMethodsClassHalf = Extended<typeof AttributeMethodsClassMethods>;
