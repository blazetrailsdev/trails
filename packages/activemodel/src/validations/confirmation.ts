import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { humanize, mergeBang } from "@blazetrails/activesupport";
import { except } from "@blazetrails/ruby-compat";
import { inspectAccessor } from "./_accessor.js";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

export class ConfirmationValidator extends EachValidator {
  /** @internal */
  declare setupBang: typeof setupBang;
  /** @internal */
  declare isConfirmationValueEqual: typeof isConfirmationValueEqual;

  constructor(options: Record<string, unknown> & { attributes?: string | string[] }) {
    super(options);
    this.setupBang(options.class);
  }

  /** @missingRailsArgs merge! — PERMANENT */
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    const confirmationAttr = `${attribute}Confirmation`;
    const rec = record as unknown as Record<string, unknown>;
    const confirmed = rec[confirmationAttr];
    if (confirmed == null) return;
    if (!this.isConfirmationValueEqual(record, attribute, value, confirmed)) {
      const modelClass = rec.constructor as
        | { humanAttributeName?: (a: string) => string }
        | undefined;
      const humanAttr = modelClass?.humanAttributeName
        ? modelClass.humanAttributeName(attribute)
        : humanize(attribute);
      record.errors.add(
        confirmationAttr,
        ":confirmation",
        mergeBang(except(this.options, "caseSensitive"), { attribute: humanAttr }),
      );
    }
  }
}

interface ConfirmationHost {
  attributes: readonly string[];
}

/** @internal */
export function setupBang(this: ConfirmationHost, klass: unknown): void {
  if (typeof klass !== "function") return;
  const ctor = klass as { prototype: object };
  for (const attribute of this.attributes) {
    const confirmationAttr = `${attribute}Confirmation`;
    const inherited = inspectAccessor(ctor.prototype, confirmationAttr);
    if (inherited.hasGetter && inherited.hasSetter) continue;
    const slot = `_${confirmationAttr}`;
    Object.defineProperty(ctor.prototype, confirmationAttr, {
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

/** @internal */
export function isConfirmationValueEqual(
  this: { options: Record<string, unknown> },
  _record: ValidatableRecord,
  _attribute: string,
  value: unknown,
  confirmed: unknown,
): boolean {
  const caseSensitive = this.options.caseSensitive ?? true;
  if (!caseSensitive && typeof value === "string" && typeof confirmed === "string") {
    return value.toLowerCase() === confirmed.toLowerCase();
  }
  return value === confirmed;
}

ConfirmationValidator.prototype.setupBang = setupBang;
ConfirmationValidator.prototype.isConfirmationValueEqual = isConfirmationValueEqual;

export const HelperMethods = {
  validatesConfirmationOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(ConfirmationValidator, this._mergeAttributes(attrNames));
  },
};
