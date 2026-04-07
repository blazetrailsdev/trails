import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";

export interface AcceptanceOptions extends ConditionalOptions {
  accept?: unknown[];
  allowNil?: boolean;
  message?: string;
}

/**
 * Manages lazily-defined virtual attributes for acceptance validation.
 * These attributes exist only for validation and aren't persisted.
 *
 * Mirrors: ActiveModel::Validations::AcceptanceValidator::LazilyDefineAttributes
 */
export class LazilyDefineAttributes {
  readonly attributes: readonly string[];

  constructor(attributes: string[]) {
    this.attributes = Object.freeze([...attributes]);
  }

  include(attribute: string): boolean {
    return this.attributes.includes(attribute);
  }

  matches(method: string): string | null {
    return this.include(method) ? method : null;
  }

  define(attribute: string): LazilyDefineAttributes {
    if (this.include(attribute)) return this;
    return new LazilyDefineAttributes([...this.attributes, attribute]);
  }
}

export class AcceptanceValidator implements Validator {
  static readonly lazilyDefineAttributes = new LazilyDefineAttributes([]);

  constructor(private options: AcceptanceOptions = {}) {}

  validate(record: AnyRecord, attribute: string, value: unknown, errors: Errors): void {
    if (!shouldValidate(record, this.options)) return;
    this.validateEach(record, attribute, value, errors);
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown, errors?: Errors): void {
    const errs = errors ?? record.errors;
    const allowNil = this.options.allowNil ?? true;
    if (allowNil && (value === null || value === undefined)) return;
    const accepted = this.options.accept ?? ["1", "true", true];
    if (!accepted.includes(value)) {
      errs.add(attribute, "accepted", { message: this.options.message });
    }
  }

  static setup(attributes: string[]): LazilyDefineAttributes {
    return new LazilyDefineAttributes(attributes);
  }
}
