/**
 * ActionDispatch::QueryParser
 *
 * Parses application/x-www-form-urlencoded query strings into key/value pairs.
 *
 * Departs from WHATWG's specified parsing algorithm by giving a null value
 * for keys that do not use `=`. Callers that need the standard's
 * interpretation can coerce with `v ?? ""`.
 *
 * Rack 3 only — the Rack 2 semicolon-compat branch is omitted (trails targets
 * Rack 3 exclusively, see `action-dispatch/constants.ts`).
 */

const DEFAULT_SEP = /& */;
const COMMON_SEP: Record<string, RegExp> = Object.assign(Object.create(null), {
  ";": /; */,
  ";,": /[;,] */,
  "&": /& */,
  "&;": /[&;] */,
});

export type QueryPair = [string, string | null];

export class QueryParser {
  /**
   * Mirrors Rails' `cattr_accessor :strict_query_string_separator`.
   *
   * Under Rack 3 this toggle is a no-op (matching Rails behavior on
   * Rack 3): Rails' `each_pair` only consults it inside the
   * `SEMICOLON_COMPAT` elsif branch, which is unreachable when
   * `Rack::QueryParser::DEFAULT_SEP` doesn't include `;` — i.e. on
   * Rack 3. Surface is preserved for source-level parity and for
   * callers that pre-set it on the assumption of forward Rack 4 work.
   */
  static strictQueryStringSeparator: boolean | null = null;

  static *eachPair(s: string | null | undefined, separator?: string | null): Generator<QueryPair> {
    const str = s ?? "";

    let splitter: RegExp;
    if (separator) {
      splitter = COMMON_SEP[separator] ?? new RegExp(`[${escapeChars(separator)}] *`);
    } else {
      splitter = DEFAULT_SEP;
    }

    for (const part of str.split(splitter)) {
      if (part === "") continue;

      const eq = part.indexOf("=");
      let k: string;
      let v: string | null;
      if (eq === -1) {
        k = part;
        v = null;
      } else {
        k = part.slice(0, eq);
        v = part.slice(eq + 1);
      }

      k = decodeFormComponent(k);
      if (v !== null) v = decodeFormComponent(v);

      yield [k, v];
    }
  }
}

function escapeChars(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function decodeFormComponent(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, " "));
}
