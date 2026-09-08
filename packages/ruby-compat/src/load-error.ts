/**
 * Ruby's core `LoadError` (`vendor/ruby/error.c:3342`) — a `ScriptError`, not
 * a `StandardError`, raised by `require` when the file cannot be found. Its
 * message is built by `rb_load_fail` (`vendor/ruby/load.c:1154`) as
 * `cannot load such file -- <path>`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `LoadError`, which Rails inherits
 * rather than defines.
 */
export class LoadError extends Error {}

LoadError.prototype.name = "LoadError";
