/**
 * Ruby's core `ArgumentError` (`vendor/ruby/error.c:3323` `rb_eArgError`) —
 * what `Comparable`'s derived operators raise through `rb_cmperr`
 * (`vendor/ruby/compar.c:28`). `@blazetrails/date` re-exports it so its own
 * public surface is unchanged.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `ArgumentError`, which Rails
 * inherits rather than defines.
 */
export class ArgumentError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ArgumentError";
  }
}
