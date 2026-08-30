/**
 * Ruby's core `ArgumentError` (`vendor/ruby/error.c:1345` `rb_eArgError`) — the
 * error `Comparable`'s derived operators raise through `rb_cmperr`
 * (`vendor/ruby/compar.c:28`) for an operand `<=>` cannot place. It lives here
 * because `comparable.ts` raises it and this package takes no workspace
 * dependencies; `@blazetrails/date` re-exports it so its own public surface is
 * unchanged.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `ArgumentError`, which Rails
 * inherits rather than defines.
 */
export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}
