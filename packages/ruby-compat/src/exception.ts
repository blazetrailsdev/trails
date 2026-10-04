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

/**
 * `exc_setup_message` and `exc_setup_cause`
 * (`vendor/ruby/v3.3.11/eval.c:506`, `:480`), the cause half of `raise`: an
 * exception raised with no `cause:` takes `$!` as its cause unless it already
 * carries one or is `$!` itself. JS has no `$!`, so the exception being
 * rescued is passed as `errinfo`.
 *
 * @noRailsEquivalent PERMANENT
 */
export function excSetupMessage<T>(mesg: T, errinfo: unknown): T {
  const exc = mesg as { cause?: unknown };
  if (exc.cause === undefined && errinfo != null && errinfo !== mesg) exc.cause = errinfo;
  return mesg;
}
