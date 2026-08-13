/**
 * MRI's `rb_warning` and the `$VERBOSE` global it reads, the seam ruby/date
 * emits from at the twelve sites where it silently drops an argument it cannot
 * use (`date_core.c`, e.g. `:8304` `"invalid offset is ignored"`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core, not Rails. `date_core.c` calls
 * `rb_warning` (`error.c`) directly and there is no Rails counterpart for a
 * port to converge on.
 */

/**
 * MRI's `ruby_verbose`, the storage behind Ruby's `$VERBOSE`. `nil` and `false`
 * both silence {@link rbWarning}; only `true` lets one through, which is why a
 * normal run never sees these.
 */
let rubyVerbose: boolean | null = false;

/**
 * Assigns `$VERBOSE`. A `set`-prefixed method rather than a setter because
 * `$VERBOSE` is a global variable, not a member of any object.
 */
export function setRubyVerbose(value: boolean | null): void {
  rubyVerbose = value;
}

/** Reads `$VERBOSE`. */
export function getRubyVerbose(): boolean | null {
  return rubyVerbose;
}

/**
 * MRI's `rb_warning` (`error.c`): writes to `$stderr` under `RTEST(ruby_verbose)`
 * only — `$VERBOSE == true` — so it is silent both by default and under
 * `$VERBOSE = nil`. MRI prefixes the message with the source position it was
 * raised from; there is none to carry here, so the `"warning: "` prefix stands
 * alone.
 */
export function rbWarning(mesg: string): void {
  if (rubyVerbose !== true) return;
  console.warn(`warning: ${mesg}`);
}
