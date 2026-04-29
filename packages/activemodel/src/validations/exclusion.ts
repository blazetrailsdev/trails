import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import {
  checkValidityBang,
  delimiter,
  exceptInWithinMergeValue,
  inclusionMethod,
  isInclude,
  resolveValue,
} from "./clusivity.js";

/**
 * Mirrors: ActiveModel::Validations::ExclusionValidator (exclusion.rb)
 *
 *   class ExclusionValidator < EachValidator
 *     include Clusivity
 *     def validate_each(record, attribute, value)
 *       if include?(record, value)
 *         record.errors.add(attribute, :exclusion,
 *           **options.except(:in, :within).merge!(value: value))
 *       end
 *     end
 *   end
 *
 * `nil`/`undefined` are NOT pre-skipped here — Rails relies on
 * EachValidator's allow_nil dispatch (validator.ts:100) so excluding
 * `nil` works when the excluded set explicitly contains it.
 */
export class ExclusionValidator extends EachValidator {
  // Declarations only — actual functions attached to the prototype below.
  // Prototype attachment (not class fields) so the Clusivity helpers are
  // available during super() / EachValidator's constructor-time
  // checkValidity() call.
  declare resolveValue: typeof resolveValue;
  /** @internal */
  declare delimiter: typeof delimiter;
  /** @internal */
  declare inclusionMethod: typeof inclusionMethod;
  /** @internal */
  declare isInclude: typeof isInclude;

  override checkValidity(): void {
    checkValidityBang.call(this);
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    if (this.isInclude(record, value)) {
      record.errors.add(attribute, "exclusion", exceptInWithinMergeValue(this.options, value));
    }
  }
}

ExclusionValidator.prototype.resolveValue = resolveValue;
ExclusionValidator.prototype.delimiter = delimiter;
ExclusionValidator.prototype.inclusionMethod = inclusionMethod;
ExclusionValidator.prototype.isInclude = isInclude;
