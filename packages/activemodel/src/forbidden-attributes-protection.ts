/**
 * Raised when mass-assigning attributes that haven't been permitted.
 *
 * Mirrors: ActiveModel::ForbiddenAttributesError
 */
export class ForbiddenAttributesError extends globalThis.Error {
  constructor(message?: string) {
    super(message);
    this.name = "ForbiddenAttributesError";
  }
}
