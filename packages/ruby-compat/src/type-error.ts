import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `TypeError` (`vendor/ruby/error.c:3322`) — what an implicit
 * conversion failure and `Integer()`/`Float()` raise. It extends
 * `StandardError`, mirroring Ruby's `TypeError < StandardError`, rather than the
 * native `TypeError`, because JS reserves that name for its own runtime faults
 * and callers rescue this one by class.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `TypeError`, which Rails inherits
 * rather than defines.
 */
export class TypeError extends StandardError {
  constructor(message: string = "TypeError") {
    super(message);
    this.name = "TypeError";
  }
}
