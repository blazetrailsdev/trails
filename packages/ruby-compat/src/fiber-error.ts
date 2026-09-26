import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `FiberError` (`vendor/ruby/v3.3.11/cont.c:3532`), a `StandardError`
 * subclass — what `Fiber#resume` raises for a terminated, current, resumed or
 * cross-thread fiber (`vendor/ruby/v3.3.11/cont.c:2751-2994`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `FiberError`, which Rails inherits
 * rather than defines.
 */
export class FiberError extends StandardError {}

FiberError.prototype.name = "FiberError";
