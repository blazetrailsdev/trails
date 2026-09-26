/**
 * Ruby's core `Exception` (`vendor/ruby/v3.3.11/error.c:3294` `rb_eException`) — the
 * root every raisable class descends from. A class declared `< Exception`
 * rather than `< StandardError` escapes a bare `rescue => e`, which rescues
 * `StandardError` only.
 *
 * A trails error class that extends `Error` directly is read as a
 * `StandardError`; only a subclass of this one is outside it.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Exception`, which Rails inherits
 * rather than defines.
 */
export class Exception extends Error {}

Exception.prototype.name = "Exception";
