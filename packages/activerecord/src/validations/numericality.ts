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

export function validatesNumericalityOf(
  this: {
    validatesWith(validatorClass: unknown, opts: Record<string, unknown>): void;
    _mergeAttributes(attrNames: unknown[]): Record<string, unknown>;
  },
  ...attrNames: unknown[]
): void {
  this.validatesWith(NumericalityValidator, this._mergeAttributes(attrNames));
}

export const ClassMethods = { validatesNumericalityOf };
