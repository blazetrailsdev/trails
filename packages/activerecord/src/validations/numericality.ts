/**
 * Mirrors: ActiveRecord::Validations::NumericalityValidator
 *
 * Extracts column precision and scale from the database schema
 * and passes them to the ActiveModel validator.
 */
import { NumericalityValidator as BaseNumericalityValidator } from "@blazetrails/activemodel";

// JS Number.MAX_SAFE_INTEGER has 15–16 significant digits. Rails uses
// Float::DIG (15) as the upper bound for precision.
const FLOAT_DIG = 15;

export class NumericalityValidator extends BaseNumericalityValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    const precision = Math.min(this._columnPrecisionFor(record, attribute) ?? FLOAT_DIG, FLOAT_DIG);
    const scale = this._columnScaleFor(record, attribute);
    super.validateEach(record, attribute, value, precision, scale);
  }

  private _columnPrecisionFor(record: any, attribute: string): number | undefined {
    const klass = record.constructor;
    if (typeof klass.typeForAttribute !== "function") return undefined;
    return klass.typeForAttribute(attribute)?.precision ?? undefined;
  }

  private _columnScaleFor(record: any, attribute: string): number | undefined {
    const klass = record.constructor;
    if (typeof klass.typeForAttribute !== "function") return undefined;
    return klass.typeForAttribute(attribute)?.scale ?? undefined;
  }
}
