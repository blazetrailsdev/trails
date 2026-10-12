import { IndexError } from "./index-error.js";

/**
 * Ruby's core `StopIteration` (`vendor/ruby/v3.3.11/enumerator.c:4578`), which
 * `Enumerator#next` raises once the iteration has reached its end.
 *
 * @noRailsEquivalent PERMANENT
 */
export class StopIteration extends IndexError {}

StopIteration.prototype.name = "StopIteration";
