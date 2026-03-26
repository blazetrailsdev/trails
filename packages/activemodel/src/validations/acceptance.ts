import type { Errors } from "../errors.js";
import type {
  AnyRecord,
  ConditionalOptions,
  ValidatorContract as Validator,
} from "../validator.js";
import { shouldValidate } from "../validator.js";

export interface AcceptanceOptions extends ConditionalOptions {
  accept?: unknown[];
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
    if (value === null || value === undefined) return;
    const accepted = this.options.accept ?? [true, "true", "1", 1, "yes"];
    if (!accepted.includes(value)) {
      errors.add(attribute, "accepted", { message: this.options.message });
    }
  }

  static setup(attributes: string[]): LazilyDefineAttributes {
    return new LazilyDefineAttributes(attributes);
  }
}
