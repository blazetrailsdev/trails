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
    base: object | null,
    innerError: ErrorLike,
    options?: { attribute?: string; type?: string },
  ) {
    // Rails `NestedError#initialize`
    // (activemodel/lib/active_model/nested_error.rb:8-15):
    //   @type     = override_options.fetch(:type) { inner_error.type }
    //   @raw_type = inner_error.raw_type
    // Message generation keys off `raw_type`, so i18n lookups still
    // resolve the inner error's original key even when the surface
    // `type` has been renamed via `override_options[:type]`.
    const attribute = options?.attribute ?? innerError.attribute;
    const innerRawType = innerError.rawType ?? innerError.type;
    const type = options?.type ?? innerError.type;
    super(base, attribute, type, innerError.options ?? {}, innerRawType);
    this.innerError = innerError;
  }

  override get message(): string {
    return this.innerError.message;
  }
}
