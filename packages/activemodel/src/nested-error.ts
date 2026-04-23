import { deepDup } from "@blazetrails/activesupport";
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

  /**
   * Preserve the NestedError wrapper + deep-dup the wrapped inner error.
   *
   * Rails' `deep_dup` keeps the dynamic class and recurses through ivars,
   * so a duplicated NestedError gets an independent inner error too —
   * without this, a copy would still share mutable `innerError` state
   * (options, attribute, type) with the source and contradict the
   * deep-dup semantics documented for `Errors#copy!`.
   *
   * Inner error's own `base` is preserved (the inner error belongs to the
   * inner model, not the outer one) — only the NestedError's base changes.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override dupWithBase(newBase: any): NestedError {
    const inner = this.innerError;
    const innerDup: ErrorLike =
      inner instanceof ActiveModelError
        ? inner.dupWithBase(inner.base)
        : {
            attribute: inner.attribute,
            type: inner.type,
            rawType: inner.rawType,
            message: inner.message,
            options: deepDup(inner.options ?? {}),
          };
    return new NestedError(newBase, innerDup, { attribute: this.attribute });
  }
}
