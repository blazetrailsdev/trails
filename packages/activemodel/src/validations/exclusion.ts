import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { include } from "@blazetrails/activesupport";
import {
  checkValidityBang,
  type Clusivity,
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
/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- Ruby `include Clusivity` (exclusion.rb:8); the class/interface merge is how `include()` surfaces on the type side, and it adds no members of its own. */
export interface ExclusionValidator extends Clusivity {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ExclusionValidator extends EachValidator {
  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    if (this.isInclude(record, value)) {
      record.errors.add(attribute, ":exclusion", exceptInWithinMergeValue(this.options, value));
    }
  }
}

// Mirrors: `include Clusivity` (exclusion.rb:8). The module lands on the
// prototype rather than on class fields because `EachValidator`'s constructor
// calls `this.checkValidityBang()`, and class fields do not initialize until
// after `super()` returns.
include(ExclusionValidator, {
  checkValidityBang,
  resolveValue,
  delimiter,
  inclusionMethod,
  isInclude,
});
