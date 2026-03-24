import { Error as ActiveModelError } from "./error.js";

interface ErrorLike {
  attribute: string;
  type: string;
  rawType?: string;
  message: string;
  options?: Record<string, unknown>;
}

/**
 * NestedError — wraps an error from an associated model.
 *
 * Mirrors: ActiveModel::NestedError
 */
export class NestedError extends ActiveModelError {
  readonly innerError: ErrorLike;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    base: any,
    innerError: ErrorLike,
    options?: { attribute?: string },
  ) {
    const attribute = options?.attribute ?? innerError.attribute;
    super(base, attribute, innerError.rawType ?? innerError.type, innerError.options ?? {});
    this.innerError = innerError;
  }

  override get message(): string {
    return this.innerError.message;
  }
}
