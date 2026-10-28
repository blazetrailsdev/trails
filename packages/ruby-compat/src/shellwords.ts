/**
 * `vendor/ruby/v3.3.11/lib/shellwords.rb:70` — `Shellwords`, answering only the
 * functions trails' ports call.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Shellwords`.
 */
export const Shellwords = {
  /**
   * `vendor/ruby/v3.3.11/lib/shellwords.rb:150` — `Shellwords.escape`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Shellwords.escape`.
   */
  escape(str: unknown): string {
    let s = String(str);

    if (s === "") return "''";

    s = s.replace(/[^A-Za-z0-9_\-.,:+/@\n]/g, "\\$&");

    s = s.replace(/\n/g, "'\n'");

    return s;
  },
};
