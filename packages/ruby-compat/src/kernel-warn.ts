import { stderr } from "./process-adapter.js";
import { verbose } from "./verbose.js";

/**
 * `Kernel#warn` (`vendor/ruby/v3.3.11/warning.rb:50-52`, `error.c:555` `rb_warn_m`), which
 * writes nothing at all while `$VERBOSE` is `nil` (`error.c:561`, `!NIL_P(ruby_verbose)`) —
 * `false` still warns, so the guard is against `nil` alone — and terminates each
 * message with a newline where it lacks one (`error.c:573`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#warn`, which Rails calls without
 * defining.
 */
export function warn(...msgs: string[]): void {
  if (msgs.length === 0 || verbose() == null) return;
  stderr.write(msgs.map((msg) => (msg.endsWith("\n") ? msg : `${msg}\n`)).join(""));
}
