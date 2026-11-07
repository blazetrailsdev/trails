import { cattrAccessor } from "@blazetrails/activesupport";
import { deprecator } from "../deprecator.js";
import { QueryParser as RackQueryParser } from "@blazetrails/rack";
import { toEnum, URI, type Enumerator } from "@blazetrails/ruby-compat";

const DEFAULT_SEP = /& */;
const COMPAT_SEP = /[&;] */;
const COMMON_SEP: Record<string, RegExp> = Object.assign(Object.create(null), {
  ";": /; */,
  ";,": /[;,] */,
  "&": /& */,
  "&;": /[&;] */,
});

const SEMICOLON_COMPAT =
  RackQueryParser.DEFAULT_SEP != null && RackQueryParser.DEFAULT_SEP.source.includes(";");

export type QueryPair = [string, string | null];

export class QueryParser {
  declare static strictQueryStringSeparator: boolean | null | undefined;
  declare strictQueryStringSeparator: boolean | null | undefined;

  static {
    cattrAccessor.call(this, "strictQueryStringSeparator");
  }

  static eachPair(s: string | null | undefined, separator?: string | null): Enumerator<QueryPair>;
  static eachPair(
    s: string | null | undefined,
    separator: string | null | undefined,
    block: (k: string, v: string | null) => void,
  ): null;
  static eachPair(
    s: string | null | undefined,
    separator: string | null = null,
    block?: (k: string, v: string | null) => void,
  ): Enumerator<QueryPair> | null {
    if (!block) return toEnum(this, "eachPair", s, separator);

    s ??= "";

    let splitter: RegExp;
    if (separator) {
      splitter = COMMON_SEP[separator] ?? new RegExp(`[${escapeChars(separator)}] *`);
    } else if (this.strictQueryStringSeparator) {
      splitter = DEFAULT_SEP;
    } else if (SEMICOLON_COMPAT && s.includes(";")) {
      if (this.strictQueryStringSeparator == null) {
        deprecator().warn(
          "Using semicolon as a query string separator is deprecated and will not be supported in Rails 8.1 or Rack 3.0. Use `&` instead.",
        );
      }
      splitter = COMPAT_SEP;
    } else {
      splitter = DEFAULT_SEP;
    }

    for (const part of s.split(splitter)) {
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

      k = URI.decodeWwwFormComponent(k);
      if (v !== null) v = URI.decodeWwwFormComponent(v);

      block(k, v);
    }

    return null;
  }
}

function escapeChars(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}
