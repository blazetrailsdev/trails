import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `EncodingError` (`vendor/ruby/error.c:3371` `rb_eEncodingError`),
 * a `StandardError` subclass — the category every encoding failure is rescued
 * by, and the superclass the three `Encoding::` transcoding errors are defined
 * under (`vendor/ruby/transcode.c:4505-4507`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `EncodingError`, which Rails
 * inherits rather than defines.
 */
export class EncodingError extends StandardError {
  constructor(message?: string) {
    super(message ?? new.target.name);
    this.name = new.target.name;
  }
}
