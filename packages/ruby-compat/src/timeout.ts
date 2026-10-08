import { rbModConstSet } from "./include.js";
import { RuntimeError } from "./runtime-error.js";

/**
 * Ruby's `Timeout` module (`vendor/ruby/v3.3.11/lib/timeout.rb:25`).
 *
 * @noRailsEquivalent PERMANENT
 */
export const Timeout = { name: "Timeout" } as { readonly name: string; Error: typeof TimeoutError };

/**
 * Ruby's `Timeout::Error` (`vendor/ruby/v3.3.11/lib/timeout.rb:36`), a
 * `RuntimeError`.
 *
 * @noRailsEquivalent PERMANENT
 */
class TimeoutError extends RuntimeError {}

TimeoutError.prototype.name = "Timeout::Error";

rbModConstSet(Timeout, "Error", TimeoutError);
