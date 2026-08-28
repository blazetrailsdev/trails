import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { except } from "@blazetrails/activesupport";
import { inspectAccessor } from "./_accessor.js";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

export class LazilyDefineAttributes {
  /** @internal */
  readonly attributes: readonly string[];

  constructor(attributes: string[]) {
    this.attributes = Object.freeze([...attributes]);
  }

  matches(methodName: string): string | null {
    return this.include(methodName) ? methodName : null;
  }

  include(attribute: string): boolean {
    return this.attributes.includes(attribute);
  }

  define(attribute: string): LazilyDefineAttributes {
    if (this.include(attribute)) return this;
    return new LazilyDefineAttributes([...this.attributes, attribute]);
  }
}

/** @internal */
export function setupBang(this: AcceptanceHost, klass: unknown): void {
  if (typeof klass !== "function") return;
  const ctor = klass as { prototype: object };
  for (const attribute of this.attributes) {
    const inherited = inspectAccessor(ctor.prototype, attribute);
    if (inherited.hasGetter && inherited.hasSetter) continue;
    const slot = `_${attribute}`;
    Object.defineProperty(ctor.prototype, attribute, {
      configurable: true,
      get:
        inherited.getter ??
        function (this: Record<string, unknown>) {
          return this[slot];
        },
      set:
        inherited.setter ??
        function (this: Record<string, unknown>, v: unknown) {
          this[slot] = v;
        },
    });
  }
}

export class AcceptanceValidator extends EachValidator {
  static readonly lazilyDefineAttributes = new LazilyDefineAttributes([]);

  /** @internal */
  declare setupBang: typeof setupBang;
  /** @internal */
  declare isAcceptableOption: typeof isAcceptableOption;

  constructor(options: Record<string, unknown> & { attributes?: string | string[] }) {
    super(options);
    this.setupBang(options.class);
  }

  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    const allowNil = this.options.allowNil ?? true;
    if (allowNil && (value === null || value === undefined)) return;
    if (!this.isAcceptableOption(value)) {
      record.errors.add(attribute, ":accepted", except(this.options, "accept", "allowNil"));
    }
  }

  static setup(attributes: string[]): LazilyDefineAttributes {
    return new LazilyDefineAttributes(attributes);
  }
}

interface AcceptanceHost {
  attributes: readonly string[];
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

AcceptanceValidator.prototype.setupBang = setupBang;
AcceptanceValidator.prototype.isAcceptableOption = isAcceptableOption;

export const HelperMethods = {
  validatesAcceptanceOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(AcceptanceValidator, this._mergeAttributes(attrNames));
  },
};
