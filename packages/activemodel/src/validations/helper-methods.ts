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

/**
 * A `validates_*_of` argument: an attribute name, a (possibly nested) array of
 * names, or the trailing options hash — what `_merge_attributes` extracts and
 * then `attr_names.flatten!`s (helper_methods.rb:7-10).
 */
export type AttrNameArg = string | readonly AttrNameArg[] | Record<string, unknown>;

/**
 * The surface a `HelperMethods` body self-sends. Ruby both `extend`s and
 * `include`s the module (validations.rb:45-46), so one body serves both roles;
 * `validates_with` is the class one here and the instance one there, and each
 * helper returns its result so the instance role's promise (async since RFC
 * 0063) reaches the caller. It is typed `void` because the class role is what a
 * `validates_*_of` call site is: `Model` re-declares the two instance halves it
 * exposes as `Promise<void>`.
 */
export interface HelperMethodsHost {
  _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
  validatesWith(
    validatorClass: new (options: Record<string, unknown>) => {
      validate(record: ValidatableRecord): unknown;
    },
    options: Record<string, unknown>,
  ): void;
}

/**
 * Mirrors: ActiveModel::Validations::HelperMethods (helper_methods.rb:5-13),
 * which Ruby reopens in each validator file. The spreads are that reopening —
 * every `validates_*_of` body lives in the `.ts` matching its `.rb`.
 */
export const HelperMethods = {
  /**
   * Mirrors: `_merge_attributes` (helper_methods.rb:7-11) — split the attribute
   * names from the trailing options hash and stamp the merged options with
   * `attributes:`.
   *
   * @internal Rails-private helper.
   */
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
