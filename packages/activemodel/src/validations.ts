/**
 * Raised by validateBang when validation fails.
 *
 * Mirrors: ActiveModel::ValidationError
 */
export class ValidationError extends globalThis.Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly model: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(model: any) {
    super(`Validation failed: ${model.errors.fullMessages.join(", ")}`);
    this.name = "ValidationError";
    this.model = model;
  }
}

/**
 * Represents a named validation context (e.g., :create, :update).
 *
 * Mirrors: ActiveModel::ValidationContext
 */
export class ValidationContext {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }

  toString(): string {
    return this.name;
  }
}
