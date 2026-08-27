import type { ValidatableRecord } from "../validator.js";
import { HelperMethods as AbsenceHelperMethods } from "./absence.js";
import { HelperMethods as AcceptanceHelperMethods } from "./acceptance.js";
import { HelperMethods as ComparisonHelperMethods } from "./comparison.js";
import { HelperMethods as ConfirmationHelperMethods } from "./confirmation.js";
import { HelperMethods as ExclusionHelperMethods } from "./exclusion.js";
import { HelperMethods as FormatHelperMethods } from "./format.js";
import { HelperMethods as InclusionHelperMethods } from "./inclusion.js";
import { HelperMethods as LengthHelperMethods } from "./length.js";
import { HelperMethods as NumericalityHelperMethods } from "./numericality.js";
import { HelperMethods as PresenceHelperMethods } from "./presence.js";

export type AttrNameArg = string | readonly AttrNameArg[] | Record<string, unknown>;

export interface HelperMethodsHost {
  _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
  validatesWith(
    validatorClass: new (options: Record<string, unknown>) => {
      validate(record: ValidatableRecord): unknown;
    },
    options: Record<string, unknown>,
  ): void;
}

export const HelperMethods = {
  /** @internal */
  _mergeAttributes(attrNames: unknown[]): Record<string, unknown> {
    const last = attrNames[attrNames.length - 1];
    const options: Record<string, unknown> =
      last !== null &&
      typeof last === "object" &&
      !Array.isArray(last) &&
      last.constructor === Object
        ? { ...(attrNames.pop() as Record<string, unknown>) }
        : {};
    const flat = attrNames.flat(Infinity).map((n) => String(n));
    options.attributes = flat;
    return options;
  },

  ...AbsenceHelperMethods,
  ...AcceptanceHelperMethods,
  ...ComparisonHelperMethods,
  ...ConfirmationHelperMethods,
  ...ExclusionHelperMethods,
  ...FormatHelperMethods,
  ...InclusionHelperMethods,
  ...LengthHelperMethods,
  ...NumericalityHelperMethods,
  ...PresenceHelperMethods,
};
