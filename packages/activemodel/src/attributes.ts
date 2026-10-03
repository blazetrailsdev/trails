import {
  extend,
  type Extended,
  include,
  type CodeGenerator,
  type Included,
  included,
} from "@blazetrails/activesupport";
import { Module, rbObjClone } from "@blazetrails/ruby-compat";
import { ValueType } from "./type/value.js";
import { AttributeSet } from "./attribute-set.js";
import {
  AttributeMethodPattern,
  AttributeMethods,
  AttrNames,
  ClassMethods as AttributeMethodsClassMethods,
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
  ...args: unknown[]
): void {
  this._attributes = this.constructor._defaultAttributes().deepDup();
  SuperMethods.superMethod(this, "initialize")!(...args);
}

export function initializeDup(this: AttributeInstanceHost, other: unknown): void {
  this._attributes = this._attributes.deepDup();
  SuperMethods.superMethod(this, "initializeDup")!(other);
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

export function freeze<T extends AttributeInstanceHost>(this: T): T {
  if (!Object.isFrozen(this)) {
    this._attributes = rbObjClone(this._attributes).freeze();
  }
  return SuperMethods.superMethod(this, "freeze")!() as T;
}

const SuperMethods = new Module((mod) => {
  mod.defineMethod("initialize", constructor);
  mod.defineMethod("initializeDup", initializeDup);
  mod.defineMethod("freeze", freeze);
});

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

export function aliasAttributeMethodDefinition(
  this: {
    defineAttributeMethodPattern(
      pattern: AttributeMethodPattern,
      attrName: string,
      options: { owner: CodeGenerator; as: string; override?: boolean },
    ): void;
  },
  codeGenerator: CodeGenerator,
  pattern: AttributeMethodPattern,
  newName: string,
  oldName: string,
): void {
  this.defineAttributeMethodPattern(pattern, oldName, {
    owner: codeGenerator,
    as: newName,
    override: true,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ActiveModel::AttributeMethods` (attributes.rb:8); the class/interface merge is how `include()` surfaces on the type side.
export interface Attributes extends Included<typeof AttributeMethods> {
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
    extend(base, { defineMethodAttribute, aliasAttributeMethodDefinition });

    include(base, SuperMethods);

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

include(Attributes, { attributeMissing: AttributeMethods.attributeMissing });

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
