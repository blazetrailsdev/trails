import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { filterMap, mergeBang } from "@blazetrails/activesupport";
import {
  casecmp,
  except,
  isNil,
  rbEqual,
  rbFPublicSend,
  rbModAttrReader,
  rbModAttrWriter,
  rbModMethodDefined,
  rtest,
} from "@blazetrails/ruby-compat";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

export class ConfirmationValidator extends EachValidator {
  /** @internal */
  declare setupBang: typeof setupBang;
  /** @internal */
  declare isConfirmationValueEqual: typeof isConfirmationValueEqual;

  constructor(options: Record<string, unknown> & { attributes?: string | string[] }) {
    super(mergeBang({ caseSensitive: true }, options));
    this.setupBang(options.class as { prototype: object });
  }

  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    const confirmed = rbFPublicSend(record, `${attribute}Confirmation`);
    if (!isNil(confirmed)) {
      if (!this.isConfirmationValueEqual(record, attribute, value, confirmed)) {
        const humanAttributeName = (
          record.constructor as unknown as { humanAttributeName(attribute: string): string }
        ).humanAttributeName(attribute);
        record.errors.add(
          `${attribute}Confirmation`,
          ":confirmation",
          mergeBang(except(this.options, "caseSensitive"), { attribute: humanAttributeName }),
        );
      }
    }
  }
}

interface ConfirmationHost {
  attributes: readonly string[];
}

/** @internal */
export function setupBang(this: ConfirmationHost, klass: { prototype: object }): void {
  rbModAttrReader(
    klass,
    ...filterMap([...this.attributes], (attribute) => {
      if (!rbModMethodDefined(klass, `${attribute}Confirmation`)) {
        return `${attribute}Confirmation`;
      }
    }),
  );

  rbModAttrWriter(
    klass,
    ...filterMap([...this.attributes], (attribute) => {
      if (!rbModMethodDefined(klass, `${attribute}Confirmation=`)) {
        return `${attribute}Confirmation`;
      }
    }),
  );
}

/** @internal */
export function isConfirmationValueEqual(
  this: { options: Record<string, unknown> },
  _record: ValidatableRecord,
  _attribute: string,
  value: unknown,
  confirmed: unknown,
): boolean {
  if (!rtest(this.options.caseSensitive) && typeof value === "string") {
    return casecmp(value, confirmed) === 0;
  } else {
    return rbEqual(value, confirmed);
  }
}

ConfirmationValidator.prototype.setupBang = setupBang;
ConfirmationValidator.prototype.isConfirmationValueEqual = isConfirmationValueEqual;

export const HelperMethods = {
  validatesConfirmationOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(ConfirmationValidator, this._mergeAttributes(attrNames));
  },
};
