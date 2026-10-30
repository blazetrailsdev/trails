import { ArgumentError } from "./argument-error.js";
import { rbInspect } from "./object.js";

/**
 * `vendor/ruby/v3.3.11/lib/shellwords.rb:70` — `Shellwords`, answering only the
 * functions trails' ports call.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Shellwords`.
 */
export const Shellwords = {
  /**
   * `vendor/ruby/v3.3.11/lib/shellwords.rb:90` — `Shellwords.shellsplit`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Shellwords.shellwords`.
   */
  shellwords(line: string): string[] {
    const words: string[] = [];
    let field = "";
    const re =
      /[ \t\r\n\f\v]*(?:([^ \t\r\n\f\v\\'"]+)|'([^']*)'|"((?:[^"\\]|\\.)*)"|(\\.?)|([^ \t\r\n\f\v]))([ \t\r\n\f\v]|$(?![\s\S]))?/gsy;
    for (const [, word, sq, dq, esc, garbage, sep] of line.matchAll(re)) {
      if (garbage !== undefined) throw new ArgumentError(`Unmatched quote: ${rbInspect(line)}`);
      field += word ?? sq ?? dq?.replace(/\\([$`"\\\n])/g, "$1") ?? esc.replace(/\\(.)/gs, "$1");
      if (sep !== undefined) {
        words.push(field);
        field = "";
      }
    }
    return words;
  },

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
