import { Exception } from "./exception.js";

/**
 * Ruby's core `LoadError` (`vendor/ruby/v3.3.11/error.c:3342`) — a `ScriptError`, not
 * a `StandardError`, raised by `require` when the file cannot be found. Its
 * message is built by `rb_load_fail` (`vendor/ruby/v3.3.11/load.c:1154`) as
 * `cannot load such file -- <path>`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `LoadError`, which Rails inherits
 * rather than defines.
 */
export class LoadError extends Exception {
  /** Mirrors: Ruby's `LoadError#path` — vendor/ruby/v3.3.11/error.c:3344 `rb_attr(rb_eLoadError, path, ...)`, the feature `require` could not load. */
  path: string | null = null;
}

LoadError.prototype.name = "LoadError";
