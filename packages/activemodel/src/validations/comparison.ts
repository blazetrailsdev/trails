import { ArgumentError } from "../attribute-assignment.js";
import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { isBlank, slice, underscore } from "@blazetrails/activesupport";
import { cmp, rbCmpint } from "@blazetrails/ruby-compat";
import { COMPARE_CHECKS, compareOperator, errorOptions } from "./comparability.js";
import type { CompareKey } from "./comparability.js";
import { resolveValue } from "./resolve-value.js";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

export class ComparisonValidator extends EachValidator {
  resolveValue = resolveValue;
  errorOptions = errorOptions;

  override checkValidityBang(): void {
    if (!Object.keys(COMPARE_CHECKS).some((k) => this.options[k] !== undefined)) {
      throw new ArgumentError(
        "Expected one of :greater_than, :greater_than_or_equal_to, " +
          ":equal_to, :less_than, :less_than_or_equal_to, or :other_than option to be supplied.",
      );
    }
  }

  validateEach(record: ValidatableRecord, attrName: string, value: unknown): void {
    for (const [option, rawOptionValue] of Object.entries(
      slice(this.options, ...(Object.keys(COMPARE_CHECKS) as CompareKey[])),
    ) as [CompareKey, unknown][]) {
      if (rawOptionValue === undefined) continue;
      const optionValue = this.resolveValue(record, rawOptionValue);

      if (value == null || isBlank(value)) {
        record.errors.add(attrName, ":blank", this.errorOptions(value, optionValue));
        return;
      }

      try {
        if (
          !compareOperator(
            COMPARE_CHECKS[option],
            rbCmpint(cmp(value, optionValue), value, optionValue),
            0,
          )
        ) {
          record.errors.add(
            attrName,
            `:${underscore(option)}`,
            this.errorOptions(value, optionValue),
          );
        }
      } catch (e) {
        if (!(e instanceof ArgumentError)) throw e;
        record.errors.add(attrName, e.message);
      }
    }
  }
}

export const HelperMethods = {
  validatesComparisonOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(ComparisonValidator, this._mergeAttributes(attrNames));
  },
};
