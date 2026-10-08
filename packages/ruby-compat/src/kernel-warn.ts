import { ArgumentError } from "./argument-error.js";
import { stderr } from "./process-adapter.js";
import { verbose } from "./verbose.js";

const WARNING_CATEGORIES: Record<string, boolean> = {
  ":deprecated": false,
  ":experimental": true,
  ":performance": false,
};

/**
 * `Kernel#warn` (`vendor/ruby/v3.3.11/warning.rb:50-52`, `error.c:555` `rb_warn_m`), which
 * writes nothing at all while `$VERBOSE` is `nil` (`error.c:561`, `!NIL_P(ruby_verbose)`) —
 * `false` still warns, so the guard is against `nil` alone — and terminates each
 * message with a newline where it lacks one (`error.c:573`).
 *
 * `category:` names a warning category (`error.c:168` `rb_warning_category_from_name`) and a
 * disabled one writes nothing (`error.c:157,198`); `:deprecated` and `:performance` start disabled.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#warn`, which Rails calls without
 * defining.
 */
export function warn(...msgs: (string | { category?: string | null })[]): void {
  const last = msgs[msgs.length - 1];
  const { category = null } = typeof last === "object" ? (msgs.pop() as typeof last) : {};
  if (msgs.length === 0 || verbose() == null) return;
  if (category != null) {
    if (!(category in WARNING_CATEGORIES)) throw new ArgumentError(`unknown category: ${category}`);
    if (!WARNING_CATEGORIES[category]) return;
  }
  stderr.write((msgs as string[]).map((msg) => (msg.endsWith("\n") ? msg : `${msg}\n`)).join(""));
}
