import { StandardError } from "./standard-error.js";

/**
 * Ruby's core `IndexError` (`vendor/ruby/error.c:3324`) — what `String#[]=`
 * and `String#insert` raise for an offset outside the string
 * (`vendor/ruby/string.c:5393` `rb_str_update_0`), and the superclass of
 * {@link KeyError}.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `IndexError`, which Rails inherits
 * rather than defines.
 */
export class IndexError extends StandardError {}

IndexError.prototype.name = "IndexError";
