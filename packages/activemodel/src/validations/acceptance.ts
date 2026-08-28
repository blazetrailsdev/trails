import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { except, include, included, isModuleIncluded, Module } from "@blazetrails/activesupport";
import { inspectAccessor } from "./_accessor.js";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

interface AttributeMethodQueryable {
  prototype: object;
  isAttributeMethod(attribute: string): boolean;
}

export class AcceptanceValidator extends EachValidator {
  /** @internal */
  declare isAcceptableOption: typeof isAcceptableOption;

  constructor(options: Record<string, unknown> & { attributes?: string | string[] }) {
    super(options);
    this.setupBang(options.class as AttributeMethodQueryable);
  }

  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    const allowNil = this.options.allowNil ?? true;
    if (allowNil && (value === null || value === undefined)) return;
    if (!this.isAcceptableOption(value)) {
      record.errors.add(attribute, ":accepted", except(this.options, "accept", "allowNil"));
    }
  }

  /**
   * @internal
   * @missingRailsCall include? — PERMANENT
   */
  setupBang(klass: AttributeMethodQueryable): void {
    const defineAttributes = new LazilyDefineAttributes(this.attributes);
    if (!isModuleIncluded(klass, defineAttributes)) {
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
      for (const name of new Set([...attrReaders, ...attrWriters])) {
        const inherited = inspectAccessor(klass.prototype, name);
        const slot = `_${name}`;
        Object.defineProperty(mod, name, {
          configurable: true,
          get: attrReaders.includes(name)
            ? (inherited.getter ??
              function (this: Record<string, unknown>) {
                return this[slot];
              })
            : inherited.getter,
          set: attrWriters.includes(name)
            ? (inherited.setter ??
              function (this: Record<string, unknown>, value: unknown) {
                this[slot] = value;
              })
            : inherited.setter,
        });
      }
    });

    this.#lock = null;
  }

  /**
   * @missingRailsCall define_method — PERMANENT
   * @noRailsEquivalent PERMANENT
   */
  [included](klass: AttributeMethodQueryable): void {
    this.#lock = {};
    this.defineOn(klass);
  }

  /** @noRailsEquivalent PERMANENT */
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
  const hasAccept = Object.hasOwn(this.options, "accept");
  let accepted: unknown[];
  if (!hasAccept) accepted = ["1", true];
  else {
    const rawAccept = this.options.accept;
    if (rawAccept === null || rawAccept === undefined) accepted = [];
    else if (Array.isArray(rawAccept)) accepted = rawAccept;
    else if (isNonStringIterable(rawAccept)) accepted = Array.from(rawAccept);
    else accepted = [rawAccept];
  }
  return accepted.includes(value);
}

function isNonStringIterable(value: unknown): value is Iterable<unknown> {
  if (typeof value !== "object" || value === null) return false;
  if (value instanceof String) return false;
  return typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function";
}

AcceptanceValidator.prototype.isAcceptableOption = isAcceptableOption;

export const HelperMethods = {
  validatesAcceptanceOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(AcceptanceValidator, this._mergeAttributes(attrNames));
  },
};
