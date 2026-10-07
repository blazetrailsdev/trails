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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Exception extends Error {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Exception {
  /** @noRailsEquivalent PERMANENT */
  detailedMessage(opt?: { highlight?: boolean | null } | null): string;
}

Exception.prototype.name = "Exception";

/**
 * `exc_setup_message` and `exc_setup_cause`
 * (`vendor/ruby/v3.3.11/eval.c:506`, `:480`), the cause half of `raise`: an
 * exception raised with no `cause:` takes `$!` as its cause unless its cause
 * is already defined or it is `$!` itself, and a `$!` whose own cause is not
 * defined has it settled as `nil`. JS has no `$!`, so the exception being
 * rescued is passed as `errinfo`; a defined cause is an own `cause` property.
 *
 * @noRailsEquivalent PERMANENT
 */
export function excSetupMessage<T>(mesg: T, errinfo: unknown): T {
  if (mesg === null || typeof mesg !== "object" || Object.hasOwn(mesg, "cause")) return mesg;
  if (errinfo != null && errinfo !== mesg) {
    (mesg as { cause?: unknown }).cause = errinfo;
    if (typeof errinfo === "object" && !Object.hasOwn(errinfo, "cause")) {
      (errinfo as { cause?: unknown }).cause = null;
    }
  }
  return mesg;
}
