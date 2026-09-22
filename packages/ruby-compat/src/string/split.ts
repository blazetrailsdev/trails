import { regexpEscape } from "../regexp.js";

/**
 * Ruby core `String#split` (`vendor/ruby/string.c:8757` `rb_str_split_m`). A nil or
 * `" "` pattern is awk mode (leading whitespace dropped, runs of whitespace
 * separate); a String pattern is literal; captures are spliced into the
 * result; `limit` 0 drops trailing empty fields, a positive `limit` caps the
 * field count, a negative one keeps everything.
 *
 * @noRailsEquivalent PERMANENT
 */
export function stringSplit(
  string: string,
  pattern: string | RegExp | null = null,
  limit: number = 0,
): string[] {
  if (limit === 1) return string.length === 0 ? [] : [string];
  if (pattern == null || pattern === " ") {
    string = string.replace(/^\s+/, "");
    pattern = /\s+/;
  }
  const source = typeof pattern === "string" ? regexpEscape(pattern) : pattern.source;
  const flags = typeof pattern === "string" ? "" : pattern.flags.replace(/[gyu]/g, "");
  const re = new RegExp(source, `${flags}gu`);
  const result: string[] = [];
  let beg = 0;
  let fields = 0;
  for (const m of string.matchAll(re)) {
    if (limit > 0 && fields >= limit - 1) break;
    if (m[0].length === 0 && (m.index === beg || m.index === string.length)) continue;
    result.push(string.slice(beg, m.index));
    fields++;
    for (const capture of m.slice(1)) if (capture !== undefined) result.push(capture);
    beg = m.index + m[0].length;
  }
  if (string.length === 0) return result;
  result.push(string.slice(beg));
  if (limit === 0) while (result.length > 0 && result[result.length - 1] === "") result.pop();
  return result;
}
