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
 * `uplevel:` prefixes the output with `path:line: warning: ` for the frame that many levels above
 * the caller (`error.c:563-586`), or with a bare `warning: ` where there is no such frame, and
 * raises `ArgumentError` for a negative level (`error.c:565-567`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Kernel#warn`, which Rails calls without
 * defining.
 */
export function warn(
  ...msgs: (string | { uplevel?: number | null; category?: string | null })[]
): void {
  const last = msgs[msgs.length - 1];
  const { uplevel = null, category = null } =
    typeof last === "object" ? (msgs.pop() as typeof last) : {};
  if (msgs.length === 0 || verbose() == null) return;
  let location: RegExpExecArray | null = null;
  if (uplevel != null) {
    if (uplevel < 0) throw new ArgumentError(`negative level (${uplevel})`);
    const frame = new Error().stack?.split("\n")[2 + uplevel] ?? "";
    location = /(?:\(|at )(?:file:\/\/)?([^()\s]+):(\d+):\d+\)?$/.exec(frame.trim());
  }
  if (category != null) {
    if (!(category in WARNING_CATEGORIES)) throw new ArgumentError(`unknown category: ${category}`);
    if (!WARNING_CATEGORIES[category]) return;
  }
  const str =
    uplevel == null
      ? ""
      : location == null
        ? "warning: "
        : `${location[1]}:${location[2]}: warning: `;
  stderr.write(
    str + (msgs as string[]).map((msg) => (msg.endsWith("\n") ? msg : `${msg}\n`)).join(""),
  );
}
