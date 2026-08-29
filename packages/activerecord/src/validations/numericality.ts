import { NumericalityValidator as BaseNumericalityValidator } from "@blazetrails/activemodel";

const FLOAT_DIG = 15;

export class NumericalityValidator extends BaseNumericalityValidator {
  validateEach(record: any, attribute: string, value: unknown): void {
    const precision = Math.min(columnPrecisionFor(record, attribute) ?? FLOAT_DIG, FLOAT_DIG);
    const scale = columnScaleFor(record, attribute);
    super.validateEach(record, attribute, value, precision, scale);
  }
}

/** @internal */
function columnPrecisionFor(record: any, attribute: string): number | undefined {
  const klass = record.constructor;
  if (typeof klass.typeForAttribute !== "function") return undefined;
  return klass.typeForAttribute(String(attribute))?.precision ?? undefined;
}

/** @internal */
function columnScaleFor(record: any, attribute: string): number | undefined {
  const klass = record.constructor;
  if (typeof klass.typeForAttribute !== "function") return undefined;
  return klass.typeForAttribute(String(attribute))?.scale ?? undefined;
}
