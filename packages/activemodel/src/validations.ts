/**
 * Raised by validateBang when validation fails.
 *
 * Mirrors: ActiveModel::ValidationError
 */
export class ValidationError extends Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly model: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(model: any) {
    super(`Validation failed: ${model.errors.fullMessages.join(", ")}`);
    this.name = "ValidationError";
    this.model = model;
  }
}
