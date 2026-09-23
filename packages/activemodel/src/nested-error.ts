import { Error as ActiveModelError } from "./error.js";

interface ErrorLike {
  attribute: string;
  type: string;
  rawType?: string | null;
  message: string;
  options?: Record<string, unknown>;
}

export class NestedError extends ActiveModelError {
  readonly innerError: ErrorLike;

  constructor(
    base: object | null,
    innerError: ErrorLike,
    overrideOptions?: { attribute?: string; type?: string },
  ) {
    const attribute = overrideOptions?.attribute ?? innerError.attribute;
    const type = overrideOptions?.type ?? innerError.type;
    super(base, attribute, type, innerError.options ?? {}, innerError.rawType ?? null);
    this.innerError = innerError;
  }

  override get message(): string {
    return this.innerError.message;
  }
}
