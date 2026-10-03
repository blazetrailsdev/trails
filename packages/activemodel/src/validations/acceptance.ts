import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { include, included, kernelArray, mergeBang, Module } from "@blazetrails/activesupport";
import {
  aryIncludes,
  except,
  includedModules,
  rbModAttrReader,
  rbModAttrWriter,
} from "@blazetrails/ruby-compat";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

interface AttributeMethodQueryable {
  prototype: object;
  isAttributeMethod(attribute: string): boolean;
}

export class AcceptanceValidator extends EachValidator {
  /** @internal */
  declare isAcceptableOption: typeof isAcceptableOption;

  constructor(options: Record<string, unknown> & { attributes?: string | string[] }) {
    super(mergeBang({ allowNil: true, accept: ["1", true] }, options));
    this.setupBang(options.class as AttributeMethodQueryable);
  }

  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (!this.isAcceptableOption(value)) {
      record.errors.add(attribute, ":accepted", except(this.options, "accept", "allowNil"));
    }
  }

  /** @internal */
  setupBang(klass: AttributeMethodQueryable): void {
    const defineAttributes = new LazilyDefineAttributes(this.attributes);
    if (!aryIncludes(includedModules(klass), defineAttributes)) {
      include(klass as unknown as Parameters<typeof include>[0], defineAttributes);
    }
  }
}

export class LazilyDefineAttributes extends Module {
  protected readonly attributes: readonly string[];

  #lock: object | null = null;

  constructor(attributes: readonly string[]) {
    super();
    this.attributes = attributes.map((name) => String(name));
  }

  matches(methodName: string): boolean {
    const attrName = methodName.replace(/=$/, "");
    return this.attributes.some((name) => name === attrName);
  }

  defineOn(klass: AttributeMethodQueryable): void {
    if (!this.#lock) return;

    const attrReaders = this.attributes.filter((name) => !klass.isAttributeMethod(name));
    const attrWriters = this.attributes.filter((name) => !klass.isAttributeMethod(`${name}=`));

    this.moduleEval((mod) => {
      rbModAttrReader({ prototype: mod }, ...attrReaders);
      rbModAttrWriter({ prototype: mod }, ...attrWriters);
    });

    this.#lock = null;
  }

  /** @noRailsEquivalent PERMANENT */
  [included](klass: AttributeMethodQueryable): void {
    this.#lock = {};
    this.defineOn(klass);
  }

  equals(other: unknown): boolean {
    return (
      other instanceof LazilyDefineAttributes &&
      this.constructor === other.constructor &&
      this.attributes.length === other.attributes.length &&
      this.attributes.every((name, i) => name === other.attributes[i])
    );
  }
}

/** @internal */
export function isAcceptableOption(
  this: { options: Record<string, unknown> },
  value: unknown,
): boolean {
  return aryIncludes(kernelArray(this.options.accept), value);
}

AcceptanceValidator.prototype.isAcceptableOption = isAcceptableOption;

export const HelperMethods = {
  validatesAcceptanceOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(AcceptanceValidator, this._mergeAttributes(attrNames));
  },
};
